import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { applyMigrations } from '../apply-migrations.ts';
import { user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * The Library's store (src/lib/library/store.ts) against the migrated tables
 * as the runtime role: a publish key makes one artifact however many tries
 * send it, at once or in turn; a withdrawn artifact keeps its slug and its
 * owed take-down; and a topic label is taken in any case.
 */
test('library store', async (t) => {
    const database = await createTestDatabase();

    // src/lib/db caches its pools on globalThis; they end before the
    // database goes.
    t.after(async () => {
        const pools = globalThis as unknown as { pool?: Pool; counterPool?: Pool; keyPool?: Pool };

        await Promise.all([pools.pool?.end(), pools.counterPool?.end(), pools.keyPool?.end()]);
        await database.teardown();
    });

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    await drizzle(database.runtimePool())
        .insert(user)
        .values({ id: 'admin', name: 'A', email: 'a@one.org' });

    const host = process.env.PGHOST ?? 'localhost';
    const pgPort = process.env.PGPORT ?? '5433';

    process.env.DATABASE_URL = `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${pgPort}/${database.databaseName}`;

    await import('../../src/lib/test/serverModules.ts');

    const store = await import('../../src/lib/library/store.ts');
    const admin = database.adminPool();
    const rowCount = async () =>
        (await admin.query<{ n: number }>('select count(*)::int as n from library_artifact'))
            .rows[0].n;

    let shares = 0;
    const input = (publishKey: string, title = 'Health ODA') => {
        shares += 1;

        return {
            publishKey,
            shareId: `Share${String(shares).padStart(3, '0')}`,
            shareWriteToken: `shw_${shares}`,
            kind: 'chart' as const,
            mode: 'live' as const,
            title,
            description: 'Aid to health.',
            contentTitle: null,
            content: null,
            topics: [],
            sources: [],
            steps: [],
        };
    };

    await t.test('a retried publish answers the first artifact', async () => {
        assert.deepEqual(await store.insertArtifact(input('key-a'), 'admin'), {
            slug: 'health-oda',
            created: true,
        });
        assert.deepEqual(await store.insertArtifact(input('key-a', 'Another title'), 'admin'), {
            slug: 'health-oda',
            created: false,
        });
        assert.deepEqual(await store.artifactByPublishKey('key-a'), { slug: 'health-oda' });
        assert.equal(await store.artifactByPublishKey('key-none'), null);
        assert.equal(await rowCount(), 1);
    });

    await t.test('two tries of one publish at once make one artifact', async () => {
        const made = await Promise.all([
            store.insertArtifact(input('key-b', 'Debt service'), 'admin'),
            store.insertArtifact(input('key-b', 'Debt service'), 'admin'),
        ]);

        assert.deepEqual(made.map((one) => (one === 'unknown_topic' ? one : one.created)).sort(), [
            false,
            true,
        ]);
        assert.deepEqual(
            made.map((one) => (one === 'unknown_topic' ? one : one.slug)),
            ['debt-service', 'debt-service'],
        );
        assert.equal(await rowCount(), 2);
    });

    await t.test('two publishes of one title at once get two slugs', async () => {
        const made = await Promise.all(
            ['key-c', 'key-d', 'key-e'].map((key) =>
                store.insertArtifact(input(key, 'Climate finance'), 'admin'),
            ),
        );

        assert.deepEqual(made.map((one) => (one === 'unknown_topic' ? one : one.slug)).sort(), [
            'climate-finance',
            'climate-finance-2',
            'climate-finance-3',
        ]);
    });

    await t.test('a share backs one artifact', async () => {
        const first = input('key-f', 'Share clash');

        await store.insertArtifact(first, 'admin');
        await assert.rejects(
            store.insertArtifact(
                { ...input('key-g', 'Share clash'), shareId: first.shareId },
                'admin',
            ),
            (error: { cause?: { constraint?: string } }) =>
                error.cause?.constraint === 'library_artifact_share_id_idx',
        );
    });

    await t.test('an unknown topic stores nothing', async () => {
        const before = await rowCount();

        assert.equal(
            await store.insertArtifact({ ...input('key-h', 'Topical'), topics: ['Nope'] }, 'admin'),
            'unknown_topic',
        );
        assert.equal(await rowCount(), before);
    });

    await t.test('a topic label is taken in any case, once', async () => {
        assert.equal(await store.addTopic('Health'), true);
        assert.equal(await store.addTopic('health'), false);

        const added = await Promise.all([store.addTopic('Debt'), store.addTopic('DEBT')]);

        assert.deepEqual(added.sort(), [false, true]);
        assert.deepEqual(
            (await store.listTopics()).map((label) => label.toLowerCase()),
            ['debt', 'health'],
        );
    });

    await t.test('a withdrawn artifact keeps its slug and its owed take-down', async () => {
        const { id } = (
            await admin.query<{ id: string }>(
                `select id from library_artifact where slug = 'health-oda'`,
            )
        ).rows[0];
        const [listed] = (await store.listArtifacts()).filter((a) => a.slug === 'health-oda');

        assert.ok(listed);
        assert.equal('shareWriteToken' in listed, false);

        const withdrawn = await store.withdrawArtifact(id);

        assert.notEqual(withdrawn, 'not_found');
        assert.deepEqual(withdrawn, {
            slug: 'health-oda',
            shareId: listed.shareId,
            shareWriteToken: 'shw_1',
        });

        assert.equal(
            (await store.listArtifacts()).some((a) => a.slug === 'health-oda'),
            false,
        );
        assert.equal((await store.librarySlugs()).includes('health-oda'), false);
        assert.ok((await store.librarySlugs()).includes('debt-service'));

        const atSlug = await store.artifactBySlug('health-oda');

        assert.equal(atSlug?.status, 'withdrawn');
        assert.equal('shareWriteToken' in (atSlug?.artifact ?? {}), false);
        assert.equal(await store.artifactBySlug('never-published'), null);

        const edit = {
            title: 'X',
            description: 'Y',
            contentTitle: null,
            content: null,
            topics: [],
        };

        assert.equal(await store.updateArtifact(id, edit), 'not_found');

        // A repeat while the take-down is owed answers the same share and
        // keeps the first date.
        const date = async () =>
            (
                await admin.query<{ at: string }>(
                    'select withdrawn_at::text as at from library_artifact where id = $1',
                    [id],
                )
            ).rows[0].at;
        const firstDate = await date();

        assert.deepEqual(await store.withdrawArtifact(id), withdrawn);
        assert.equal(await date(), firstDate);

        await store.forgetShareWriteToken(id);
        assert.equal(await store.withdrawArtifact(id), 'not_found');
        assert.equal(await store.withdrawArtifact('no-such-id'), 'not_found');

        // The withdrawn slug stays taken.
        const again = await store.insertArtifact(input('key-i', 'Health ODA'), 'admin');

        assert.notEqual(again, 'unknown_topic');
        assert.notEqual(again !== 'unknown_topic' && again.slug, 'health-oda');
    });

    await t.test('forgetting a token leaves an artifact on show alone', async () => {
        const { id } = (
            await admin.query<{ id: string }>(
                `select id from library_artifact where slug = 'debt-service'`,
            )
        ).rows[0];

        await store.forgetShareWriteToken(id);
        assert.notEqual(await store.withdrawArtifact(id), 'not_found');
    });
});
