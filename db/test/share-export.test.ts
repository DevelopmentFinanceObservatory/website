import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';

import { applyMigrations } from '../apply-migrations.ts';
import { placeShare, readShares, type StoredShare } from '../share-export.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const FRAME = { spec_id: 'spec_aid', content_version: 'cv_1' };
const DERIVED = { spec_id: 'ops_growth', content_version: 'ocv_2' };
const ref = (n: number) => ({ component_id: `cmp_card${n}`, revision: n });

const chart = (id: string, turn: number, extra: Record<string, unknown> = {}) => ({
    kind: 'chart',
    id,
    turn,
    chartType: 'line',
    title: `Chart ${id}`,
    categories: ['2023', '2024'],
    series: [{ label: 'Kenya', values: [1, 2] }],
    ...extra,
});
const table = (id: string, turn: number, extra: Record<string, unknown> = {}) => ({
    kind: 'table',
    id,
    turn,
    title: `Table ${id}`,
    columns: ['Year', 'Value'],
    rows: [['2024', '3']],
    ...extra,
});
const note = (id: string, turn: number) => ({ kind: 'text', id, turn, title: 'Note', body: 'B' });

const canvas = (widgets: unknown[], rest: Record<string, unknown> = {}) => ({
    id: 'conv-1',
    sessionId: 'harness-session',
    componentRefs: [ref(9)],
    title: 'Aid to Kenya',
    updatedAt: 1,
    messages: [],
    widgets,
    activity: [],
    turnCount: 2,
    pinnedIds: [],
    removedIds: [],
    layout: { c1: { col: 0, row: 0, w: 4, h: 3 } },
    theme: 'paper',
    textCards: [{ kind: 'text', id: 'tc1', title: 'Mine', body: 'Words' }],
    titles: { c1: 'Renamed' },
    notes: { c1: 'A note' },
    views: { c1: 'table' },
    ...rest,
});

const SEARCH_PART = {
    spec_id: 'spec_aid',
    identity: { variable: 'aid' },
    entity_groups: null,
    variable_text: 'aid to Kenya',
    operations: [],
    assumptions: null,
};

// One row per legacy case, inserted in this order with these moments.
const ROWS = [
    // A guest's search share with no mode: live, its parts unpinned.
    {
        id: 'srchLiv1',
        kind: 'search',
        mode: null,
        user_id: null,
        created_at: '2026-09-01T10:00:00.000001Z',
        title: 'aid to Kenya',
        data: { query: 'aid to Kenya' },
        parts: [
            { ...SEARCH_PART, part_index: 1, content_version: null, artifact_digest: null },
            { ...SEARCH_PART, part_index: 0, content_version: null, artifact_digest: null },
        ],
    },
    // A search snapshot made before artifact_digest was stored.
    {
        id: 'srchSnp1',
        kind: 'search',
        mode: 'snapshot',
        user_id: 'user0001',
        created_at: '2026-09-02T10:00:00Z',
        title: 'debt in Ghana',
        data: { query: 'debt in Ghana' },
        parts: [{ ...SEARCH_PART, part_index: 0, content_version: 'cv_7', artifact_digest: null }],
    },
    // A snapshot canvas with no mode: a pinned card from turn 1, a removed
    // card, a ref-less card with inline numbers, a card on a derived frame,
    // and an agent note.
    {
        id: 'canvSnp1',
        kind: 'canvas',
        mode: null,
        user_id: 'user0001',
        created_at: '2026-09-03T10:00:00Z',
        title: 'Aid to Kenya',
        data: canvas(
            [
                chart('c0', 1, { ref: ref(1), frame: FRAME }),
                chart('gone', 2, { ref: ref(2), frame: FRAME }),
                table('c1', 2),
                chart('c2', 2, { ref: ref(3), frame: DERIVED, horizontal: true }),
                note('n1', 2),
            ],
            { pinnedIds: ['c0'], removedIds: ['gone'] },
        ),
        parts: [],
    },
    // A live canvas: each data card it shows has its ref and frame, and an
    // older turn's unpinned card is not shown.
    {
        id: 'canvLiv1',
        kind: 'canvas',
        mode: 'live',
        user_id: 'user0001',
        created_at: '2026-09-04T10:00:00Z',
        title: 'Live aid',
        data: canvas([
            table('old', 1, { ref: ref(7), frame: FRAME }),
            table('c1', 2, { ref: ref(4), frame: FRAME }),
            table('c2', 2, { ref: ref(4), frame: FRAME }),
        ]),
        parts: [],
    },
    // Two shares made at the same moment leave by id.
    {
        id: 'cardSnp2',
        kind: 'card',
        mode: 'snapshot',
        user_id: null,
        created_at: '2026-09-05T10:00:00Z',
        title: 'Debt',
        data: canvas([table('c1', 1)], { pinnedIds: ['c1'], textCards: [] }),
        parts: [],
    },
    {
        id: 'cardLiv1',
        kind: 'card',
        mode: 'live',
        user_id: 'user0001',
        created_at: '2026-09-05T10:00:00Z',
        title: 'Live card',
        data: canvas([chart('c1', 1, { ref: ref(5), frame: FRAME })], {
            pinnedIds: ['c1'],
            textCards: [],
        }),
        parts: [],
    },
    // A conversation share with no mode: a snapshot, carried whole.
    {
        id: 'convSnp1',
        kind: 'conversation',
        mode: null,
        user_id: 'user0001',
        created_at: '2026-09-06T10:00:00Z',
        title: 'Aid to Kenya',
        data: canvas([chart('c1', 1, { ref: ref(6), frame: FRAME })], {
            messages: [{ role: 'user', text: 'aid to Kenya' }],
        }),
        parts: [],
    },
] satisfies StoredShare[];

