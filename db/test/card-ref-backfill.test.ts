import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    cardsWithoutRef,
    matchCardRef,
    type ReadComponent,
} from '../../src/lib/studio/cardRefMatch.ts';
import {
    csvCharts,
    csvSameTwiceCard,
    csvTable,
    DERIVED_FRAME,
    FRAME,
    reads,
} from '../../src/lib/studio/test/fixtures/card-ref-reads.ts';
import { applyMigrations } from '../apply-migrations.ts';
import {
    type CardPatch,
    type CardTable,
    readCardCounts,
    readCardRowIds,
    readWidgets,
    writeCardRefs,
} from '../card-ref-backfill.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const read: ReadComponent = async (componentId, revision) => {
    const revisions = reads[componentId];

    return (revision === undefined ? revisions?.at(-1) : revisions?.[revision - 1]) ?? null;
};

const NOTE = { kind: 'text', id: 'note', title: 'Note', body: 'Text' };
// A card saved with its revision: it has `data` where the others have `csv`.
const SAVED_WITH_REF = {
    ...csvCharts[0],
    csv: undefined,
    ref: { component_id: csvCharts[0]!.id, revision: 1 },
    frame: FRAME,
};

/**
 * The card reference backfill over a migrated database, as the runtime
 * role: a matched card gains `ref` and `frame` and nothing else in the row
 * changes, an unmatched card, a text card, a card that has `ref` and a
 * search share are left as they were, and a second run writes nothing.
 */
test('the backfill writes ref and frame to matched cards only', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const pool = database.runtimePool();
    const conversationData = {
        title: 'Health spending',
        widgets: [NOTE, csvCharts[1], SAVED_WITH_REF, csvSameTwiceCard],
        layout: { note: { col: 0, row: 0, w: 4, h: 2 } },
    };
    const searchData = { parts: [], widgets: [csvTable] };

    await pool.query(`insert into "user" (id, name, email) values ('user0001', 'A', 'a@one.org')`);
    await pool.query(
        `insert into conversation (id, user_id, title, data, updated_at)
         values ('conv0001', 'user0001', 'Health spending', $1::jsonb, '2026-09-20T10:00:00Z')`,
        [JSON.stringify(conversationData)],
    );

    const insertShare = (id: string, kind: string, data: Record<string, unknown>) =>
        pool.query(
            `insert into share (id, kind, title, data) values ($1, $2, 'A share', $3::jsonb)`,
            [id, kind, JSON.stringify(data)],
        );

    await insertShare('card0001', 'card', { widgets: [csvTable] });
    await insertShare('srch0001', 'search', searchData);

    const before = await readCardCounts(pool);

    assert.deepEqual(before.shares, [
        { kind: 'card', mode: null, count: 1 },
        { kind: 'search', mode: null, count: 1 },
    ]);
    assert.deepEqual(before.tables.share, { rows: 1, withoutRef: 1, derivedByWeek: [] });
    assert.deepEqual(before.tables.conversation, { rows: 1, withoutRef: 2, derivedByWeek: [] });

    const patchesOf = async (table: CardTable, id: string): Promise<CardPatch[]> => {
        const patches: CardPatch[] = [];

        for (const { index, card } of cardsWithoutRef(await readWidgets(pool, table, id))) {
            const outcome = await matchCardRef(card, read);

            if (outcome.status === 'matched') {
                patches.push({ index, card, ref: outcome.ref, frame: outcome.frame });
            }
        }

        return patches;
    };

    assert.deepEqual(await readCardRowIds(pool, 'share'), ['card0001']);

    const sharePatches = await patchesOf('share', 'card0001');
    const conversationPatches = await patchesOf('conversation', 'conv0001');

    assert.equal(await writeCardRefs(pool, 'share', 'card0001', sharePatches), 1);
    assert.equal(await writeCardRefs(pool, 'conversation', 'conv0001', conversationPatches), 1);
    // The cards no longer equal the cards the match read.
    assert.equal(await writeCardRefs(pool, 'share', 'card0001', sharePatches), 0);
    assert.equal(await writeCardRefs(pool, 'conversation', 'conv0001', conversationPatches), 0);
    assert.deepEqual(await patchesOf('conversation', 'conv0001'), []);

    const conversation = await pool.query<{ data: unknown; updated_at: Date }>(
        `select data, updated_at from conversation where id = 'conv0001'`,
    );

    assert.deepEqual(conversation.rows[0]?.data, {
        ...conversationData,
        widgets: [
            NOTE,
            { ...csvCharts[1], ref: { component_id: csvCharts[1]!.id, revision: 2 }, frame: FRAME },
            JSON.parse(JSON.stringify(SAVED_WITH_REF)),
            csvSameTwiceCard,
        ],
    });
    assert.equal(conversation.rows[0]?.updated_at.toISOString(), '2026-09-20T10:00:00.000Z');

    const shares = await pool.query<{ id: string; data: unknown }>(
        'select id, data from share order by id',
    );

    assert.deepEqual(shares.rows, [
        {
            id: 'card0001',
            data: {
                widgets: [
                    {
                        ...csvTable,
                        ref: { component_id: csvTable.id, revision: 1 },
                        frame: DERIVED_FRAME,
                    },
                ],
            },
        },
        { id: 'srch0001', data: searchData },
    ]);

    const after = await readCardCounts(pool);

    assert.equal(after.tables.share.withoutRef, 0);
    assert.equal(after.tables.conversation.withoutRef, 1);
    assert.deepEqual(
        after.tables.share.derivedByWeek.map(({ count }) => count),
        [1],
    );
});
