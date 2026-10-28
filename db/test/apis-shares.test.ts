import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import {
    createOwnedShare,
    ownerShareWrite,
    type SharesBackend,
} from '../../src/lib/chat/apisShares.ts';
import { putShareToken, readShareToken } from '../../src/lib/chat/shareTokens.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

type Call = { url: string; method: string; token: string | null };

// A dfo-apis that answers each call with `answer`, recording the method,
// path, and the write token it was sent.
const backendOf = (answer: (call: Call) => Response) => {
    const calls: Call[] = [];
    const backend: SharesBackend = {
        base: 'https://apis.example',
        nameCaller: () => {},
        fetch: async (input, init) => {
            const call = {
                url: String(input).replace('https://apis.example', ''),
                method: init?.method ?? 'GET',
                token: new Headers(init?.headers).get('x-dfo-write-token'),
            };

            calls.push(call);

            return answer(call);
        },
    };

    return { backend, calls };
};

const created = () =>
    Response.json({ id: 'Ab3dEf7h', write_token: 'shw_made', revision: 1 }, { status: 201 });

/**
 * `createOwnedShare` and `ownerShareWrite` against the migrated tables as
 * the runtime role and a stubbed dfo-apis: a signed-in maker's token is kept
 * and sent back on their writes, a guest's is not kept, and a caller with no
 * token, or whose token dfo-apis refuses, gets `not_found`.
 */
test('owner writes to shares held in dfo-apis', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());

    await db.insert(user).values([
        { id: 'owner', name: 'O', email: 'o@one.org' },
        { id: 'other', name: 'X', email: 'x@one.org' },
    ]);

    const body = { kind: 'canvas' as const, latest: true, title: 'T', cards: [], payload: {} };

    await t.test("a signed-in maker's token is kept, and a guest's is not", async () => {
        const { backend } = backendOf(created);

        assert.deepEqual(await createOwnedShare({ db, backend }, 'owner', body), {
            id: 'Ab3dEf7h',
        });
        assert.equal(
            await readShareToken(db, { shareId: 'Ab3dEf7h', userId: 'owner' }),
            'shw_made',
        );

        await database.runtimePool().query('delete from share_token');
        await createOwnedShare({ db, backend }, null, body);
        assert.equal(
            (await database.runtimePool().query('select count(*)::int as n from share_token'))
                .rows[0].n,
            0,
        );
    });

    // dfo-apis' read of a share of `kind`, and its answer to every write.
    const holding =
        (kind: string, write: () => Response = () => Response.json({ id: 'Ab3dEf7h' })) =>
        (call: Call) =>
            call.method === 'GET'
                ? Response.json({
                      id: 'Ab3dEf7h',
                      kind,
                      mode: 'live',
                      title: null,
                      slots: [],
                      payload: null,
                      created_at: '2026-10-28T10:00:00Z',
                  })
                : write();

    await t.test("a switch to snapshot sends the owner's token and keeps it", async () => {
        await putShareToken(db, { shareId: 'Ab3dEf7h', userId: 'owner', writeToken: 'shw_made' });

        const { backend, calls } = backendOf(holding('canvas'));
        const write = { shareId: 'Ab3dEf7h', userId: 'owner' };

        assert.equal(
            await ownerShareWrite({ db, backend }, { ...write, action: 'snapshot' }),
            'done',
        );
        assert.deepEqual(calls, [
            { url: '/api/presentation/shares/Ab3dEf7h', method: 'GET', token: null },
            {
                url: '/api/presentation/shares/Ab3dEf7h/snapshot',
                method: 'POST',
                token: 'shw_made',
            },
        ]);
        assert.equal(await readShareToken(db, write), 'shw_made');
    });

    await t.test(
        'a search or conversation share is not switched, and keeps its token',
        async () => {
            for (const kind of ['search', 'conversation']) {
                const { backend, calls } = backendOf(holding(kind));
                const write = { shareId: 'Ab3dEf7h', userId: 'owner' };

                assert.equal(
                    await ownerShareWrite({ db, backend }, { ...write, action: 'snapshot' }),
                    'unsupported_kind',
                    kind,
                );
                assert.deepEqual(
                    calls.map(({ method }) => method),
                    ['GET'],
                    kind,
                );
                assert.equal(await readShareToken(db, write), 'shw_made', kind);
            }
        },
    );

    await t.test(
        'a switch refused for a reason of its own throws its code and keeps the token',
        async () => {
            // A slot's frame is gone, so dfo-apis cannot pin it: the share stays.
            const { backend } = backendOf(
                holding('canvas', () =>
                    Response.json({ code: 'frame_unavailable', retryable: false }, { status: 404 }),
                ),
            );
            const write = { shareId: 'Ab3dEf7h', userId: 'owner' };

            await assert.rejects(
                ownerShareWrite({ db, backend }, { ...write, action: 'snapshot' }),
                {
                    name: 'SharesError',
                    code: 'frame_unavailable',
                },
            );
            assert.equal(await readShareToken(db, write), 'shw_made');
        },
    );

    await t.test('a caller with no token gets not_found and calls nothing', async () => {
        const { backend, calls } = backendOf(() => new Response(null, { status: 204 }));

        assert.equal(
            await ownerShareWrite(
                { db, backend },
                { shareId: 'Ab3dEf7h', userId: 'other', action: 'delete' },
            ),
            'not_found',
        );
        assert.equal(calls.length, 0);
    });

    await t.test('a delete sends the token, then drops it', async () => {
        const { backend, calls } = backendOf(() => new Response(null, { status: 204 }));
        const write = { shareId: 'Ab3dEf7h', userId: 'owner' };

        assert.equal(
            await ownerShareWrite({ db, backend }, { ...write, action: 'delete' }),
            'done',
        );
        assert.deepEqual(calls, [
            { url: '/api/presentation/shares/Ab3dEf7h', method: 'DELETE', token: 'shw_made' },
        ]);
        assert.equal(await readShareToken(db, write), null);
    });

    await t.test('a token dfo-apis refuses, or a share it no longer has, is dropped', async () => {
        for (const [status, code] of [
            [403, 'write_token_invalid'],
            [401, 'write_token_required'],
            [404, 'not_found'],
        ] as const) {
            await putShareToken(db, {
                shareId: 'Ab3dEf7h',
                userId: 'owner',
                writeToken: 'shw_old',
            });

            const { backend } = backendOf(
                holding('canvas', () => Response.json({ code }, { status })),
            );
            const write = { shareId: 'Ab3dEf7h', userId: 'owner' };

            assert.equal(
                await ownerShareWrite({ db, backend }, { ...write, action: 'snapshot' }),
                'not_found',
            );
            assert.equal(await readShareToken(db, write), null, code);
        }
    });

    await t.test('another refusal throws and keeps the token', async () => {
        await putShareToken(db, { shareId: 'Ab3dEf7h', userId: 'owner', writeToken: 'shw_made' });

        const { backend } = backendOf(() =>
            Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }),
        );
        const write = { shareId: 'Ab3dEf7h', userId: 'owner' };

        await assert.rejects(ownerShareWrite({ db, backend }, { ...write, action: 'delete' }), {
            name: 'SharesError',
            code: 'service_unavailable',
        });
        assert.equal(await readShareToken(db, write), 'shw_made');
    });
});
