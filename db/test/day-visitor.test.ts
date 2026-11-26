import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { dayVisitorResolver, fetchDaySalt } from '../../src/lib/events/dayVisitor.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

const request = (forwardedFor: string | null, userAgent = UA): Headers => {
    const headers = new Headers({ 'user-agent': userAgent });

    if (forwardedFor !== null) headers.set('x-forwarded-for', forwardedFor);

    return headers;
};

/**
 * The daily visitor key (src/lib/events/dayVisitor) on a migrated database,
 * run as the runtime role, so migration 0031's `day_salt` table and the
 * default grants are exercised too.
 */
test('daily visitor keys', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());
    const admin = database.adminPool();
    const days = async () =>
        (
            await admin.query<{ day: string }>(
                `select to_char(day, 'YYYY-MM-DD') as day from day_salt order by day`,
            )
        ).rows.map(({ day }) => day);

    await t.test('a new day gets a new salt and deletes the earlier days', async () => {
        const first = await Promise.all([
            fetchDaySalt(db, '2026-11-24'),
            fetchDaySalt(db, '2026-11-24'),
        ]);

        assert.equal(first[0].length, 32);
        assert.deepEqual(first[0], first[1]);
        assert.deepEqual(await fetchDaySalt(db, '2026-11-24'), first[0]);

        const next = await fetchDaySalt(db, '2026-11-25');

        assert.notDeepEqual(next, first[0]);
        assert.deepEqual(await days(), ['2026-11-25']);

        await assert.rejects(fetchDaySalt(db, '2026-11-24'));
        assert.deepEqual(await days(), ['2026-11-25']);
    });

    await t.test('a key holds for one address bucket and user agent within a day', async () => {
        let now = new Date('2026-11-26T00:00:01Z');
        const resolve = dayVisitorResolver(db, 0, () => now);
        // Two addresses in one /64, so one limiter bucket.
        const morning = await resolve(request('2001:db8:1:2::10'));

        now = new Date('2026-11-26T23:59:59Z');

        const evening = await resolve(request('203.0.113.9, 2001:db8:1:2::99'));

        assert.match(morning ?? '', /^[0-9a-f]{32}$/);
        assert.equal(evening, morning);
        assert.notEqual(await resolve(request('2001:db8:1:3::10')), morning);
        assert.notEqual(await resolve(request('2001:db8:1:2::10', `${UA} Edg/131`)), morning);

        now = new Date('2026-11-27T00:00:00Z');

        assert.notEqual(await resolve(request('2001:db8:1:2::10')), morning);
        assert.deepEqual(await days(), ['2026-11-27']);
    });

    await t.test('a request without a client address has no key', async () => {
        const resolve = dayVisitorResolver(db, 0);

        assert.equal(await resolve(null), null);
        assert.equal(await resolve(request(null)), null);
        assert.equal(await resolve(request('not-an-address')), null);
        assert.equal(
            await dayVisitorResolver(db, { problem: 'bad hops' })(request('203.0.113.9')),
            null,
        );
    });
});
