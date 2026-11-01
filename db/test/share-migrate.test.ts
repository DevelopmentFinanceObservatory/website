import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import { fenceShareTokens, putShareToken, readShareToken } from '../../src/lib/chat/shareTokens.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { user } from '../schema.ts';
import type { StoredShare } from '../share-export.ts';
import {
    importOverHttp,
    migrateShare,
    migrateShares,
    type ImportBody,
    type ImportShare,
} from '../share-migrate.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const search = (id: string, owner: string | null): StoredShare => ({
    id,
    kind: 'search',
    mode: 'live',
    user_id: owner,
    created_at: '2026-09-01T10:00:00.000000Z',
    title: 'aid to Kenya',
    data: { query: 'aid to Kenya' },
    parts: [],
});

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

// An import route that records each call and answers with `answer`.
const route = (answer: ImportShare = async () => ({ code: 'imported' })) => {
    const calls: { id: string; body: ImportBody }[] = [];
    const importShare: ImportShare = async (id, body) => {
        calls.push({ id, body });

        return answer(id, body);
    };

    return { calls, importShare };
};

// A guest's share touches no table, so a database that refuses every
// transaction shows it is never asked.
const noDb = {
    transaction: () => {
        throw new Error('a guest share opens no transaction');
    },
};

test("a guest's share goes with a null digest", async () => {
    const { calls, importShare } = route();

    assert.deepEqual(await migrateShare(noDb, search('Guest001', null), importShare), {
        id: 'Guest001',
        code: 'imported',
    });
    assert.deepEqual(calls, [
        {
            id: 'Guest001',
            body: {
                kind: 'search',
                mode: 'live',
                owner: null,
                created_at: '2026-09-01T10:00:00.000000Z',
                title: 'aid to Kenya',
                slots: [],
                payload: { query: 'aid to Kenya', parts: [] },
                write_token_sha256: null,
            },
        },
    ]);
});

/**
 * An owned share against a migrated database as the runtime role: its token
 * is minted once and kept when the call fails, a run again sends the same
 * digest, the owner's row is locked across the call, and a share whose
 * token cannot be stored or whose owner is fenced after it is skipped.
 */
test("an owned share keeps one token and sends its digest under the owner's lock", async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const db = drizzle(database.runtimePool());
    const admin = database.adminPool();

    await db.insert(user).values([
        { id: 'owner', name: 'O', email: 'o@one.org' },
        { id: 'other', name: 'X', email: 'x@one.org' },
        { id: 'fenced', name: 'F', email: 'f@one.org' },
    ]);
    await admin.query(`set lock_timeout = '200ms'`);

    const tokenOf = (shareId: string, userId = 'owner') => readShareToken(db, { shareId, userId });

    // The call fails: the token is kept, and a run again sends its digest.
    const down = route(async () => {
        throw new Error('connect ECONNREFUSED');
    });

    assert.deepEqual(await migrateShare(db, search('Owned001', 'owner'), down.importShare), {
        id: 'Owned001',
        code: 'unreachable',
        detail: 'connect ECONNREFUSED',
    });

    const token = await tokenOf('Owned001');

    assert.match(token ?? '', /^shw_[A-Za-z0-9_-]{22}$/);
    assert.equal(down.calls[0]?.body.write_token_sha256, sha256(token!));

    // While the call runs, a deletion's fence on the owner waits for it.
    let fenceWaited = false;
    const up = route(async () => {
        await assert.rejects(
            admin.query(`update "user" set deleting_at = now() where id = 'owner'`),
            { code: '55P03' },
        );
        fenceWaited = true;

        return { code: 'imported' };
    });

    assert.deepEqual(await migrateShare(db, search('Owned001', 'owner'), up.importShare), {
        id: 'Owned001',
        code: 'imported',
    });
    assert.ok(fenceWaited);
    assert.equal(await tokenOf('Owned001'), token);
    assert.equal(up.calls[0]?.body.write_token_sha256, sha256(token!));
    assert.equal(up.calls[0]?.body.owner, 'owner');

    // A fenced owner, or a token another user holds, stores no token and
    // sends nothing.
    const refused = route();

    await fenceShareTokens(db, 'fenced');
    await putShareToken(db, { shareId: 'Held0001', userId: 'other', writeToken: 'shw_theirs' });

    for (const row of [search('Fence001', 'fenced'), search('Held0001', 'owner')]) {
        assert.equal((await migrateShare(db, row, refused.importShare)).code, 'token_not_stored');
    }

    assert.deepEqual(refused.calls, []);
    assert.equal(await tokenOf('Fence001', 'fenced'), null);
    assert.equal(await tokenOf('Held0001', 'other'), 'shw_theirs');

    // An owner fenced after their token was stored is skipped, and the
    // token stays for the deletion to take the share down with.
    await fenceShareTokens(db, 'owner');

    assert.equal(
        (await migrateShare(db, search('Owned001', 'owner'), refused.importShare)).code,
        'owner_deleted',
    );
    assert.deepEqual(refused.calls, []);
    assert.equal(await tokenOf('Owned001'), token);
});

