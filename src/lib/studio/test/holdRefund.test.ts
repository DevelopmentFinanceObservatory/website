/**
 * A hold turn's prompt comes back on a cancel within the refund window, on a
 * migrated database and through the Studio proxy against a stand-in harness:
 * once per turn, only for the turn's own prompter, only for a turn marked
 * with the hold header, and at most HOLD_REFUNDS_PER_DAY times a day. The
 * hold header never reaches the harness.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test from 'node:test';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NextRequest } from 'next/server';

import { applyMigrations } from '../../../../db/apply-migrations.ts';
import { buildCounterPool } from '../../../../db/connection.ts';
import { createTestDatabase } from '../../../../db/test/harness.ts';

// The stand-in harness: each turn gets the next index, each cancel gets
// `cancelAnswer` (204, a Stop acted on, by default), and each request's
// headers are kept so the test can read what crossed the proxy.
const seen: { route: string; headers: IncomingHttpHeaders }[] = [];
const STOPPED = { status: 204, body: '' };
let cancelAnswer = STOPPED;
let nextTurnIndex = 0;
const harness = createServer((req, res) => {
    const route = req.url?.split('?')[0]?.split('/').at(-1) ?? '';

    seen.push({ route, headers: req.headers });
    req.resume();
    req.on('end', () => {
        if (route === 'turn') {
            res.writeHead(200, {
                'content-type': 'text/event-stream',
                'x-dfo-turn-index': String(nextTurnIndex++),
            });
            res.end('data: {}\n\n');

            return;
        }

        res.writeHead(cancelAnswer.status, { 'content-type': 'application/json' });
        res.end(cancelAnswer.body);
    });
});

await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve));
process.env.STUDIO_API_BASE = `http://127.0.0.1:${(harness.address() as AddressInfo).port}`;
process.env.CALLER_HMAC_KEY ??= 'hold-refund-test-key';

const { studioProxy } = await import('../studioProxy.ts');
const { accessDeps } = await import('../../proxy/forward.ts');
const {
    claimHoldTurn,
    HOLD_REFUNDS_PER_DAY,
    promptCounterKey,
    recordHoldTurn,
    refundHoldTurn,
    spendPrompt,
} = await import('../spendPrompt.ts');

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../db/migrations');

test('hold turns: a cancel inside the window gives the prompt back', async (t) => {
    const database = await createTestDatabase();

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const host = process.env.PGHOST ?? 'localhost';
    const port = process.env.PGPORT ?? '5433';
    const pool = buildCounterPool({
        DATABASE_URL: `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${port}/${database.databaseName}`,
    });
    const counters = drizzle(pool);
    const original = { ...accessDeps };

    accessDeps.hitAddress = async (_surface, _ip, limit) => ({
        allowed: true,
        limit,
        remaining: limit,
        reset: 30,
    });
    accessDeps.admit = async (plan) => ({
        refusedBy: null,
        verdicts: {
            minute: { allowed: true, limit: plan.minute.limit, remaining: 1, reset: 30 },
        },
    });

    t.after(async () => {
        Object.assign(accessDeps, original);
        await new Promise((resolve) => harness.close(resolve));
        await pool.end();
        await database.teardown();
    });

    let user = { id: 'u-a', email: 'a@example.org' };
    const handler = studioProxy({
        getUser: async () => user,
        ownersOf: async () => [],
        claimOwner: async (_conversation, userId) => [userId],
        counters,
    });
    const call = (route: string, body: object, headers: Record<string, string> = {}) => {
        const url = `http://site.test/api/v1/studio/${route}`;

        return handler(
            Object.assign(
                new Request(url, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', ...headers },
                    body: JSON.stringify(body),
                }),
                { nextUrl: new URL(url) },
            ) as unknown as NextRequest,
            { params: Promise.resolve({ path: [route] }) },
        );
    };
    const turn = async (conversationId: string, hold: boolean) => {
        const res = await call(
            'turn',
            { kind: 'turn.request', conversation_id: conversationId, message: 'Aid to Kenya' },
            hold ? { 'x-dfo-hold-turn': '1' } : {},
        );

        await res.text();
        assert.equal(res.status, 200);

        return Number(res.headers.get('x-dfo-turn-index'));
    };
    const cancel = async (conversationId: string, turnIndex: number) => {
        const res = await call('cancel', {
            kind: 'turn.cancel',
            conversation_id: conversationId,
            turn_index: turnIndex,
        });

        await res.text();

        return res.headers.get('x-dfo-prompt-refunded');
    };
    // The prompts `email` has spent today.
    const spent = async (email: string) => {
        const { rows } = await counters.execute<{ count: number }>(
            sql`select count from limit_counter where key = ${promptCounterKey({ email })}`,
        );

        return rows[0]?.count ?? 0;
    };

    await t.test('a hold turn cancelled at once is refunded, once', async () => {
        user = { id: 'u-once', email: 'once@example.org' };

        const index = await turn('c-once', true);

        assert.equal(await spent(user.email), 1);
        assert.equal(await cancel('c-once', index), 'true');
        assert.equal(await spent(user.email), 0);
        assert.equal(await cancel('c-once', index), 'false');
        assert.equal(await spent(user.email), 0);
    });

    await t.test('a turn without the hold header is not refunded', async () => {
        user = { id: 'u-plain', email: 'plain@example.org' };

        const index = await turn('c-plain', false);

        assert.equal(await cancel('c-plain', index), 'false');
        assert.equal(await spent(user.email), 1);
    });

    await t.test("another caller's cancel refunds nothing, and leaves the receipt", async () => {
        const owner = { id: 'u-owner', email: 'owner@example.org' };

        user = owner;

        const index = await turn('c-shared', true);

        user = { id: 'u-other', email: 'other@example.org' };
        assert.equal(await cancel('c-shared', index), 'false');
        assert.equal(await spent(owner.email), 1);

        user = owner;
        assert.equal(await cancel('c-shared', index), 'true');
        assert.equal(await spent(owner.email), 0);
    });

    // A failed cancel, and one the harness answers `turn_moved` because it
    // stopped nothing, leave the receipt for a retry the harness acts on.
    await t.test(
        'a cancel that stops nothing refunds nothing, and leaves the receipt',
        async (st) => {
            st.after(() => {
                cancelAnswer = STOPPED;
            });

            const answers = [
                { status: 502, body: '{}' },
                { status: 200, body: JSON.stringify({ code: 'turn_moved', turn_index: 9 }) },
            ];

            for (const [at, answer] of answers.entries()) {
                user = { id: `u-unstopped-${at}`, email: `unstopped-${at}@example.org` };

                const index = await turn(`c-unstopped-${at}`, true);

                cancelAnswer = answer;
                assert.equal(await cancel(`c-unstopped-${at}`, index), 'false', answer.body);
                assert.equal(await spent(user.email), 1, answer.body);

                cancelAnswer = STOPPED;
                assert.equal(await cancel(`c-unstopped-${at}`, index), 'true', answer.body);
                assert.equal(await spent(user.email), 0, answer.body);
            }
        },
    );

    await t.test('the hold header never reaches the harness', () => {
        const turns = seen.filter(({ route }) => route === 'turn');

        assert.ok(turns.length > 0);

        for (const { headers } of seen) {
            assert.equal(headers['x-dfo-hold-turn'], undefined);
        }
    });

    await t.test('a cancel after the deadline refunds nothing', async () => {
        const prompter = { email: 'late@example.org' };
        const late = await spendPrompt(counters, prompter);
        const onTime = await spendPrompt(counters, prompter);

        assert.ok(late.receipt && onTime.receipt);

        await recordHoldTurn(counters, late.receipt, { conversationId: 'c-late', turnIndex: 0 }, 0);
        await recordHoldTurn(counters, onTime.receipt, { conversationId: 'c-late', turnIndex: 1 });

        assert.equal(
            await claimHoldTurn(counters, prompter, { conversationId: 'c-late', turnIndex: 0 }),
            null,
        );
        // A cancel that arrived before the deadline is on time, however long
        // the harness then took to answer it.
        assert.ok(
            await claimHoldTurn(
                counters,
                prompter,
                { conversationId: 'c-late', turnIndex: 0 },
                60_000,
            ),
        );
        assert.ok(
            await claimHoldTurn(counters, prompter, { conversationId: 'c-late', turnIndex: 1 }),
        );
    });

    await t.test('a prompter gets HOLD_REFUNDS_PER_DAY refunds a day', async () => {
        const prompter = { address: '198.51.100.7' };
        const refunds: boolean[] = [];

        for (let turnIndex = 0; turnIndex <= HOLD_REFUNDS_PER_DAY; turnIndex++) {
            const { receipt } = await spendPrompt(counters, prompter);

            assert.ok(receipt);
            await recordHoldTurn(counters, receipt, { conversationId: 'c-cap', turnIndex });

            const paid = await claimHoldTurn(counters, prompter, {
                conversationId: 'c-cap',
                turnIndex,
            });

            assert.ok(paid);
            refunds.push(await refundHoldTurn(counters, paid));
        }

        assert.deepEqual(refunds, [...Array(HOLD_REFUNDS_PER_DAY).fill(true), false]);

        const { rows } = await counters.execute<{ count: number }>(
            sql`select count from limit_counter where key = ${promptCounterKey(prompter)}`,
        );

        assert.equal(rows[0]?.count, 1);
    });
});