// The stored copy of a Studio row of ROWS.
const canvasOf = (index: number) => ROWS[index]!.data as ReturnType<typeof canvas>;

const held = (data: ReturnType<typeof canvas>, widgets: unknown[]) => ({
    ...data,
    sessionId: null,
    componentRefs: [],
    widgets,
});

const EXPECTED = [
    {
        id: 'srchLiv1',
        kind: 'search',
        mode: 'live',
        owner: null,
        created_at: '2026-09-01T10:00:00.000001Z',
        title: 'aid to Kenya',
        slots: [],
        payload: {
            query: 'aid to Kenya',
            parts: [ROWS[0].parts[1], ROWS[0].parts[0]],
        },
    },
    {
        id: 'srchSnp1',
        kind: 'search',
        mode: 'snapshot',
        owner: 'user0001',
        created_at: '2026-09-02T10:00:00.000000Z',
        title: 'debt in Ghana',
        slots: [],
        payload: { query: 'debt in Ghana', parts: ROWS[1].parts },
    },
    {
        id: 'canvSnp1',
        kind: 'canvas',
        mode: 'snapshot',
        owner: 'user0001',
        created_at: '2026-09-03T10:00:00.000000Z',
        title: 'Aid to Kenya',
        slots: [
            { ...ref(1), frame: FRAME },
            { ...ref(3), frame: DERIVED },
        ],
        payload: held(canvasOf(2), [
            { kind: 'chart', id: 'c0', turn: 1, chartType: 'line', slot: 0 },
            canvasOf(2).widgets[1],
            canvasOf(2).widgets[2],
            { kind: 'chart', id: 'c2', turn: 2, chartType: 'line', horizontal: true, slot: 1 },
            canvasOf(2).widgets[4],
        ]),
    },
    {
        id: 'canvLiv1',
        kind: 'canvas',
        mode: 'live',
        owner: 'user0001',
        created_at: '2026-09-04T10:00:00.000000Z',
        title: 'Live aid',
        slots: [
            { ...ref(4), frame: FRAME },
            { ...ref(4), frame: FRAME },
        ],
        payload: held(canvasOf(3), [
            { kind: 'table', id: 'old', turn: 1 },
            { kind: 'table', id: 'c1', turn: 2, slot: 0 },
            { kind: 'table', id: 'c2', turn: 2, slot: 1 },
        ]),
    },
    {
        id: 'cardLiv1',
        kind: 'card',
        mode: 'live',
        owner: 'user0001',
        created_at: '2026-09-05T10:00:00.000000Z',
        title: 'Live card',
        slots: [{ ...ref(5), frame: FRAME }],
        payload: held(canvasOf(5), [
            { kind: 'chart', id: 'c1', turn: 1, chartType: 'line', slot: 0 },
        ]),
    },
    {
        id: 'cardSnp2',
        kind: 'card',
        mode: 'snapshot',
        owner: null,
        created_at: '2026-09-05T10:00:00.000000Z',
        title: 'Debt',
        slots: [],
        payload: held(canvasOf(4), canvasOf(4).widgets),
    },
    {
        id: 'convSnp1',
        kind: 'conversation',
        mode: 'snapshot',
        owner: 'user0001',
        created_at: '2026-09-06T10:00:00.000000Z',
        title: 'Aid to Kenya',
        slots: [],
        payload: { ...canvasOf(6), sessionId: null, componentRefs: [] },
    },
];

/**
 * The export over a migrated database holding one share per legacy case,
 * read as the runtime role: each lands with its mode, owner, slots and
 * payload, in `created_at` then id order.
 */
