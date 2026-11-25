import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { makeSignature } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { applyMigrations } from '../../../../db/apply-migrations.ts';
import * as schema from '../../../../db/schema.ts';
import { createTestDatabase } from '../../../../db/test/harness.ts';
import {
    API_KEY_PATHS,
    API_KEY_PREFIX,
    API_KEY_START_LENGTH,
    apiKeyPlugin,
} from '../../auth/apiKeyOptions.ts';
import { createKeyVerifier } from '../../proxy/keyVerifier.ts';
import { createKeyService } from '../service.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../db/migrations');
const BASE = 'http://localhost:3000';
const SECRET = 'a-test-secret-long-enough-for-better-auth';

/**
 * The API key service (src/lib/apiKeys/service) on a migrated database, as
 * the runtime role and through a real Better Auth instance set up as the
 * site's is: ownership (the plugin's own, on a signed-in session), the forced
 * prefix, the key shown once, the cap, and the operator functions, with a
 * key made here verified by the proxy's own verifier.
 */
test('API key service', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const pool = database.runtimePool();
    const db = drizzle(pool, { schema });
    const auth = betterAuth({
        database: drizzleAdapter(db, { provider: 'pg', schema }),
        baseURL: BASE,
        secret: SECRET,
        trustedOrigins: [BASE],
        disabledPaths: [...API_KEY_PATHS],
        user: {
            additionalFields: {
                apiRateLimit: { type: 'number', required: false, input: false, returned: false },
                apiDailyLimit: { type: 'number', required: false, input: false, returned: false },
            },
        },
        plugins: [apiKeyPlugin({}, { secrets: () => ['a-key-tag-secret-for-the-tests-0000'] })],
    });
    const context = await auth.$context;
    const lines: Record<string, unknown>[] = [];
    let cap = 3;
    let defaultDaily = 1000;
    let mintable = true;
    const service = createKeyService({
        auth,
        db,
        maxPerAccount: () => cap,
        defaultDailyLimit: () => defaultDaily,
        defaultRateLimit: () => 600,
        canMint: () => mintable,
        log: (line) => lines.push(line),
    });

    const account = async (email: string) =>
        (
            await context.internalAdapter.createUser(
                { email, name: email, emailVerified: true },
                { method: 'email-otp' },
            )
        ).id;

    // A signed-in request for the account, as the account page makes one.
    const as = async (userId: string) => {
        const session = await context.internalAdapter.createSession(userId);
        const signature = await makeSignature(session.token, SECRET);

        return {
            userId,
            headers: new Headers({
                cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`,
            }),
        };
    };

    const alice = await account('alice@a.example');
    const bob = await account('bob@b.example');
    const rowOf = async (id: string) =>
        (await db.select().from(schema.apikey).where(eq(schema.apikey.id, id)))[0];

    await t.test('a created key has the forced prefix and the signed-in owner', async () => {
        const made = await service.createOwn(alice, 'notebook');

        assert.ok(made.ok);
        assert.match(made.key, /^dfo_k_[A-Za-z]{32}[0-9A-Za-z]{14}$/);
        assert.ok(made.key.startsWith(API_KEY_PREFIX));

        const row = await rowOf(made.id);

        assert.equal(row?.referenceId, alice);
        assert.equal(row?.name, 'notebook');
        assert.equal(row?.prefix, API_KEY_PREFIX);
    });

    await t.test('a key has no expiry, limit, permissions or metadata of its own', async () => {
        const made = await service.createOwn(bob, 'plain');

        assert.ok(made.ok);

        const row = await rowOf(made.id);

        await service.deleteOwn(await as(bob), made.id);
        assert.equal(row?.enabled, true);
        assert.equal(row?.expiresAt, null);
        // The plugin's own per-key limiter is off (apiKeyOptions), so its stored
        // default is inert; the account's limit is the one that counts.
        assert.equal(row?.remaining, null);
        // Stored as JSON text, where null may be the text `null`.
        assert.equal(JSON.parse(row?.permissions ?? 'null'), null);
        assert.equal(JSON.parse(row?.metadata ?? 'null'), null);
    });

    await t.test('the key is returned once: lists carry neither it nor its hash', async () => {
        const made = await service.createOwn(bob, 'once');

        assert.ok(made.ok);

        const listed = await service.listOwn(await as(bob));
        const row = await rowOf(made.id);

        assert.deepEqual(Object.keys(listed[0]!).sort(), [
            'capUsedToday',
            'createdAt',
            'dailyCap',
            'id',
            'lastRequest',
            'name',
            'start',
            'tail',
        ]);
        assert.ok(row?.key && row.key !== made.key);

        const everything = JSON.stringify([listed, await service.adminList()]);

        assert.equal(everything.includes(made.key), false);
        assert.equal(everything.includes(row.key), false);
        // The start is the prefix and three random characters, nothing more.
        assert.equal(listed[0]!.start, made.key.slice(0, API_KEY_START_LENGTH));
        assert.equal(listed[0]!.start?.length, 9);
        assert.match(listed[0]!.start ?? '', /^dfo_k_[A-Za-z0-9]{3}$/);
        // The tail is the key's last four characters, also nothing more.
        assert.equal(listed[0]!.tail, made.key.slice(-4));

        await service.deleteOwn(await as(bob), made.id);
    });

    await t.test('a user lists only their own keys', async () => {
        const mine = await service.createOwn(bob, 'bobs');

        assert.ok(mine.ok);

        const aliceSees = await service.listOwn(await as(alice));
        const bobSees = await service.listOwn(await as(bob));

        assert.ok(aliceSees.length >= 1);
        assert.equal(
            aliceSees.some((k) => k.id === mine.id),
            false,
        );
        assert.deepEqual(
            bobSees.map((k) => k.id),
            [mine.id],
        );
    });

    await t.test("a user cannot delete another's key, and it stays", async () => {
        const bobs = (await service.listOwn(await as(bob)))[0]!;

        assert.equal(await service.deleteOwn(await as(alice), bobs.id), 'not_found');
        assert.ok(await rowOf(bobs.id));
        assert.equal(await service.deleteOwn(await as(alice), 'no-such-key'), 'not_found');
    });

    await t.test('deleting removes the row, and the key stops verifying', async () => {
        const made = await service.createOwn(alice, 'short lived');

        assert.ok(made.ok);

        // A verifier with no cache memory to speak of: every call reads.
        const verifier = createKeyVerifier(db, { validMs: 0, invalidMs: 0 });

        assert.equal((await verifier.verify(made.key)).kind, 'valid');
        assert.equal(await service.deleteOwn(await as(alice), made.id), 'deleted');
        assert.equal(await rowOf(made.id), undefined);
        assert.equal((await verifier.verify(made.key)).kind, 'invalid');
    });

    await t.test('a delete without a session is refused and the key stays', async () => {
        const made = await service.createOwn(alice, 'kept');

        assert.ok(made.ok);
        assert.equal(
            await service.deleteOwn({ userId: alice, headers: new Headers() }, made.id),
            'signed_out',
        );
        assert.ok(await rowOf(made.id));
        await assert.rejects(service.listOwn({ userId: alice, headers: new Headers() }));
        assert.equal(await service.deleteOwn(await as(alice), made.id), 'deleted');
    });

    await t.test('creates in parallel cannot pass the cap', async () => {
        const jill = await account('jill@j.example');

        assert.ok((await service.createOwn(jill, 'first')).ok);

        const results = await Promise.all(
            Array.from({ length: 8 }, (_, i) => service.createOwn(jill, `racing ${i}`)),
        );
        const held = await service.listOwn(await as(jill));

        assert.equal(held.length, cap);
        assert.equal(results.filter((r) => r.ok).length, cap - 1);
        // Every key a create reported is one the account holds.
        for (const r of results) {
            if (r.ok) {
                assert.ok(held.some((k) => k.id === r.id));
            }
        }
    });

    await t.test('with keys unavailable, neither a user nor an operator makes a key', async () => {
        const hal = await account('hal@h.example');

        mintable = false;

        try {
            assert.deepEqual(await service.createOwn(hal, 'notebook'), {
                ok: false,
                reason: 'keys_unavailable',
            });
            assert.deepEqual(await service.adminCreate('ops@example.org', 'hal@h.example', 'ops'), {
                ok: false,
                reason: 'keys_unavailable',
            });
            assert.deepEqual(await service.listOwn(await as(hal)), []);
        } finally {
            mintable = true;
        }
    });

    await t.test('a bad label is refused and makes no key', async () => {
        const before = (await service.listOwn(await as(alice))).length;

        for (const label of ['', '   ', 'x'.repeat(33), 'a\u0000b', undefined, 7]) {
            const result = await service.createOwn(alice, label);

            assert.deepEqual(result, { ok: false, reason: 'label_invalid' });
        }

        assert.equal((await service.listOwn(await as(alice))).length, before);
    });

    await t.test("a name another of the account's keys holds is refused, in any case", async () => {
        const nell = await account('nell@n.example');
        const other = await account('otto@o.example');

        assert.ok((await service.createOwn(nell, 'laptop')).ok);

        for (const label of ['laptop', 'LapTop', '  laptop  ']) {
            assert.deepEqual(await service.createOwn(nell, label), {
                ok: false,
                reason: 'name_taken',
            });
        }

        assert.deepEqual(await service.adminCreate('ops@example.org', 'nell@n.example', 'LAPTOP'), {
            ok: false,
            reason: 'name_taken',
        });
        assert.equal((await service.listOwn(await as(nell))).length, 1);
        // Another account may use the name.
        assert.ok((await service.createOwn(other, 'laptop')).ok);
    });

    await t.test('creates of one name in parallel leave one key of that name', async () => {
        const nora = await account('nora@n.example');
        const results = await Promise.all(
            // No more than the cap, so the only refusal is the name.
            Array.from({ length: cap }, () => service.createOwn(nora, 'same')),
        );
        const held = await service.listOwn(await as(nora));

        assert.equal(held.length, 1);
        assert.equal(results.filter((r) => r.ok).length, 1);
        assert.ok(results.every((r) => r.ok || r.reason === 'name_taken'));
    });

    await t.test('the per-account cap is enforced, and a deletion frees a place', async () => {
        const carol = await account('carol@c.example');
        const made = [];

        for (let i = 0; i < 3; i += 1) {
            const result = await service.createOwn(carol, `k${i}`);

            assert.ok(result.ok);
            made.push(result);
        }

        assert.deepEqual(await service.createOwn(carol, 'one too many'), {
            ok: false,
            reason: 'cap_reached',
        });
        assert.equal((await service.listOwn(await as(carol))).length, 3);

        // The cap is another account's business: Dave is not held by Carol's keys.
        const dave = await account('dave@d.example');

        assert.ok((await service.createOwn(dave, 'mine')).ok);

        assert.equal(await service.deleteOwn(await as(carol), made[0]!.id), 'deleted');
        assert.ok((await service.createOwn(carol, 'fits now')).ok);

        // Changing the setting applies to the next call.
        cap = 4;
        assert.ok((await service.createOwn(carol, 'fifth place')).ok);
        cap = 3;
    });

    await t.test(
        'a key made here verifies through the proxy verifier, to its account',
        async () => {
            const erin = await account('erin@e.example');
            const made = await service.createOwn(erin, 'verify me');

            assert.ok(made.ok);

            const verifier = createKeyVerifier(db);
            const verdict = await verifier.verify(made.key);

            assert.equal(verdict.kind, 'valid');
            assert.ok(verdict.kind === 'valid');
            assert.equal(verdict.keyId, made.id);
            assert.equal(verdict.accountId, erin);
            assert.equal(verdict.rateLimit, null);
            assert.equal((await verifier.verify(`${made.key}x`)).kind, 'invalid');
        },
    );

    await t.test('an account limit reads back, and the verifier sees it', async () => {
        const frank = await account('frank@f.example');
        const made = await service.createOwn(frank, 'limited');

        assert.ok(made.ok);

        // As the admin page's user table reads it.
        const accountLimit = async () =>
            (await service.adminListUsers({ query: 'frank@f.example' })).users[0]!.accountLimit;

        assert.equal(await accountLimit(), null);
        assert.equal((await service.accountQuota(frank)).rateLimit, 600);
        assert.equal(await service.adminSetLimit('ops@example.org', 'Frank@F.example', 250), true);
        assert.equal(await accountLimit(), 250);
        // As the account panel reads it.
        assert.equal((await service.accountQuota(frank)).rateLimit, 250);

        const verdict = await createKeyVerifier(db).verify(made.key);

        assert.ok(verdict.kind === 'valid');
        assert.equal(verdict.rateLimit, 250);

        // Clearing returns the account to the default.
        assert.equal(await service.adminSetLimit('ops@example.org', 'frank@f.example', null), true);
        assert.equal(await accountLimit(), null);

        const after = await createKeyVerifier(db).verify(made.key);

        assert.ok(after.kind === 'valid');
        assert.equal(after.rateLimit, null);
        assert.equal(await service.adminSetLimit('ops@example.org', 'nobody@x.example', 5), false);
    });

    await t.test('admin: create for an account by email, case-insensitively', async () => {
        const gina = await account('gina@g.example');
        const made = await service.adminCreate('ops@example.org', 'GINA@g.example', 'for partner');

        assert.ok(made.ok);
        assert.match(made.key, /^dfo_k_[A-Za-z]{32}[0-9A-Za-z]{14}$/);
        assert.equal((await rowOf(made.id))?.referenceId, gina);

        const verdict = await createKeyVerifier(db).verify(made.key);

        assert.ok(verdict.kind === 'valid');
        assert.equal(verdict.accountId, gina);

        assert.deepEqual(await service.adminCreate('ops@example.org', 'nobody@x.example', 'x'), {
            ok: false,
            reason: 'no_such_account',
        });
        assert.deepEqual(await service.adminCreate('ops@example.org', 'gina@g.example', ''), {
            ok: false,
            reason: 'label_invalid',
        });
    });

    await t.test('admin: the cap does not apply to an operator', async () => {
        const hank = await account('hank@h.example');

        for (let i = 0; i < cap + 1; i += 1) {
            assert.ok((await service.adminCreate('ops@example.org', 'hank@h.example', `k${i}`)).ok);
        }

        assert.equal((await service.listOwn(await as(hank))).length, cap + 1);
        assert.equal((await service.createOwn(hank, 'self')).ok, false);
    });

    await t.test('admin: list across accounts, with the owner and limit, and filter', async () => {
        const all = await service.adminList();
        const owners = new Set(all.map((k) => k.ownerEmail));

        assert.ok(owners.has('alice@a.example') && owners.has('bob@b.example'));
        assert.equal(all.find((k) => k.ownerEmail === 'frank@f.example')?.accountLimit, null);

        const filtered = await service.adminList('  ALICE@A ');

        assert.ok(filtered.length >= 1);
        assert.ok(filtered.every((k) => k.ownerEmail === 'alice@a.example'));
        assert.deepEqual(await service.adminList('no-match-anywhere'), []);

        // LIKE wildcards in the filter are text, not patterns.
        assert.deepEqual(await service.adminList('%'), []);
        assert.deepEqual(await service.adminList('_'), []);
    });

    await t.test('admin: delete any key, and report one that is not there', async () => {
        const victim = (await service.listOwn(await as(bob)))[0]!;

        assert.equal(await service.adminDelete('ops@example.org', victim.id), true);
        assert.equal(await rowOf(victim.id), undefined);
        assert.equal(await service.adminDelete('ops@example.org', victim.id), false);
    });

    await t.test(
        "the account's daily quota is the default until an operator sets one, and reads back",
        async () => {
            const ida = await account('ida@i.example');

            assert.deepEqual(await service.accountQuota(ida), {
                rateLimit: 600,
                dailyLimit: 1000,
                customDailyLimit: null,
                usedToday: 0,
            });

            assert.equal(
                await service.adminSetDailyLimit('ops@example.org', 'ida@i.example', 25),
                true,
            );
            assert.equal((await service.accountQuota(ida)).dailyLimit, 25);
            assert.equal((await service.accountQuota(ida)).customDailyLimit, 25);

            const made = await service.createOwn(ida, 'daily');

            assert.ok(made.ok);

            // The proxy's verifier reads the same column.
            const verdict = await createKeyVerifier(db).verify(made.key);

            assert.ok(verdict.kind === 'valid');
            assert.equal(verdict.accountDailyLimit, 25);
            assert.equal(verdict.dailyLimit, null);

            // Clearing returns the account to the default, which is read per call.
            assert.equal(
                await service.adminSetDailyLimit('ops@example.org', 'ida@i.example', null),
                true,
            );
            defaultDaily = 400;
            assert.equal((await service.accountQuota(ida)).dailyLimit, 400);
            assert.equal((await service.accountQuota(ida)).customDailyLimit, null);
            defaultDaily = 1000;

            assert.equal(
                await service.adminSetDailyLimit('ops@example.org', 'nobody@n.example', 5),
                false,
            );
        },
    );

    await t.test('a key has no daily cap until an operator sets one, and reads back', async () => {
        const kim = await account('kim@k.example');
        const made = await service.createOwn(kim, 'capped');

        assert.ok(made.ok);

        const read = async () =>
            (await service.listOwn(await as(kim))).find((k) => k.id === made.id)!;

        assert.deepEqual([(await read()).dailyCap, (await read()).capUsedToday], [null, null]);

        assert.equal(await service.adminSetKeyDailyLimit('ops@example.org', made.id, 25), true);
        assert.deepEqual([(await read()).dailyCap, (await read()).capUsedToday], [25, 0]);

        const verdict = await createKeyVerifier(db).verify(made.key);

        assert.ok(verdict.kind === 'valid');
        assert.equal(verdict.dailyLimit, 25);

        assert.equal(await service.adminSetKeyDailyLimit('ops@example.org', made.id, null), true);
        assert.equal((await read()).dailyCap, null);
        assert.equal(
            await service.adminSetKeyDailyLimit('ops@example.org', 'no-such-key', 5),
            false,
        );
    });

    await t.test(
        "usedToday is the account's count today only, and a reset clears it and its keys' caps",
        async () => {
            const joe = await account('joe@j.example');
            const made = await service.createOwn(joe, 'counted');

            assert.ok(made.ok);
            assert.equal(await service.adminSetKeyDailyLimit('ops@example.org', made.id, 50), true);

            const usedToday = async () => (await service.accountQuota(joe)).usedToday;
            const capUsed = async () =>
                (await service.listOwn(await as(joe))).find((k) => k.id === made.id)!.capUsedToday;
            const set = (key: string, windowStart: string, n: number) =>
                pool.query(
                    `insert into limit_counter (key, window_start, count)
                     values ($1, ${windowStart}, $2)
                     on conflict (key) do update set window_start = excluded.window_start, count = excluded.count`,
                    [key, n],
                );
            const today = "date_bin('86400 s', now(), timestamptz 'epoch')";

            assert.equal(await usedToday(), 0);

            await set(`apiday:user:${joe}`, today, 7);
            await set(`apiday:key:${made.id}`, today, 3);
            assert.equal(await usedToday(), 7);
            assert.equal(await capUsed(), 3);

            // Deleting the key and making another leaves the account's count.
            const other = await service.createOwn(joe, 'second');

            assert.ok(other.ok);
            assert.equal(await usedToday(), 7);

            assert.equal(await service.adminResetUsage('ops@example.org', joe), true);
            assert.equal(await usedToday(), 0);
            assert.equal(await capUsed(), 0);
            assert.equal(
                await service.adminResetUsage('ops@example.org', 'no-such-account'),
                false,
            );

            await set(`apiday:user:${joe}`, `${today} - interval '1 day'`, 900);
            assert.equal(await usedToday(), 0);
        },
    );

    await t.test(
        'admin: users, newest first, with a search, a page and their key counts',
        async () => {
            const pat = await account('Pat.Needle@p.example');
            const quinn = await account('quinn.needle@q.example');

            assert.ok((await service.createOwn(pat, 'one')).ok);
            assert.ok((await service.createOwn(pat, 'two')).ok);
            // One of Pat's two keys has expired, so only one is active.
            await pool.query(
                `update apikey set expires_at = now() - interval '1 hour'
             where id = (select id from apikey where reference_id = $1 limit 1)`,
                [pat],
            );
            // Quinn signs up after Pat.
            await pool.query(`update "user" set created_at = '2100-01-01' where id = $1`, [quinn]);

            const everyone = await service.adminListUsers({});
            const everyoneCount = (await pool.query('select count(*)::int as n from "user"'))
                .rows[0].n;

            assert.equal(everyone.total, everyoneCount);
            assert.equal(everyone.matched, everyoneCount);
            assert.equal(everyone.users[0]!.id, quinn);

            const found = await service.adminListUsers({ query: '  NEEDLE ' });

            assert.equal(found.total, everyoneCount);
            assert.equal(found.matched, 2);
            assert.deepEqual(
                found.users.map((u) => [u.id, u.email, u.activeKeys, u.accountLimit]),
                [
                    [quinn, 'quinn.needle@q.example', 0, null],
                    [pat, 'pat.needle@p.example', 1, null],
                ],
            );
            assert.ok(found.users.every((u) => u.createdAt instanceof Date));

            // A page, with the match count unchanged.
            const page = await service.adminListUsers({ query: 'needle', offset: 1, limit: 1 });

            assert.equal(page.matched, 2);
            assert.deepEqual(
                page.users.map((u) => u.id),
                [pat],
            );
            assert.equal((await service.adminListUsers({ limit: 3 })).users.length, 3);

            // LIKE wildcards in the query are text.
            assert.equal((await service.adminListUsers({ query: '%' })).matched, 0);
            assert.equal((await service.adminListUsers({ query: '_' })).matched, 0);
            assert.deepEqual(await service.adminListUsers({ query: 'no-match-anywhere' }), {
                total: everyoneCount,
                matched: 0,
                users: [],
            });
        },
    );

    await t.test("admin: one account's keys with the owner, limit and usage", async () => {
        const rae = await account('rae@r.example');
        const other = await account('sam@s.example');
        const first = await service.createOwn(rae, 'first');
        const second = await service.createOwn(rae, 'second');

        assert.ok(first.ok && second.ok);
        assert.ok((await service.createOwn(other, 'not rae')).ok);
        assert.equal(await service.adminSetKeyDailyLimit('ops@example.org', first.id, 9), true);

        const keys = await service.adminUserKeys(rae);

        assert.deepEqual(keys.map((k) => k.id).sort(), [first.id, second.id].sort());
        assert.ok(keys.every((k) => k.ownerId === rae && k.ownerEmail === 'rae@r.example'));
        assert.equal(keys.find((k) => k.id === first.id)?.dailyCap, 9);
        assert.equal(keys.find((k) => k.id === first.id)?.capUsedToday, 0);
        assert.equal(keys.find((k) => k.id === second.id)?.dailyCap, null);
        assert.equal(keys.find((k) => k.id === second.id)?.capUsedToday, null);
        assert.deepEqual(await service.adminUserKeys('no-such-account'), []);
    });

    await t.test('every mutation logs a line without any key or hash', async () => {
        const messages = lines.map((l) => l.message);

        assert.ok(messages.includes('api key created'));
        assert.ok(messages.includes('api key deleted'));

        const admin = lines.filter((l) => l.message === 'api key admin');
        const actions = new Set(admin.map((l) => l.action));

        assert.deepEqual([...actions].sort(), [
            'clear-daily-limit',
            'clear-daily-quota',
            'clear-limit',
            'create',
            'delete',
            'reset-usage',
            'set-daily-limit',
            'set-daily-quota',
            'set-limit',
        ]);

        for (const line of admin) {
            assert.equal(line.actor, 'ops@example.org');
            assert.ok(line.keyId || line.accountId);
        }

        const stored = await db.select({ key: schema.apikey.key }).from(schema.apikey);
        const logged = JSON.stringify(lines);

        assert.equal(logged.includes('dfo_k_'), false);

        for (const { key } of stored) {
            assert.equal(logged.includes(key), false);
        }

        // A refused admin attempt (no such key) logs nothing.
        const count = lines.length;

        await service.adminDelete('ops@example.org', 'no-such-key');
        await service.adminSetLimit('ops@example.org', 'nobody@x.example', 9);
        assert.equal(lines.length, count);
    });

    await t.test('deleting an account deletes its keys', async () => {
        const ivy = await account('ivy@i.example');

        assert.ok((await service.createOwn(ivy, 'gone soon')).ok);
        await context.internalAdapter.deleteUser(ivy);
        assert.deepEqual(
            await db.select().from(schema.apikey).where(eq(schema.apikey.referenceId, ivy)),
            [],
        );
    });
});
