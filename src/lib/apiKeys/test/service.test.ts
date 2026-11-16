import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
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
 * site's is: ownership, the forced prefix, the key shown once, the cap, and
 * the operator functions, with a key made here verified by the proxy's own
 * verifier.
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
            },
        },
        plugins: [apiKeyPlugin()],
    });
    const context = await auth.$context;
    const lines: Record<string, unknown>[] = [];
    let cap = 3;
    const service = createKeyService({
        auth,
        db,
        maxPerAccount: () => cap,
        log: (line) => lines.push(line),
    });

    const account = async (email: string) =>
        (
            await context.internalAdapter.createUser(
                { email, name: email, emailVerified: true },
                { method: 'email-otp' },
            )
        ).id;

    const alice = await account('alice@a.example');
    const bob = await account('bob@b.example');
    const rowOf = async (id: string) =>
        (await db.select().from(schema.apikey).where(eq(schema.apikey.id, id)))[0];

    await t.test('a created key has the forced prefix and the signed-in owner', async () => {
        const made = await service.createOwn(alice, 'notebook');

        assert.ok(made.ok);
        assert.match(made.key, /^dfo_live_[A-Za-z0-9]{32}$/);
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

        await service.deleteOwn(bob, made.id);
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

        const listed = await service.listOwn(bob);
        const row = await rowOf(made.id);

        assert.deepEqual(Object.keys(listed[0]!).sort(), [
            'createdAt',
            'id',
            'lastRequest',
            'name',
            'start',
        ]);
        assert.ok(row?.key && row.key !== made.key);

        const everything = JSON.stringify([listed, await service.adminList()]);

        assert.equal(everything.includes(made.key), false);
        assert.equal(everything.includes(row.key), false);
        // The start is the prefix and three random characters, nothing more.
        assert.equal(listed[0]!.start, made.key.slice(0, API_KEY_START_LENGTH));
        assert.equal(listed[0]!.start?.length, 12);
        assert.match(listed[0]!.start ?? '', /^dfo_live_[A-Za-z0-9]{3}$/);

        await service.deleteOwn(bob, made.id);
    });

    await t.test('a user lists only their own keys', async () => {
        const mine = await service.createOwn(bob, 'bobs');

        assert.ok(mine.ok);

        const aliceSees = await service.listOwn(alice);
        const bobSees = await service.listOwn(bob);

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
        const bobs = (await service.listOwn(bob))[0]!;

        assert.equal(await service.deleteOwn(alice, bobs.id), false);
        assert.ok(await rowOf(bobs.id));
        assert.equal(await service.deleteOwn(alice, 'no-such-key'), false);
    });

    await t.test('deleting removes the row, and the key stops verifying', async () => {
        const made = await service.createOwn(alice, 'short lived');

        assert.ok(made.ok);

        // A verifier with no cache memory to speak of: every call reads.
        const verifier = createKeyVerifier(db, { validMs: 0, invalidMs: 0 });

        assert.equal((await verifier.verify(made.key)).kind, 'valid');
        assert.equal(await service.deleteOwn(alice, made.id), true);
        assert.equal(await rowOf(made.id), undefined);
        assert.equal((await verifier.verify(made.key)).kind, 'invalid');
    });

    await t.test('a bad label is refused and makes no key', async () => {
        const before = (await service.listOwn(alice)).length;

        for (const label of ['', '   ', 'x'.repeat(33), 'a\u0000b', undefined, 7]) {
            const result = await service.createOwn(alice, label);

            assert.deepEqual(result, { ok: false, reason: 'label_invalid' });
        }

        assert.equal((await service.listOwn(alice)).length, before);
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
        assert.equal((await service.listOwn(carol)).length, 3);

        // The cap is another account's business: Dave is not held by Carol's keys.
        const dave = await account('dave@d.example');

        assert.ok((await service.createOwn(dave, 'mine')).ok);

        assert.equal(await service.deleteOwn(carol, made[0]!.id), true);
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
        assert.equal(await service.accountLimit(frank), null);
        assert.equal(await service.adminSetLimit('ops@example.org', 'Frank@F.example', 250), true);
        assert.equal(await service.accountLimit(frank), 250);

        const verdict = await createKeyVerifier(db).verify(made.key);

        assert.ok(verdict.kind === 'valid');
        assert.equal(verdict.rateLimit, 250);

        // Clearing returns the account to the default.
        assert.equal(await service.adminSetLimit('ops@example.org', 'frank@f.example', null), true);
        assert.equal(await service.accountLimit(frank), null);

        const after = await createKeyVerifier(db).verify(made.key);

        assert.ok(after.kind === 'valid');
        assert.equal(after.rateLimit, null);
        assert.equal(await service.adminSetLimit('ops@example.org', 'nobody@x.example', 5), false);
    });

    await t.test('admin: create for an account by email, case-insensitively', async () => {
        const gina = await account('gina@g.example');
        const made = await service.adminCreate('ops@example.org', 'GINA@g.example', 'for partner');

        assert.ok(made.ok);
        assert.match(made.key, /^dfo_live_[A-Za-z0-9]{32}$/);
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

        assert.equal((await service.listOwn(hank)).length, cap + 1);
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
        const victim = (await service.listOwn(bob))[0]!;

        assert.equal(await service.adminDelete('ops@example.org', victim.id), true);
        assert.equal(await rowOf(victim.id), undefined);
        assert.equal(await service.adminDelete('ops@example.org', victim.id), false);
    });

    await t.test('every mutation logs a line without any key or hash', async () => {
        const messages = lines.map((l) => l.message);

        assert.ok(messages.includes('api key created'));
        assert.ok(messages.includes('api key deleted'));

        const admin = lines.filter((l) => l.message === 'api key admin');
        const actions = new Set(admin.map((l) => l.action));

        assert.deepEqual([...actions].sort(), ['clear-limit', 'create', 'delete', 'set-limit']);

        for (const line of admin) {
            assert.equal(line.actor, 'ops@example.org');
            assert.ok(line.keyId || line.accountId);
        }

        const stored = await db.select({ key: schema.apikey.key }).from(schema.apikey);
        const logged = JSON.stringify(lines);

        assert.equal(logged.includes('dfo_live_'), false);

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
        assert.deepEqual(await service.listOwn(ivy), []);
    });
});