test('every legacy share case lands in the export', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const pool = database.runtimePool();

    await pool.query(`insert into "user" (id, name, email) values ('user0001', 'A', 'a@one.org')`);

    for (const row of ROWS) {
        await pool.query(
            `insert into share (id, user_id, kind, mode, title, data, created_at)
             values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
            [row.id, row.user_id, row.kind, row.mode, row.title, row.data, row.created_at],
        );

        for (const part of row.parts) {
            await pool.query(
                `insert into share_ref (share_id, part_index, spec_id, identity, entity_groups,
                     variable_text, content_version, artifact_digest, operations, assumptions)
                 values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb)`,
                [
                    row.id,
                    part.part_index,
                    part.spec_id,
                    JSON.stringify(part.identity),
                    JSON.stringify(part.entity_groups),
                    part.variable_text,
                    part.content_version,
                    part.artifact_digest,
                    JSON.stringify(part.operations),
                    JSON.stringify(part.assumptions),
                ],
            );
        }
    }

    // A live refresh cache row, which the export never reads.
    await pool.query(
        `insert into share_card_result (share_id, card_id, status) values ('canvLiv1', 'c1', 'current')`,
    );

    const lines = (await readShares(pool)).map(placeShare);

    // The lines are JSON, where a member left undefined is absent.
    assert.deepEqual(
        JSON.parse(JSON.stringify(lines)),
        EXPECTED.map((line) => ({ line })),
    );

    // A share's parts deleted between the read of the shares and the read of
    // their parts still export with it, as both reads see one snapshot.
    let raced = false;
    const read = await readShares(
        afterFirstSelect(pool, async () => {
            raced = true;
            await database.adminPool().query(`delete from share_ref where share_id = 'srchSnp1'`);
        }),
    );

    assert.ok(raced);
    assert.equal(read.find(({ id }) => id === 'srchSnp1')?.parts.length, 1);
});

// `pool`, with `between` run once, after the first SELECT through the pool
// or one of its clients has answered.
const afterFirstSelect = (pool: Pool, between: () => Promise<void>): Pool => {
    let fired = false;
    const watched = <T extends Pool | PoolClient>(target: T): T =>
        new Proxy(target, {
            get(object, key) {
                const value: unknown = Reflect.get(object, key);

                if (key === 'connect') {
                    return async () => watched(await (object as Pool).connect());
                }

                if (key !== 'query') {
                    return typeof value === 'function' ? value.bind(object) : value;
                }

                return async (text: string, values?: unknown[]) => {
                    const result = await object.query(text, values);

                    if (!fired && /^\s*select/i.test(text)) {
                        fired = true;
                        await between();
                    }

                    return result;
                };
            },
        });

    return watched(pool);
};

const stored = (overrides: Partial<StoredShare>): StoredShare => ({
    id: 'abcd1234',
    kind: 'canvas',
    mode: 'live',
    user_id: null,
    created_at: '2026-09-01T00:00:00.000000Z',
    title: 'T',
    data: canvas([]),
    parts: [],
    ...overrides,
});

test('a share the export cannot place is refused with its reason', () => {
    const cases: [Partial<StoredShare>, string][] = [
        [{ id: 'short' }, 'the id is not 8 letters and digits'],
        [{ mode: 'pinned' }, 'mode "pinned" is not live or snapshot'],
        [{ kind: 'conversation', mode: 'live' }, 'a conversation share cannot be live'],
        [{ data: { widgets: [] } }, 'data has no widgets, pinnedIds and removedIds arrays'],
        [{ data: canvas([table('c1', 1)]) }, "live card c1 has no component ref in dfo-apis' form"],
        [
            {
                data: canvas([
                    table('c1', 1, { ref: { component_id: '../x', revision: 1 }, frame: FRAME }),
                ]),
            },
            "live card c1 has no component ref in dfo-apis' form",
        ],
        [
            {
                parts: [
                    { ...SEARCH_PART, part_index: 0, content_version: null, artifact_digest: null },
                ],
            },
            'a canvas share has 1 share_ref rows',
        ],
        [
            {
                kind: 'search',
                mode: 'snapshot',
                data: { query: 'q' },
                parts: [
                    { ...SEARCH_PART, part_index: 0, content_version: null, artifact_digest: null },
                ],
            },
            'snapshot part 0 has no content_version',
        ],
    ];

    for (const [overrides, refusal] of cases) {
        assert.deepEqual(placeShare(stored(overrides)), { refusal }, JSON.stringify(overrides));
    }
});

test('a card with a ref and no frame the website holds gets a slot with a null frame', () => {
    for (const mode of ['live', 'snapshot']) {
        const placed = placeShare(
            stored({
                mode,
                data: canvas([
                    table('c1', 1, { ref: ref(1) }),
                    table('c2', 1, { ref: ref(2), frame: { spec_id: 'spec_aid' } }),
                ]),
            }),
        );

        assert.ok('line' in placed, mode);
        assert.deepEqual(
            placed.line.slots,
            [
                { ...ref(1), frame: null },
                { ...ref(2), frame: null },
            ],
            mode,
        );
        assert.deepEqual(
            placed.line.payload.widgets,
            [
                { kind: 'table', id: 'c1', turn: 1, slot: 0 },
                { kind: 'table', id: 'c2', turn: 1, slot: 1 },
            ],
            mode,
        );
    }
});
