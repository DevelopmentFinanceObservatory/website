import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import {
    countHit,
    pruneCounters,
    refundReservation,
    reserveHit,
} from '../../src/lib/proxy/limitCounter.ts';
import { refundPrompt, spendPrompt } from '../../src/lib/studio/spendPrompt.ts';
import { GUEST_PROMPTS, USER_DAILY_PROMPTS } from '../../src/lib/studio/promptAllowance.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const DAY_S = 86_400;

/**
 * The shared limiter (src/lib/proxy/limitCounter) and the Studio's prompt
 * allowances on top of it (src/lib/studio/spendPrompt), run as the runtime
 * role on a migrated database, so migration 0017's table and the default
 * grants are exercised too.
 */
test('limit counters and Studio prompt allowances', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const runtimePool = database.runtimePool();
    const db = drizzle(runtimePool);
    const admin = database.adminPool();

    const windowStartOf = async (key: string) =>
        (
            await admin.query<{ window_start: Date }>(
                'select window_start from limit_counter where key = $1',
                [key],
            )
        ).rows[0]?.window_start;

    await t.test('the call past the limit in a window is refused', async () => {
        const verdicts = [];

        for (let i = 0; i < 4; i++) {
            verdicts.push(await countHit(db, 'api:203.0.113.7', 3, 60));
        }

        assert.deepEqual(
            verdicts.map(({ allowed, remaining }) => [allowed, remaining]),
            [
                [true, 2],
                [true, 1],
                [true, 0],
                [false, 0],
            ],
        );
        assert.ok(verdicts.every(({ reset }) => reset > 0 && reset <= 60));
        assert.equal((await countHit(db, 'api:203.0.113.8', 3, 60)).allowed, true);
    });

    await t.test('a row from an earlier window starts over', async () => {
        await countHit(db, 'api:198.51.100.1', 1, 60);
        await admin.query(
            `update limit_counter set window_start = window_start - interval '60 seconds'
             where key = $1`,
            ['api:198.51.100.1'],
        );

        assert.equal((await countHit(db, 'api:198.51.100.1', 1, 60)).allowed, true);
    });

    await t.test('a hit never moves a row back a window', async () => {
        // Another instance's hit has already opened the next window.
        await countHit(db, 'api:198.51.100.2', 2, 60);
        await admin.query(
            `update limit_counter set window_start = window_start + interval '60 seconds'
             where key = $1`,
            ['api:198.51.100.2'],
        );
        const ahead = await windowStartOf('api:198.51.100.2');

        assert.equal((await countHit(db, 'api:198.51.100.2', 2, 60)).remaining, 0);
        assert.deepEqual(await windowStartOf('api:198.51.100.2'), ahead);
    });

    await t.test('concurrent hits on one key lose none', async () => {
        const handles = Array.from({ length: 6 }, () => drizzle(database.runtimePool()));
        const verdicts = await Promise.all(
            handles.map((handle) => countHit(handle, 'api:192.0.2.1', 100, 60)),
        );

        assert.deepEqual(
            verdicts.map(({ remaining }) => remaining).sort((a, b) => a - b),
            [94, 95, 96, 97, 98, 99],
        );
    });

    await t.test(
        'concurrent reservations stop at the limit and refused reservations spend nothing',
        async () => {
            const key = 'studio-user:atomic-reservation';
            const handles = Array.from({ length: 6 }, () => drizzle(database.runtimePool()));
            const reservations = await Promise.all(
                handles.map((handle) => reserveHit(handle, key, 2, 60)),
            );
            const admitted = reservations.filter((reservation) => reservation.admitted);

            assert.equal(admitted.length, 2);
            assert.equal(reservations.filter((reservation) => !reservation.admitted).length, 4);
            assert.equal(
                (
                    await admin.query<{ count: number }>(
                        'select count from limit_counter where key = $1',
                        [key],
                    )
                ).rows[0]?.count,
                2,
            );

            const first = admitted[0]!;
            await refundReservation(db, first.receipt);

            assert.equal((await reserveHit(db, key, 2, 60)).admitted, true);
        },
    );

    await t.test('a reservation receipt cannot refund a new-day spend', async () => {
        const key = 'studio-user:window-receipt';
        await admin.query('create schema review_clock');
        await admin.query(`create function review_clock.now() returns timestamptz
            language sql stable as $$ select current_setting('review.clock')::timestamptz $$`);
        await admin.query(`grant usage on schema review_clock to "${database.runtimeUser}"`);
        await runtimePool.query('set search_path to review_clock, public, pg_catalog');

        const setClock = (clock: string) =>
            runtimePool.query("select set_config('review.clock', $1, false)", [clock]);

        try {
            await setClock('2026-10-20T23:59:59Z');
            const first = await reserveHit(db, key, 2, DAY_S);
            assert.ok(first.admitted);

            // The first turn reports failure after a new-day turn has already
            // reserved its prompt.
            await setClock('2026-10-21T00:00:01Z');
            assert.equal((await reserveHit(db, key, 2, DAY_S)).admitted, true);
            await refundReservation(db, first.receipt);

            assert.equal(
                (
                    await admin.query<{ count: number }>(
                        'select count from limit_counter where key = $1',
                        [key],
                    )
                ).rows[0]?.count,
                1,
            );
        } finally {
            await runtimePool.query('reset search_path');
        }
    });

    await t.test('a day-long window ends at 00:00 UTC', async () => {
        await countHit(db, 'studio-user:window', 1, DAY_S);
        const start = await windowStartOf('studio-user:window');

        assert.equal(start?.toISOString().slice(11), '00:00:00.000Z');
    });

    await t.test('pruning deletes counters idle for two days and keeps the rest', async () => {
        await countHit(db, 'api:192.0.2.50', 1, 60);
        await countHit(db, 'api:192.0.2.51', 1, 60);
        await admin.query(
            `update limit_counter set window_start = now() - interval '3 days' where key = $1`,
            ['api:192.0.2.50'],
        );

        await pruneCounters(db);

        const { rows } = await admin.query<{ key: string }>(
            `select key from limit_counter where key like 'api:192.0.2.5%' order by key`,
        );
        assert.deepEqual(
            rows.map(({ key }) => key),
            ['api:192.0.2.51'],
        );
    });

    await t.test('a guest past the allowance is refused whatever the browser', async () => {
        // spendPrompt reads nothing from the browser, so a cleared or
        // private one is the same caller as long as the address is.
        for (let i = 0; i < GUEST_PROMPTS; i++) {
            assert.equal((await spendPrompt(db, { address: '203.0.113.20' })).refusal, null);
        }

        const refusal = (await spendPrompt(db, { address: '203.0.113.20' })).refusal;

        assert.equal(refusal?.error, 'resource_exhausted');
        assert.equal(refusal?.retry, 'do_not_retry');
        assert.ok(refusal!.retry_after_seconds! > 0 && refusal!.retry_after_seconds! <= DAY_S);
        assert.equal((await spendPrompt(db, { address: '203.0.113.21' })).refusal, null);
    });

    await t.test('a guest rotating addresses inside one IPv6 /64 is refused', async () => {
        for (let i = 0; i < GUEST_PROMPTS; i++) {
            assert.equal(
                (await spendPrompt(db, { address: `2001:db8:1:2::${i + 1}` })).refusal,
                null,
            );
        }

        const refusal = (await spendPrompt(db, { address: '2001:db8:1:2::ffff' })).refusal;

        assert.equal(refusal?.error, 'resource_exhausted');
    });

    await t.test('a refunded prompt is spent again, within its own window only', async () => {
        const guest = { address: '203.0.113.30' };

        const firstSpend = await spendPrompt(db, guest);
        assert.ok(firstSpend.receipt);

        for (let i = 1; i < GUEST_PROMPTS; i++) {
            await spendPrompt(db, guest);
        }

        await refundPrompt(db, firstSpend.receipt);
        assert.equal((await spendPrompt(db, guest)).refusal, null);
        assert.equal((await spendPrompt(db, guest)).refusal?.error, 'resource_exhausted');

        // A refund that lands after the row moved to a new day gives nothing.
        await admin.query(
            `update limit_counter set window_start = window_start + interval '1 day'
             where key = $1`,
            ['studio-guest:203.0.113.30'],
        );
        await refundPrompt(db, firstSpend.receipt);
        const { rows } = await admin.query<{ count: number }>(
            'select count from limit_counter where key = $1',
            ['studio-guest:203.0.113.30'],
        );
        assert.equal(rows[0]?.count, GUEST_PROMPTS);
    });

    await t.test('a signed-in user past the daily allowance is refused', async () => {
        // Signing in after the guest wall opens the user's own allowance.
        assert.equal((await spendPrompt(db, { userId: 'user-a' })).refusal, null);

        for (let i = 1; i < USER_DAILY_PROMPTS; i++) {
            await spendPrompt(db, { userId: 'user-a' });
        }

        const refusal = (await spendPrompt(db, { userId: 'user-a' })).refusal;

        assert.equal(refusal?.error, 'resource_exhausted');
        assert.equal(refusal?.retry, 'retry_after_delay');
        assert.ok(refusal!.retry_after_seconds! > 0 && refusal!.retry_after_seconds! <= DAY_S);
        assert.equal((await spendPrompt(db, { userId: 'user-b' })).refusal, null);
    });
});
