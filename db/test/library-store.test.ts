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
 * as the runtime role. A publish key makes one artifact however many tries
 * send it, at once or in turn. A withdrawn artifact keeps its slug, and its
 * share token until the take-down is settled, and its address follows its
 * chain of replacements to the first one published. A topic label is taken
 * in any case.
 */
test('library store', async (t) => {
    const database = await createTestDatabase();

    // src/lib/db caches its pools on globalThis. They end before the
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
            cardDates: [],
            cardCites: [],
        };
    };

    await t.test('a retried publish answers the first artifact', async () => {
        assert.deepEqual(await store.insertArtifact(input('key-a'), 'admin'), {
            slug: 'health-oda',
            title: 'Health ODA',
            created: true,
        });
        assert.deepEqual(await store.insertArtifact(input('key-a', 'Another title'), 'admin'), {
            slug: 'health-oda',
            title: 'Health ODA',
            created: false,
            withdrawn: false,
        });
        assert.deepEqual(await store.publishTarget('key-a'), {
            earlier: { slug: 'health-oda', title: 'Health ODA', withdrawn: false },
            slugHeld: false,
        });
        assert.deepEqual(await store.publishTarget('key-none'), {
            earlier: null,
            slugHeld: false,
        });
        assert.equal(await rowCount(), 1);
    });

    await t.test('two tries of one publish at once make one artifact', async () => {
        const made = await Promise.all([
            store.insertArtifact(input('key-b', 'Debt service'), 'admin'),
            store.insertArtifact(input('key-b', 'Debt service'), 'admin'),
        ]);

        assert.deepEqual(made.map((one) => (typeof one === 'object' ? one.created : one)).sort(), [
            false,
            true,
        ]);
        assert.deepEqual(
            made.map((one) => (typeof one === 'object' ? one.slug : one)),
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

        assert.deepEqual(made.map((one) => (typeof one === 'object' ? one.slug : one)).sort(), [
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

    await t.test('a withdrawn artifact keeps its slug and drops its token', async () => {
        const { id } = (
            await admin.query<{ id: string }>(
                `select id from library_artifact where slug = 'health-oda'`,
            )
        ).rows[0];
        const [listed] = (await store.listArtifacts()).filter((a) => a.slug === 'health-oda');
        const topicLinks = async () =>
            (
                await admin.query<{ n: number }>(
                    'select count(*)::int as n from library_artifact_topic where artifact_id = $1',
                    [id],
                )
            ).rows[0].n;

        assert.ok(listed);
        await store.addTopic('Health');
        await admin.query(
            `insert into library_artifact_topic (artifact_id, topic_id)
             select $1, id from library_topic where label = 'Health'`,
            [id],
        );
        assert.equal(await topicLinks(), 1);
        assert.equal('shareWriteToken' in listed, false);

        assert.deepEqual(await store.artifactShare(id), {
            slug: 'health-oda',
            shareId: listed.shareId,
            shareWriteToken: 'shw_1',
        });
        assert.equal(await store.isArtifactWithdrawn(id), false);
        assert.deepEqual(await store.withdrawArtifact(id), {
            slug: 'health-oda',
            replacement: 'none',
        });
        assert.equal(await store.artifactShare(id), null);
        assert.equal(await store.isArtifactWithdrawn(id), true);
        assert.equal(await store.isArtifactWithdrawn('no-such-id'), false);

        assert.equal(
            (await store.listArtifacts()).some((a) => a.slug === 'health-oda'),
            false,
        );
        assert.equal((await store.librarySlugs()).includes('health-oda'), false);
        assert.ok((await store.librarySlugs()).includes('debt-service'));

        const atSlug = await store.artifactBySlug('health-oda');

        assert.equal(atSlug?.status, 'withdrawn');
        assert.equal('title' in (atSlug?.artifact ?? {}), false);

        const erased = (
            await admin.query<Record<string, unknown>>(
                `select title, description, content_title, content, sources, steps, kind, mode,
                        share_id, share_write_token, withdrawn_at is not null as withdrawn,
                        (select count(*)::int from library_artifact_topic where artifact_id = $1) as topics
                   from library_artifact where id = $1`,
                [id],
            )
        ).rows[0];

        assert.equal(erased.title, '');
        assert.equal(erased.description, '');
        assert.equal(erased.content_title, null);
        assert.equal(erased.content, null);
        assert.deepEqual(erased.sources, []);
        assert.deepEqual(erased.steps, []);
        assert.equal(await topicLinks(), 0);
        assert.equal(erased.withdrawn, true);
        assert.equal(erased.share_id, listed.shareId);
        assert.equal(erased.share_write_token, null);
        assert.equal(erased.kind, listed.kind);
        assert.equal(erased.mode, listed.mode);

        const [{ publish_key: key }] = (
            await admin.query<{ publish_key: string }>(
                'select publish_key from library_artifact where id = $1',
                [id],
            )
        ).rows;

        assert.deepEqual(await store.publishTarget(key), {
            earlier: { slug: 'health-oda', title: '', withdrawn: true },
            slugHeld: false,
        });
        assert.equal('shareWriteToken' in (atSlug?.artifact ?? {}), false);
        assert.equal(await store.artifactBySlug('never-published'), null);

        const edit = {
            title: 'X',
            description: 'Y',
            contentTitle: null,
            content: null,
            topics: [],
        };

        assert.equal(await store.updateArtifact(id, edit, 0), 'not_found');

        assert.equal(await store.withdrawArtifact(id), 'not_found');
        assert.equal(await store.withdrawArtifact('no-such-id'), 'not_found');

        // A retry of the withdrawn artifact's publish says so.
        assert.deepEqual(await store.insertArtifact(input(key), 'admin'), {
            slug: 'health-oda',
            title: '',
            created: false,
            withdrawn: true,
        });

        // The withdrawn slug stays taken.
        const again = await store.insertArtifact(input('key-i', 'Health ODA'), 'admin');

        assert.ok(typeof again === 'object');
        assert.notEqual(again.slug, 'health-oda');
        assert.equal((await store.publishTarget('key-j', 'health-oda')).slugHeld, true);
        assert.equal(
            await store.insertArtifact({ ...input('key-j'), slug: 'health-oda' }, 'admin'),
            'slug_taken',
        );
    });

    await t.test('a chosen slug is stored as it is, or refused when held', async () => {
        const before = await rowCount();

        assert.equal((await store.publishTarget('key-k', 'aid-chart')).slugHeld, false);
        assert.deepEqual(
            await store.insertArtifact(
                { ...input('key-k', 'Debt service'), slug: 'aid-chart' },
                'admin',
            ),
            { slug: 'aid-chart', title: 'Debt service', created: true },
        );
        // A retry of that publish, whose first try committed before its
        // read, is that try, and its slug is not another artifact's.
        assert.deepEqual(await store.publishTarget('key-k', 'aid-chart'), {
            earlier: { slug: 'aid-chart', title: 'Debt service', withdrawn: false },
            slugHeld: false,
        });
        assert.deepEqual(await store.publishTarget('key-l', 'aid-chart'), {
            earlier: null,
            slugHeld: true,
        });
        // A retry of that publish answers it, and another publish of the
        // slug gets no number.
        assert.deepEqual(
            await store.insertArtifact(
                { ...input('key-k', 'Debt service'), slug: 'aid-chart' },
                'admin',
            ),
            { slug: 'aid-chart', title: 'Debt service', created: false, withdrawn: false },
        );
        assert.equal(
            await store.insertArtifact({ ...input('key-l'), slug: 'aid-chart' }, 'admin'),
            'slug_taken',
        );

        const raced = await Promise.all(
            ['key-m', 'key-n'].map((key) =>
                store.insertArtifact({ ...input(key), slug: 'raced-chart' }, 'admin'),
            ),
        );

        assert.deepEqual(raced.map((one) => (typeof one === 'object' ? one.slug : one)).sort(), [
            'raced-chart',
            'slug_taken',
        ]);
        assert.equal(await rowCount(), before + 2);
    });

    await t.test('any write that sets withdrawn_at erases the text', async () => {
        const published = {
            ...input('key-o', 'Old writer'),
            contentTitle: 'Findings',
            content: 'Text.',
            sources: [{ name: 'OECD', url: null }],
            steps: [{ title: 'Step', detail: null }],
            cardCites: [{ text: 'OECD (2026)', title: 'Creditor Reporting System' }],
        };

        await store.insertArtifact(published, 'admin');

        const { id } = (
            await admin.query<{ id: string }>(
                `select id from library_artifact where slug = 'old-writer'`,
            )
        ).rows[0];

        await admin.query(
            `insert into library_artifact_topic (artifact_id, topic_id)
             select $1, id from library_topic where label = 'Health'`,
            [id],
        );

        // As a release that sets withdrawn_at alone writes it, as the
        // runtime role.
        await database
            .runtimePool()
            .query('update library_artifact set withdrawn_at = now() where id = $1', [id]);

        // A row inserted withdrawn is erased too.
        await database.runtimePool().query(
            `insert into library_artifact
                 (id, slug, publish_key, share_id, kind, mode, title, description,
                  content_title, content, sources, steps, card_cites, withdrawn_at)
             values ('born-withdrawn', 'born-withdrawn', 'key-p', 'SharePPP', 'chart', 'live',
                     'T', 'D', 'CT', 'C', '[{"name":"x","url":null}]', '[{"title":"s","detail":null}]',
                     '[{"text":"x","title":"y"}]', now())`,
        );

        const { rows } = await admin.query<Record<string, unknown>>(
            `select id, title, description, content_title, content, sources, steps, card_cites, slug,
                    share_id, publish_key, share_write_token, published_by,
                    (select count(*)::int from library_artifact_topic where artifact_id = a.id) as topics
               from library_artifact a where id in ($1, 'born-withdrawn') order by id`,
            [id],
        );

        assert.equal(rows.length, 2);

        for (const row of rows) {
            assert.deepEqual(
                [
                    row.title,
                    row.description,
                    row.content_title,
                    row.content,
                    row.sources,
                    row.steps,
                    row.card_cites,
                    row.topics,
                ],
                ['', '', null, null, [], [], [], 0],
            );
        }

        const old = rows.find((row) => row.id === id);

        assert.deepEqual(
            [old?.slug, old?.publish_key, old?.share_write_token, old?.published_by],
            ['old-writer', 'key-o', published.shareWriteToken, 'admin'],
        );
    });
    // The id of the artifact under `slug`.
    const idOf = async (slug: string) =>
        (
            await admin.query<{ id: string }>('select id from library_artifact where slug = $1', [
                slug,
            ])
        ).rows[0].id;

    await t.test(
        "an artifact keeps its cards' data dates, withdrawn or not, and their citations",
        async () => {
            const cardDates = [
                { dataThrough: '2024', lastRefreshed: '2026-11-01' },
                { dataThrough: null, lastRefreshed: null },
            ];

            const cardCites = [
                { text: 'World Bank (2026)', title: 'World Development Indicators' },
                { sources: ['OECD CRS'], title: 'Health ODA to Ethiopia' },
            ];

            await store.insertArtifact(
                { ...input('key-q', 'Dated chart'), cardDates, cardCites },
                'admin',
            );

            const id = await idOf('dated-chart');
            const read = await store.artifactBySlug('dated-chart');

            assert.equal(read?.status, 'published');
            assert.ok(read?.status === 'published');
            assert.deepEqual(read.artifact.cardDates, cardDates);
            assert.deepEqual(read.artifact.cardCites, cardCites);
            assert.equal(read.artifact.updatedAt, read.artifact.publishedAt);

            await store.withdrawArtifact(id);

            const [row] = (
                await admin.query<{ card_dates: unknown }>(
                    'select card_dates from library_artifact where id = $1',
                    [id],
                )
            ).rows;

            assert.deepEqual(row.card_dates, cardDates);
        },
    );

    await t.test('an edit dates the text only when the text changes', async () => {
        await store.insertArtifact(input('key-t', 'Edited chart'), 'admin');

        const id = await idOf('edited-chart');
        const dates = async () => {
            const read = await store.artifactBySlug('edited-chart');

            assert.ok(read?.status === 'published');

            return read.artifact;
        };
        const text = {
            title: 'Edited chart',
            description: 'Aid to health.',
            contentTitle: null,
            content: null,
        };

        // The same text with a new topic.
        assert.deepEqual(await store.updateArtifact(id, { ...text, topics: ['Health'] }, 0), {
            slug: 'edited-chart',
            revision: 1,
        });

        const retopiced = await dates();

        assert.deepEqual(retopiced.topics, ['Health']);
        assert.equal(retopiced.updatedAt, retopiced.publishedAt);

        assert.equal(retopiced.revision, 1);
        await store.updateArtifact(
            id,
            { ...text, content: 'New findings.', topics: ['Health'] },
            1,
        );

        const rewritten = await dates();

        assert.ok(rewritten.updatedAt > rewritten.publishedAt);
        assert.equal(rewritten.revision, 2);
    });

    await t.test('an edit from an older revision changes nothing', async () => {
        await store.insertArtifact(
            { ...input('key-u', 'Raced chart'), content: 'Aid doubled.' },
            'admin',
        );

        const id = await idOf('raced-chart');
        const base = { description: 'Aid to health.', contentTitle: null, topics: [] };
        // Editor A opens the artifact at revision 0 and starts a slow edit
        // that keeps the old content.
        const opened = await store.artifactText(id);

        assert.equal(opened?.revision, 0);

        // Editor B replaces the title and the content meanwhile.
        assert.deepEqual(
            await store.updateArtifact(
                id,
                { ...base, title: 'Raced chart, revised', content: 'Aid rose.' },
                0,
            ),
            { slug: 'raced-chart', revision: 1 },
        );

        // A's write, made from revision 0, would put "Aid doubled." back.
        assert.equal(
            await store.updateArtifact(
                id,
                { ...base, title: 'Raced chart', content: 'Aid doubled.' },
                0,
            ),
            'artifact_changed',
        );

        const stored = await store.artifactText(id);

        assert.deepEqual(
            [stored?.title, stored?.content, stored?.revision],
            ['Raced chart, revised', 'Aid rose.', 1],
        );

        // Two edits from one revision at once: one lands.
        const raced = await Promise.all(
            ['First', 'Second'].map((title) =>
                store.updateArtifact(id, { ...base, title, content: null }, 1),
            ),
        );

        assert.deepEqual(raced.map((one) => (typeof one === 'object' ? 'saved' : one)).sort(), [
            'artifact_changed',
            'saved',
        ]);
    });

    await t.test(
        'only a withdrawn artifact names a replacement, and it names another',
        async () => {
            await store.insertArtifact(input('key-r', 'Replacement'), 'admin');
            await store.insertArtifact(input('key-s', 'Replaced'), 'admin');

            const replacement = await idOf('replacement');
            const replaced = await idOf('replaced');
            const runtime = database.runtimePool();
            const violates = (constraint: string) => (error: { constraint?: string }) =>
                error.constraint === constraint;

            await assert.rejects(
                runtime.query('update library_artifact set replaced_by = $1 where id = $2', [
                    replacement,
                    replaced,
                ]),
                violates('library_artifact_replaced_by_withdrawn'),
            );
            await assert.rejects(
                runtime.query(
                    'update library_artifact set withdrawn_at = now(), replaced_by = id where id = $1',
                    [replaced],
                ),
                violates('library_artifact_replaced_by_other'),
            );
            await assert.rejects(
                runtime.query(
                    `update library_artifact set withdrawn_at = now(), replaced_by = 'no-such-id' where id = $1`,
                    [replaced],
                ),
                violates('library_artifact_replaced_by_library_artifact_id_fk'),
            );

            // The erasing trigger leaves the pointer as the withdrawal wrote it.
            assert.deepEqual(await store.withdrawArtifact(replaced, replacement), {
                slug: 'replaced',
                replacement: 'set',
            });

            const [row] = (
                await admin.query<{ replaced_by: string; title: string }>(
                    'select replaced_by, title from library_artifact where id = $1',
                    [replaced],
                )
            ).rows;

            assert.deepEqual(row, { replaced_by: replacement, title: '' });

            const atSlug = await store.artifactBySlug('replaced');

            assert.ok(atSlug?.status === 'withdrawn');
            assert.equal(atSlug.artifact.replacedBy, replacement);
            assert.deepEqual(atSlug.artifact.replacement, {
                slug: 'replacement',
                title: 'Replacement',
            });

            // A published artifact cannot be given one later, and a withdrawn one
            // can be pointed elsewhere or nowhere.
            assert.equal(await store.setReplacement(replacement, replaced), 'not_found');
            assert.deepEqual(await store.setReplacement(replaced, null), { slug: 'replaced' });
            assert.equal(await store.replacementOf(replaced), null);
            assert.deepEqual(await store.setReplacement(replaced, replacement), {
                slug: 'replaced',
            });
            assert.equal(await store.isArtifactPublished(replacement), true);
            assert.equal(await store.isArtifactPublished(replaced), false);
            assert.ok(
                (await store.replacementChoices()).some((choice) => choice.id === replacement),
            );
            assert.equal(
                (await store.replacementChoices()).some((choice) => choice.id === replaced),
                false,
            );

            // A deleted replacement leaves the pointer null.
            await admin.query('delete from library_artifact where id = $1', [replacement]);
            assert.equal(
                (
                    await admin.query<{ replaced_by: string | null }>(
                        'select replaced_by from library_artifact where id = $1',
                        [replaced],
                    )
                ).rows[0].replaced_by,
                null,
            );
        },
    );

    await t.test('a withdrawn address follows its replacements to a published one', async () => {
        // chain-0 to chain-6, each withdrawn in turn naming the next while it
        // is still on show, and chain-6 published.
        const ids: string[] = [];

        for (let n = 0; n <= 6; n += 1) {
            await store.insertArtifact(input(`key-chain-${n}`, `Chain ${n}`), 'admin');
            ids.push(await idOf(`chain-${n}`));
        }

        for (let n = 0; n <= 5; n += 1) {
            assert.deepEqual(await store.withdrawArtifact(ids[n], ids[n + 1]), {
                slug: `chain-${n}`,
                replacement: 'set',
            });
        }

        const published = { slug: 'chain-6', title: 'Chain 6' };

        // Five hops reach chain-6 from chain-1, and six from chain-0 do not.
        assert.deepEqual(await store.replacementOf(ids[5]), published);
        assert.deepEqual(await store.replacementOf(ids[1]), published);
        assert.equal(await store.replacementOf(ids[0]), null);
        assert.equal(await store.replacementOf(ids[6]), null);

        // A loop of withdrawn artifacts links nowhere.
        // The store writes no pointer to a withdrawn artifact, so the loop is
        // written as an older release could.
        assert.equal(await store.setReplacement(ids[5], ids[4]), 'replacement_unavailable');
        await admin.query('update library_artifact set replaced_by = $1 where id = $2', [
            ids[4],
            ids[5],
        ]);
        assert.equal(await store.replacementOf(ids[4]), null);
    });
    await t.test('two withdrawals naming each other leave no loop', async () => {
        await store.insertArtifact(input('key-v', 'Mutual one'), 'admin');
        await store.insertArtifact(input('key-w', 'Mutual two'), 'admin');

        const one = await idOf('mutual-one');
        const two = await idOf('mutual-two');
        // Both read the other as on show before either commits, as two
        // admins' Delete checks do.
        const done = await Promise.all([
            store.withdrawArtifact(one, two),
            store.withdrawArtifact(two, one),
        ]);

        assert.deepEqual(
            done.map((answer) => (typeof answer === 'object' ? answer.replacement : answer)).sort(),
            ['refused', 'set'],
        );

        const { rows } = await admin.query<{ id: string; replaced_by: string | null }>(
            'select id, replaced_by from library_artifact where id in ($1, $2)',
            [one, two],
        );

        assert.equal(rows.filter((row) => row.replaced_by !== null).length, 1);
        assert.ok(rows.every((row) => row.replaced_by !== row.id));
        assert.equal(await store.replacementOf(one), null);
        assert.equal(await store.replacementOf(two), null);

        // A later pointer to a withdrawn artifact, or to itself, is refused.
        assert.equal(await store.setReplacement(one, two), 'replacement_unavailable');
        assert.equal(await store.setReplacement(one, one), 'replacement_unavailable');
    });
});