test('a run names each share not imported, counts each code, and fails on any', async () => {
    const answers: Record<string, Awaited<ReturnType<ImportShare>>> = {
        New00001: { code: 'imported' },
        Same0001: { code: 'unchanged' },
        Taken001: { code: 'share_id_taken', detail: 'the id holds another share' },
    };
    const { importShare } = route(async (id) => answers[id]!);
    const run = async (rows: StoredShare[]) => {
        const lines: string[] = [];
        const status = await migrateShares({
            db: noDb,
            rows,
            importShare,
            log: (line) => lines.push(line),
        });

        return { status, lines };
    };

    assert.deepEqual(await run([search('New00001', null), search('Same0001', null)]), {
        status: 0,
        lines: ['2 shares: imported 1, unchanged 1'],
    });
    assert.deepEqual(
        await run([
            search('New00001', null),
            { ...search('Gallery1', null), kind: 'gallery' },
            search('Taken001', null),
        ]),
        {
            status: 1,
            lines: [
                'share Gallery1: placement_refused kind "gallery" is not a share kind',
                'share Taken001: share_id_taken the id holds another share',
                '3 shares: imported 1, placement_refused 1, share_id_taken 1',
            ],
        },
    );
});

test('the import route is a PUT with the principal, read by status and problem code', async () => {
    const sent: { url: string; init: RequestInit }[] = [];
    const answers = [
        new Response('{}', { status: 201 }),
        new Response('{}', { status: 200 }),
        new Response(JSON.stringify({ code: 'share_id_taken', detail: 'taken' }), {
            status: 409,
            headers: { 'content-type': 'application/problem+json' },
        }),
        new Response('<html>Bad gateway</html>', { status: 502 }),
    ];
    const importShare = importOverHttp({
        base: 'http://apis.test/',
        principal: 'import-principal',
        fetchImpl: async (url, init) => {
            sent.push({ url: String(url), init: init ?? {} });

            return answers.shift()!;
        },
    });
    const body: ImportBody = {
        kind: 'search',
        mode: 'live',
        owner: null,
        created_at: '2026-09-01T10:00:00.000000Z',
        title: 't',
        slots: [],
        payload: {},
        write_token_sha256: null,
    };

    assert.deepEqual(await importShare('Ab3dEf7h', body), { code: 'imported' });
    assert.deepEqual(await importShare('Ab3dEf7h', body), { code: 'unchanged' });
    assert.deepEqual(await importShare('Ab3dEf7h', body), {
        code: 'share_id_taken',
        detail: 'taken',
    });
    assert.deepEqual(await importShare('Ab3dEf7h', body), {
        code: 'http_502',
        detail: '<html>Bad gateway</html>',
    });

    const [first] = sent;

    assert.equal(first?.url, 'http://apis.test/api/presentation/shares/Ab3dEf7h/import');
    assert.equal(first?.init.method, 'PUT');
    assert.equal(new Headers(first?.init.headers).get('x-dfo-principal'), 'import-principal');
    assert.deepEqual(JSON.parse(String(first?.init.body)), body);
});
