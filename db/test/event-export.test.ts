import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { AccountExportError, runAccountExport } from '../account-export.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { type ExportBigQuery, type ExportDb, exportDb, type Load } from '../bounded.ts';
import {
    bigQueryWarehouse,
    DAY_WORST_MS,
    EXPORT_SCHEMA,
    type EventSource,
    exportDays,
    type ExportField,
    EventExportError,
    ExportJobError,
    exportRow,
    type JobProgress,
    type ExportRow,
    exportRules,
    pgEventSource,
    PROP_RULES,
    runExport,
    ROW_SHAPE,
    ROW_SHAPE_VERSION,
    runAndExit,
    runExportJob,
    type SourceEvent,
    type Warehouse,
} from '../event-export.ts';
import { EXPORT_READER_ROLE } from '../local-roles.ts';
import { shareCopyProps } from '../../src/lib/events/shareCopy.ts';
import type { StudioDownloadProps } from '../../src/lib/events/studioDownload.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');
const KEY = 'test-key';
const RULES = exportRules(KEY);

const sourceEvent = (overrides: Partial<SourceEvent>): SourceEvent => ({
    id: 1,
    createdAt: '2026-10-20T13:04:05.123456Z',
    name: 'feedback.submit',
    userId: null,
    visitorId: null,
    page: null,
    props: {},
    ...overrides,
});

test('exportRow keeps allow-listed props that pass their rule and drops the rest', () => {
    const row = exportRow(
        sourceEvent({
            name: 'search.query',
            userId: 'user-1',
            visitorId: 'visitor-1',
            page: '/data?q=aid%20to%20kenya#top',
            props: {
                searchId: '0b7c6f1e-2d4a-4f7e-9a51-3c1d2e4f5a6b',
                post: 0,
                source: 'typed',
                edited: false,
                traceId: 'a1b2c3d4e5f6',
                ms: 812,
                outcome: 'definite',
                engineMs: 640,
                timedOut: false,
                kind: 'resolution',
                reason: null,
                operations: ['compare'],
                query: 'aid to kenya',
                resolved: [{ specId: 's1', statVarCount: 3 }],
                refused: [{ variableText: 'my words', status: 'no_data' }],
                byStep: { parse: 120 },
            },
        }),
        KEY,
        RULES,
    );

    assert.deepEqual(row, {
        id: 1,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'search.query',
        page: '/data',
        signed_in: true,
        visitor_hash: createHmac('sha256', KEY).update('visitor-1').digest('hex'),
        user_hash: createHmac('sha256', KEY).update('user-1').digest('hex'),
        props: {
            searchId: '0b7c6f1e-2d4a-4f7e-9a51-3c1d2e4f5a6b',
            post: 0,
            source: 'typed',
            edited: false,
            traceId: 'a1b2c3d4e5f6',
            ms: 812,
            outcome: 'definite',
            engineMs: 640,
            timedOut: false,
            kind: 'resolution',
        },
        export_rules: RULES,
    });
});

test('exportRules changes with the HMAC key', () => {
    assert.equal(exportRules(KEY), RULES);
    assert.notEqual(exportRules('rotated-key'), RULES);
});

test('exportRules changes with the SQL that reads a day', () => {
    // The reader test checks that readDay sends ROW_SHAPE.READ_DAY_SQL.
    const sql = ROW_SHAPE.READ_DAY_SQL;

    ROW_SHAPE.READ_DAY_SQL = `${sql} `;

    try {
        assert.notEqual(exportRules(KEY), RULES);
    } finally {
        ROW_SHAPE.READ_DAY_SQL = sql;
    }
});

test('exportRow drops a value its rule refuses', async (t) => {
    const cases: [string, Record<string, unknown>][] = [
        [
            'an enum value the site never sends',
            { name: 'feedback.submit', props: { kind: 'other' } },
        ],
        ['text in a token', { name: 'auth.signin', props: { provider: 'my name is Ana' } }],
        ['a negative count', { name: 'guest.wall_hit', props: { prompts: -1 } }],
        ['a fractional count', { name: 'studio.prompt', props: { length: 1.5 } }],
        ['a string boolean', { name: 'studio.prompt', props: { guest: 'true' } }],
        ['a key of another event', { name: 'studio.prompt', props: { query: 'aid' } }],
        ['a name the site no longer emits', { name: 'search.legacy', props: { kind: 'chat' } }],
        // Only a `measures` entry admits `|`, so text v1 refused stays refused on reload.
        ['a `|` in a token', { name: 'studio.card', props: { source: 'OECD|DAC' } }],
        ['a `|` in a digest', { name: 'share.open', props: { shareId: 'OECD|DAC' } }],
        ['a `|` in a specIds entry', { name: 'search.query', props: { specIds: ['OECD|DAC'] } }],
    ];

    for (const [label, overrides] of cases) {
        await t.test(label, () => {
            assert.deepEqual(exportRow(sourceEvent(overrides), KEY, RULES).props, {});
        });
    }
});

test('exportRow keeps a measures entry joined with `|`', () => {
    const measures = ['schema:FinancialFlow|amount|Nominal|measuredValue|-', 'sv:Count_Person'];
    const row = exportRow(sourceEvent({ name: 'search.query', props: { measures } }), KEY, RULES);

    assert.deepEqual(row.props, { measures });
});

test('exportRow leaves the hashes null for a guest without consent', () => {
    const row = exportRow(sourceEvent({ page: '/topics/health' }), KEY, RULES);

    assert.equal(row.signed_in, false);
    assert.equal(row.visitor_hash, null);
    assert.equal(row.user_hash, null);
    assert.equal(row.page, '/topics/health');
});

test('exportRow keeps a site path as the page and refuses other text', async (t) => {
    const cases: [string, string | null, string | null][] = [
        ['a fixed route', '/data', '/data'],
        ['the home page', '/', '/'],
        ['a source page', '/data/sources/dc/base/OECD_CRS', '/data/sources/dc/base/OECD_CRS'],
        [
            'a studio conversation',
            '/studio/0b7c6f1e-2d4a-4f7e-9a51-3c1d2e4f5a6b',
            '/studio/0b7c6f1e-2d4a-4f7e-9a51-3c1d2e4f5a6b',
        ],
        ['a share', '/s/aB3dE5fG7h', '/s/:id'],
        ['a page under a share', '/s/aB3dE5fG7h/download/preparing', '/s/:id/download/preparing'],
        ['an embed', '/embed/aB3dE5fG7h?theme=dark', '/embed/:id'],
        ['a doc with its query string', '/docs/methods?tab=log#top', '/docs/methods'],
        ['no page', null, null],
        ['a name', 'Ana Silva', null],
        ['an email', '/ana@example.org', null],
        ['a path with spaces', '/my name is Ana', null],
        ['an escaped space', '/my%20name', null],
        ['a path longer than the route keeps', `/${'a'.repeat(300)}`, null],
    ];

    for (const [label, page, kept] of cases) {
        await t.test(label, () => {
            assert.equal(exportRow(sourceEvent({ page }), KEY, RULES).page, kept);
        });
    }
});

test('exportRow exports a share id as its digest, so share events still join', () => {
    const shareId = 'aB3dE5fG7h';
    const hashed = createHmac('sha256', KEY).update(shareId).digest('hex');
    const events: [string, Record<string, unknown>][] = [
        ['share.create', { shareId, kind: 'card', mode: 'live' }],
        ['share.open', { shareId, kind: 'card', mode: 'live' }],
        ['embed.view', { shareId, kind: 'card' }],
        ['search.action', { shareId, action: 'share' }],
        ['share.copy', { shareId, kind: 'card', copied: 'link' }],
    ];

    for (const [name, props] of events) {
        assert.equal(
            exportRow(sourceEvent({ name, props }), KEY, RULES).props.shareId,
            hashed,
            name,
        );
    }

    const refused = exportRow(
        sourceEvent({ name: 'share.open', props: { shareId: 'not a share id' } }),
        KEY,
        RULES,
    );

    assert.deepEqual(refused.props, {});
});

test('exportRow keeps the props of a copied share and a share dialog download', async (t) => {
    const hashed = createHmac('sha256', KEY).update('aB3dE5fG7h').digest('hex');
    const cases: [string, string, Record<string, unknown>, Record<string, unknown>][] = [
        [
            'an embed code copied',
            'share.copy',
            shareCopyProps({
                kind: 'canvas',
                copied: 'embed_code',
                share: { id: 'aB3dE5fG7h', mode: 'live' },
            }),
            { kind: 'canvas', copied: 'embed_code', shareId: hashed, mode: 'live' },
        ],
        [
            'a search query link copied, with no share behind it',
            'share.copy',
            shareCopyProps({ kind: 'search', copied: 'query_link', share: null }),
            { kind: 'search', copied: 'query_link' },
        ],
        [
            'a file saved from the Share dialog',
            'studio.download',
            {
                format: 'csv',
                bundle: false,
                kind: 'table',
                cardId: 'c-1',
                shared: false,
                source: 'share_dialog',
            } satisfies StudioDownloadProps,
            {
                format: 'csv',
                bundle: false,
                kind: 'table',
                cardId: 'c-1',
                shared: false,
                source: 'share_dialog',
            },
        ],
    ];

    for (const [label, name, props, kept] of cases) {
        await t.test(label, () => {
            assert.deepEqual(exportRow(sourceEvent({ name, props }), KEY, RULES).props, kept);
        });
    }
});

// A fixed sample that reaches every rule and branch of exportRow.
const GOLDEN_SAMPLE: SourceEvent[] = [
    sourceEvent({
        id: 1,
        name: 'search.query',
        userId: 'user-1',
        visitorId: 'visitor-1',
        page: '/data?q=aid%20to%20kenya#top',
        props: {
            searchId: '0b7c6f1e-2d4a-4f7e-9a51-3c1d2e4f5a6b',
            post: 0,
            source: 'typed',
            edited: false,
            ms: 812,
            outcome: 'definite',
            kind: 'resolution',
            query: 'aid to kenya',
            engineMs: -1,
            traceId: 'two words',
        },
    }),
    sourceEvent({
        id: 2,
        createdAt: '2026-10-21T00:00:00.000001Z',
        name: 'share.open',
        visitorId: 'visitor-2',
        page: '/s/aB3dE5fG7h/download/preparing',
        props: { shareId: 'aB3dE5fG7h', kind: 'card', mode: 'snapshot', host: 'example.org' },
    }),
    sourceEvent({ id: 3, name: 'feedback.submit', page: '/a page', props: { kind: 'widget' } }),
    sourceEvent({ id: 4, name: 'retired.event', page: '/embed/x1', props: { kind: 'card' } }),
    sourceEvent({
        id: 5,
        name: 'search.query',
        props: {
            specIds: ['spec_a1', 'spec_b2'],
            measures: ['FinancialFlow/amount/Nominal', 'has space'],
            internal_eng: true,
        },
    }),
    sourceEvent({
        id: 6,
        name: 'embed.view',
        props: { shareId: 'aB3dE5fG7h', kind: 'card', viewer: 'other', internal_eng: false },
    }),
    sourceEvent({
        id: 7,
        name: 'studio.download',
        props: { format: 'xlsx', bundle: true, kind: 'chart', cardId: 'c-1', shared: false },
    }),
    sourceEvent({
        id: 8,
        name: 'search.query',
        props: { measures: ['sv:Count_Person', '-'] },
    }),
    sourceEvent({
        id: 9,
        name: 'search.query',
        props: { measures: Array.from({ length: 11 }, (_, at) => `sv:Ind_${at}`) },
    }),
    sourceEvent({
        id: 10,
        name: 'data.view',
        page: '/embed/aB3dE5fG7h',
        props: {
            specIds: ['spec_a1', '-'],
            contentVersions: ['cv_9f2e', '-'],
            via: 'share',
            host: 'blog.example',
            caller: 'ip:0123456789abcdef0123456789abcdef',
            internal_eng: false,
        },
    }),
    sourceEvent({
        id: 11,
        name: 'data.view',
        props: {
            specIds: ['spec_a1'],
            contentVersions: ['cv_9f2e'],
            via: 'embedded',
            shareId: 'aB3dE5fG7h',
            caller: 'ip:ABC',
            internal_eng: true,
        },
    }),
];

// Version 1 pinned the first four sample rows, which version 2 leaves as they were.
const VERSION_1_ROWS: ExportRow[] = [
    {
        id: 1,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'search.query',
        page: '/data',
        signed_in: true,
        visitor_hash: '77a3c0b044582bfb514a3a3ad8521316635e2256261861c83b7498ee2e420f65',
        user_hash: 'e0e98314ed3ee6ea685abd3f0862870e2a07b68d95d053c7f483cda192ae40c4',
        props: {
            searchId: '0b7c6f1e-2d4a-4f7e-9a51-3c1d2e4f5a6b',
            post: 0,
            source: 'typed',
            edited: false,
            ms: 812,
            outcome: 'definite',
            kind: 'resolution',
        },
        export_rules: 'r',
    },
    {
        id: 2,
        created_at: '2026-10-21T00:00:00.000001Z',
        name: 'share.open',
        page: '/s/:id/download/preparing',
        signed_in: false,
        visitor_hash: '656d62821b3df7e629e0d8af562ac6a21302f71aeed8fa018b46c7fa00d54f88',
        user_hash: null,
        props: {
            shareId: '7e8148cb3a5192589abc81da275c6e151ebb4c2d702234f8a68e870138326bc4',
            kind: 'card',
            mode: 'snapshot',
            host: 'example.org',
        },
        export_rules: 'r',
    },
    {
        id: 3,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'feedback.submit',
        page: null,
        signed_in: false,
        visitor_hash: null,
        user_hash: null,
        props: { kind: 'widget' },
        export_rules: 'r',
    },
    {
        id: 4,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'retired.event',
        page: '/embed/:id',
        signed_in: false,
        visitor_hash: null,
        user_hash: null,
        props: {},
        export_rules: 'r',
    },
];

// Rows 5 to 9 are the version 2 rows, and version 3 exports them unchanged.
const VERSION_2_ROWS: ExportRow[] = [
    ...VERSION_1_ROWS,
    {
        id: 5,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'search.query',
        page: null,
        signed_in: false,
        visitor_hash: null,
        user_hash: null,
        // `measures` holds a token with a space, so the whole list is dropped.
        props: { specIds: ['spec_a1', 'spec_b2'], internal_eng: true },
        export_rules: 'r',
    },
    {
        id: 6,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'embed.view',
        page: null,
        signed_in: false,
        visitor_hash: null,
        user_hash: null,
        props: {
            shareId: '7e8148cb3a5192589abc81da275c6e151ebb4c2d702234f8a68e870138326bc4',
            kind: 'card',
            viewer: 'other',
            internal_eng: false,
        },
        export_rules: 'r',
    },
    {
        id: 7,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'studio.download',
        page: null,
        signed_in: false,
        visitor_hash: null,
        user_hash: null,
        props: { format: 'xlsx', bundle: true, kind: 'chart', cardId: 'c-1', shared: false },
        export_rules: 'r',
    },
    {
        id: 8,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'search.query',
        page: null,
        signed_in: false,
        visitor_hash: null,
        user_hash: null,
        // `-` stands for a part with no measure and passes.
        props: { measures: ['sv:Count_Person', '-'] },
        export_rules: 'r',
    },
    {
        id: 9,
        created_at: '2026-10-20T13:04:05.123456Z',
        name: 'search.query',
        page: null,
        signed_in: false,
        visitor_hash: null,
        user_hash: null,
        // Eleven measures is over the list cap, so the list is dropped.
        props: {},
        export_rules: 'r',
    },
];

// Each ROW_SHAPE_VERSION's rows for GOLDEN_SAMPLE under KEY, with rules
// `r`. A change to the rows adds the next version with its rows, and an
// entry never changes.
const GOLDEN_ROWS: Record<number, ExportRow[]> = {
    1: VERSION_1_ROWS,
    2: VERSION_2_ROWS,
    3: [
        ...VERSION_2_ROWS,
        {
            id: 10,
            created_at: '2026-10-20T13:04:05.123456Z',
            name: 'data.view',
            page: '/embed/:id',
            signed_in: false,
            visitor_hash: null,
            user_hash: null,
            props: {
                specIds: ['spec_a1', '-'],
                contentVersions: ['cv_9f2e', '-'],
                via: 'share',
                host: 'blog.example',
                caller: 'ip:0123456789abcdef0123456789abcdef',
                internal_eng: false,
            },
            export_rules: 'r',
        },
        {
            id: 11,
            created_at: '2026-10-20T13:04:05.123456Z',
            name: 'data.view',
            page: null,
            signed_in: false,
            visitor_hash: null,
            user_hash: null,
            // A `via` the site never sends, a share id the rule does not take
            // and a malformed `caller` are dropped.
            props: {
                specIds: ['spec_a1'],
                contentVersions: ['cv_9f2e'],
                internal_eng: true,
            },
            export_rules: 'r',
        },
    ],
};

test('exportRow writes the rows pinned to the current ROW_SHAPE_VERSION', () => {
    assert.deepEqual(
        GOLDEN_SAMPLE.map((row) => exportRow(row, KEY, 'r')),
        GOLDEN_ROWS[ROW_SHAPE_VERSION],
    );
});

test('exportRow lets no email address out, whatever field the source holds it in', () => {
    const email = 'ana@example.org';
    const rows = Object.entries(PROP_RULES).flatMap(([name, rules]) => {
        const props = Object.fromEntries(Object.keys(rules).map((key) => [key, email]));
        const listProps = Object.fromEntries(Object.keys(rules).map((key) => [key, [email]]));

        return [props, listProps].flatMap((eventProps) =>
            [`/${email}`, `/data?email=${email}`, `/s/${email}`].map((page) =>
                exportRow(
                    sourceEvent({ name, userId: email, visitorId: email, page, props: eventProps }),
                    KEY,
                    RULES,
                ),
            ),
        );
    });

    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => !JSON.stringify(row).includes('@')));
});

const counts = (days: Record<string, number>) => new Map(Object.entries(days));

test('exportDays replaces from the day before the latest loaded day through today', async (t) => {
    const cases: [string, Parameters<typeof exportDays>[0], string[]][] = [
        [
            'no event at all',
            { today: '2026-10-23', events: counts({}), partitions: counts({}) },
            [],
        ],
        [
            'an empty table backfills from the first event',
            {
                today: '2026-10-23',
                events: counts({ '2026-10-21': 2, '2026-10-23': 1 }),
                partitions: counts({}),
            },
            ['2026-10-21', '2026-10-22', '2026-10-23'],
        ],
        [
            'a run after an outage reloads every missed day',
            {
                today: '2026-10-22',
                events: counts({ '2026-10-19': 4, '2026-10-21': 1 }),
                partitions: counts({ '2026-10-19': 3 }),
            },
            ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'],
        ],
        [
            'a run on a loaded day',
            {
                today: '2026-10-23',
                events: counts({ '2026-10-20': 2, '2026-10-23': 1 }),
                partitions: counts({ '2026-10-20': 2, '2026-10-23': 1 }),
            },
            ['2026-10-22', '2026-10-23'],
        ],
        [
            'days holding rows under other export rules',
            {
                today: '2026-10-23',
                events: counts({ '2026-10-17': 1, '2026-10-20': 2, '2026-10-23': 1 }),
                partitions: counts({ '2026-10-17': 1, '2026-10-20': 2, '2026-10-23': 1 }),
                stale: new Set(['2026-10-17', '2026-10-20']),
            },
            ['2026-10-22', '2026-10-23', '2026-10-17', '2026-10-20'],
        ],
        [
            'a backlog of stale and mismatched days, oldest first, after the window',
            {
                today: '2026-10-23',
                events: counts({ '2026-10-15': 2, '2026-10-20': 2, '2026-10-23': 1 }),
                partitions: counts({ '2026-10-15': 1, '2026-10-20': 2, '2026-10-23': 1 }),
                stale: new Set(['2026-10-20', '2026-10-12', '2026-10-23']),
            },
            ['2026-10-22', '2026-10-23', '2026-10-12', '2026-10-15', '2026-10-20'],
        ],
        [
            'a month boundary',
            {
                today: '2026-03-01',
                events: counts({ '2026-03-01': 1 }),
                partitions: counts({ '2026-03-01': 1 }),
            },
            ['2026-02-28', '2026-03-01'],
        ],
    ];

    for (const [label, input, days] of cases) {
        await t.test(label, () => {
            assert.deepEqual(exportDays(input), days);
        });
    }
});

test('exportDays adds every earlier day whose counts differ', async (t) => {
    const loaded = { '2026-10-20': 3, '2026-10-21': 1, '2026-10-22': 2, '2026-10-23': 1 };
    const cases: [string, Record<string, number>, Record<string, number>, string[]][] = [
        [
            'a short day stays once later days load',
            { '2026-10-19': 5, ...loaded },
            { '2026-10-19': 4, ...loaded },
            ['2026-10-22', '2026-10-23', '2026-10-19'],
        ],
        [
            'a day missing from BigQuery',
            { '2026-10-15': 2, ...loaded },
            loaded,
            ['2026-10-22', '2026-10-23', '2026-10-15'],
        ],
        [
            'a day BigQuery holds more of than the source',
            { '2026-10-17': 2, ...loaded },
            { '2026-10-17': 3, ...loaded },
            ['2026-10-22', '2026-10-23', '2026-10-17'],
        ],
        [
            'a day BigQuery holds that the source lacks',
            loaded,
            { '2026-10-16': 1, ...loaded },
            ['2026-10-22', '2026-10-23', '2026-10-16'],
        ],
        ['days that match', loaded, loaded, ['2026-10-22', '2026-10-23']],
    ];

    for (const [label, events, partitions, days] of cases) {
        await t.test(label, () => {
            assert.deepEqual(
                exportDays({
                    today: '2026-10-23',
                    events: counts(events),
                    partitions: counts(partitions),
                }),
                days,
            );
        });
    }
});

const REPLACED: Load = { outcome: 'replaced', late: null };

/**
 * An in-memory warehouse. Each partition is the parsed lines of its last
 * load, and a day is stale while any of its rows carries an `export_rules`
 * other than the run's. A load of a day in `failLoad` fails, its partition
 * kept, and a load of a day in `throwLoad` rejects.
 */
const fakeWarehouse = (
    partitions: Map<string, unknown[]>,
    { failLoad = [], throwLoad = [] }: { failLoad?: string[]; throwLoad?: string[] } = {},
) => {
    const calls: string[] = [];
    const warehouse: Warehouse = {
        async ensureTable() {
            calls.push('ensureTable');
        },
        async days(rules) {
            return {
                counts: new Map([...partitions].map(([day, rows]) => [day, rows.length])),
                stale: new Set(
                    [...partitions]
                        .filter(([, rows]) =>
                            rows.some(
                                (row) => (row as { export_rules?: string }).export_rules !== rules,
                            ),
                        )
                        .map(([day]) => day),
                ),
            };
        },
        async replaceDay(day, file) {
            if (throwLoad.includes(day)) {
                throw new Error('load client failed');
            }

            if (failLoad.includes(day)) {
                return { outcome: 'kept', error: new Error('load job failed') };
            }

            calls.push(`replace ${day}`);
            const text = await fs.readFile(file, 'utf8');
            partitions.set(
                day,
                text
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => JSON.parse(line)),
            );

            return REPLACED;
        },
    };

    return { warehouse, calls };
};

const fakeSource = (
    pages: Record<string, SourceEvent[][]>,
    failOn: readonly string[] = [],
    // Source counts that differ from the rows a day reads.
    counted: Record<string, number> = {},
): EventSource => ({
    async dayCounts() {
        return new Map([
            ...Object.entries(pages).map(
                ([day, dayPages]) => [day, dayPages.flat().length] as const,
            ),
            ...Object.entries(counted),
        ]);
    },
    async *readDay(day) {
        for (const page of pages[day] ?? []) {
            yield page;
        }

        if (failOn.includes(day)) {
            throw new Error('connection lost');
        }
    },
});

const scratch = () => path.join(os.tmpdir(), `event-export-test-${randomBytes(4).toString('hex')}`);

/** The day each of a run's day lines names, in order. */
const dayLines = (logged: string[]) =>
    logged.filter((line) => /^\d{4}-\d{2}-\d{2}:/.test(line)).map((line) => line.slice(0, 10));

test('runExport backfills an empty table day by day and logs each day', async () => {
    const partitions = new Map<string, unknown[]>();
    const { warehouse, calls } = fakeWarehouse(partitions);
    const first = sourceEvent({ id: 1, createdAt: '2026-10-20T08:00:00.000000Z' });
    const second = sourceEvent({ id: 2, createdAt: '2026-10-20T09:00:00.000000Z' });
    const third = sourceEvent({ id: 3, createdAt: '2026-10-22T09:00:00.000000Z' });
    const scratchFile = scratch();
    const logged: string[] = [];

    const loaded = await runExport({
        source: fakeSource({ '2026-10-20': [[first], [second]], '2026-10-22': [[third]] }),
        warehouse,
        hmacKey: KEY,
        today: '2026-10-22',
        scratchFile,
        log: (line) => logged.push(line),
    });

    assert.deepEqual(loaded, [
        { day: '2026-10-20', rows: 2 },
        { day: '2026-10-21', rows: 0 },
        { day: '2026-10-22', rows: 1 },
    ]);
    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-20', 'replace 2026-10-22']);
    assert.deepEqual(dayLines(logged), ['2026-10-20', '2026-10-21', '2026-10-22']);
    assert.deepEqual(partitions.get('2026-10-20'), [
        exportRow(first, KEY, RULES),
        exportRow(second, KEY, RULES),
    ]);
    assert.deepEqual(partitions.get('2026-10-22'), [exportRow(third, KEY, RULES)]);
    await assert.rejects(fs.access(scratchFile));
});

/**
 * A run of `days` on a fake clock: the start takes `setupMs` and each day's
 * read `perDayMs`, and the run stops at `stopAt`. Returns the days read and
 * loaded, the clock at the end, and whether the run rejected.
 */
const timedRun = async ({
    days,
    partitions = new Map(),
    today,
    setupMs = 0,
    perDayMs,
    stopAt,
}: {
    days: Record<string, SourceEvent[][]>;
    partitions?: Map<string, unknown[]>;
    today: string;
    setupMs?: number;
    perDayMs: number;
    stopAt: number;
}) => {
    let clock = 0;
    const source = fakeSource(days);
    const { warehouse, calls } = fakeWarehouse(partitions);
    const read: string[] = [];
    let rejected = false;

    try {
        await runExport({
            source: {
                ...source,
                async *readDay(day) {
                    read.push(day);
                    clock += perDayMs;
                    yield* source.readDay(day);
                },
            },
            warehouse: {
                ...warehouse,
                async ensureTable() {
                    clock += setupMs;
                    await warehouse.ensureTable();
                },
            },
            hmacKey: KEY,
            today,
            scratchFile: scratch(),
            log: () => undefined,
            stopAt,
            now: () => clock,
        });
    } catch {
        rejected = true;
    }

    return {
        read,
        loaded: calls.filter((call) => call.startsWith('replace')).map((call) => call.slice(8)),
        clock,
        rejected,
    };
};

const dayOfEvents = (day: string, id: number) => [
    [sourceEvent({ id, createdAt: `${day}T08:00:00.000000Z` })],
];

test('runExport starts a day only while its worst case fits before stopAt, and ends by then', async (t) => {
    const days = {
        '2026-10-20': dayOfEvents('2026-10-20', 1),
        '2026-10-21': dayOfEvents('2026-10-21', 2),
        '2026-10-22': dayOfEvents('2026-10-22', 3),
    };
    const all = Object.keys(days);
    const cases: [string, number, number, string[]][] = [
        ['every day fits', 1_000, 3 * DAY_WORST_MS, all],
        ['the third day would not fit', DAY_WORST_MS, 3 * DAY_WORST_MS - 1, all.slice(0, 2)],
        ['no day fits', 0, DAY_WORST_MS - 1, []],
    ];

    for (const [label, perDayMs, stopAt, started] of cases) {
        await t.test(label, async () => {
            const run = await timedRun({ days, today: '2026-10-22', perDayMs, stopAt });

            assert.deepEqual(run.read, started);
            assert.deepEqual(run.loaded, started);
            assert.equal(run.rejected, started.length < all.length);
            assert.ok(run.clock <= stopAt);
        });
    }
});

test('runExport rejects a source that reads empty and keeps every partition', async () => {
    const partitions = new Map<string, unknown[]>([
        ['2026-10-21', [{ id: 6 }]],
        ['2026-10-22', [{ id: 7 }]],
    ]);
    const before = structuredClone(partitions);
    const { warehouse, calls } = fakeWarehouse(partitions);

    await assert.rejects(
        runExport({
            source: fakeSource({}),
            warehouse,
            hmacKey: KEY,
            today: '2026-10-23',
            scratchFile: scratch(),
            log: () => undefined,
        }),
        (error: unknown) => {
            assert.ok(error instanceof EventExportError);
            assert.deepEqual(error.shortDays, [
                { day: '2026-10-21', read: 0, count: 1, countedIn: 'partition' },
                { day: '2026-10-22', read: 0, count: 1, countedIn: 'partition' },
            ]);
            assert.deepEqual([error.failedDays, error.daysLeft], [[], []]);
            return true;
        },
    );

    assert.deepEqual(partitions, before);
    assert.deepEqual(calls, ['ensureTable']);
});

test('runExport keeps a partition that holds more rows than the day reads', async () => {
    const held = [{ id: 5 }, { id: 6 }];
    const partitions = new Map<string, unknown[]>([['2026-10-22', held]]);
    const { warehouse, calls } = fakeWarehouse(partitions);
    const fresh = sourceEvent({ id: 9, createdAt: '2026-10-23T10:00:00.000000Z' });
    const scratchFile = scratch();
    const logged: string[] = [];

    await assert.rejects(
        runExport({
            source: fakeSource({
                '2026-10-22': [[sourceEvent({ id: 6, createdAt: '2026-10-22T10:00:00.000000Z' })]],
                '2026-10-23': [[fresh]],
            }),
            warehouse,
            hmacKey: KEY,
            today: '2026-10-23',
            scratchFile,
            log: (line) => logged.push(line),
        }),
        (error: unknown) => {
            assert.ok(error instanceof EventExportError);
            assert.deepEqual(error.shortDays, [
                { day: '2026-10-22', read: 1, count: 2, countedIn: 'partition' },
            ]);
            assert.deepEqual([error.failedDays, error.daysLeft], [[], []]);
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-23']);
    assert.equal(partitions.get('2026-10-22'), held);
    assert.deepEqual(partitions.get('2026-10-23'), [exportRow(fresh, KEY, RULES)]);
    assert.deepEqual(dayLines(logged), ['2026-10-21', '2026-10-22', '2026-10-23']);
    await assert.rejects(fs.access(scratchFile));
});

test('runExport rechecks an earlier day whose counts differ until they match', async (t) => {
    const at = (id: number, day: string) =>
        sourceEvent({ id, createdAt: `${day}T10:00:00.000000Z` });
    const later: Record<string, SourceEvent[][]> = Object.fromEntries(
        ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((day, i) => [
            day,
            [[at(20 + i, day)]],
        ]),
    );
    const cases: {
        label: string;
        held: unknown[] | null;
        read: SourceEvent[];
        // Source counts that differ from the rows each day reads.
        counted?: Record<string, number>;
        calls: string[];
        short: RegExp | null;
    }[] = [
        {
            label: 'a short 19 October fails the run after 23 October loads',
            held: [{ id: 1 }, { id: 2 }],
            read: [at(2, '2026-10-19')],
            calls: ['ensureTable', 'replace 2026-10-22', 'replace 2026-10-23'],
            short: /2026-10-19\D+1\D+2\b/,
        },
        {
            label: 'a 19 October missing from BigQuery loads after 23 October loads',
            held: null,
            read: [at(1, '2026-10-19'), at(2, '2026-10-19')],
            calls: [
                'ensureTable',
                'replace 2026-10-22',
                'replace 2026-10-23',
                'replace 2026-10-19',
            ],
            short: null,
        },
        {
            label: 'a 19 October that reads none of its 3 events fails the run',
            held: null,
            read: [],
            counted: { '2026-10-19': 3 },
            calls: ['ensureTable', 'replace 2026-10-22', 'replace 2026-10-23'],
            short: /2026-10-19\D+0\D+3\b/,
        },
        {
            label: 'a 19 October that reads 2 of its 3 events loads and fails the run',
            held: [{ id: 1 }],
            read: [at(1, '2026-10-19'), at(2, '2026-10-19')],
            counted: { '2026-10-19': 3 },
            calls: [
                'ensureTable',
                'replace 2026-10-22',
                'replace 2026-10-23',
                'replace 2026-10-19',
            ],
            short: /2026-10-19\D+2\D+3\b/,
        },
        {
            label: 'a read above the count, from events after it, loads today',
            held: null,
            read: [],
            counted: { '2026-10-23': 0 },
            calls: ['ensureTable', 'replace 2026-10-22', 'replace 2026-10-23'],
            short: null,
        },
    ];

    for (const { label, held, read, counted = {}, calls: expectedCalls, short } of cases) {
        await t.test(label, async () => {
            const partitions = new Map<string, unknown[]>(
                Object.entries(later).map(([day, dayPages]) => [
                    day,
                    dayPages.flat().map((row) => exportRow(row, KEY, RULES)),
                ]),
            );

            if (held !== null) {
                partitions.set('2026-10-19', held);
            }

            const { warehouse, calls } = fakeWarehouse(partitions);
            const run = runExport({
                source: fakeSource({ '2026-10-19': [read], ...later }, [], counted),
                warehouse,
                hmacKey: KEY,
                today: '2026-10-23',
                scratchFile: scratch(),
                log: () => undefined,
            });

            if (short === null) {
                await run;
            } else {
                await assert.rejects(run, short);
            }

            assert.deepEqual(calls, expectedCalls);
            assert.deepEqual(
                partitions.get('2026-10-23'),
                later['2026-10-23']!.flat().map((row) => exportRow(row, KEY, RULES)),
            );
            assert.deepEqual(
                partitions.get('2026-10-19'),
                calls.includes('replace 2026-10-19')
                    ? read.map((row) => exportRow(row, KEY, RULES))
                    : (held ?? undefined),
            );
        });
    }
});

test('runExport loads the days after a failed one, then names every failed day', async () => {
    const kept = [{ id: 7 }];
    const partitions = new Map<string, unknown[]>([
        ['2026-10-21', [{ id: 6 }]],
        ['2026-10-22', kept],
    ]);
    const before = structuredClone(partitions);
    const { warehouse, calls } = fakeWarehouse(partitions, { failLoad: ['2026-10-22'] });
    const fresh = sourceEvent({ id: 9, createdAt: '2026-10-23T10:00:00.000000Z' });
    const scratchFile = scratch();
    const logged: string[] = [];

    await assert.rejects(
        runExport({
            source: fakeSource(
                {
                    '2026-10-21': [[sourceEvent({ id: 6 })]],
                    '2026-10-22': [[sourceEvent({ id: 7 })]],
                    '2026-10-23': [[fresh]],
                },
                ['2026-10-21'],
            ),
            warehouse,
            hmacKey: KEY,
            today: '2026-10-23',
            scratchFile,
            log: (line) => logged.push(line),
        }),
        (error: unknown) => {
            assert.ok(error instanceof EventExportError);
            assert.deepEqual(error.failedDays, [
                { day: '2026-10-21', outcome: 'kept' },
                { day: '2026-10-22', outcome: 'kept' },
            ]);
            // The fakes' own errors: the source's failed read and the load's.
            assert.deepEqual(
                error.errors.map((cause: Error) => cause.message),
                ['connection lost', 'load job failed'],
            );
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-23']);
    assert.deepEqual(dayLines(logged), ['2026-10-21', '2026-10-22', '2026-10-23']);
    assert.deepEqual(partitions.get('2026-10-21'), before.get('2026-10-21'));
    assert.equal(partitions.get('2026-10-22'), kept);
    assert.deepEqual(partitions.get('2026-10-23'), [exportRow(fresh, KEY, RULES)]);
    await assert.rejects(fs.access(scratchFile));
});

test('runExport fails a day whose load rejects as unknown and loads the next day', async () => {
    const { warehouse, calls } = fakeWarehouse(new Map(), { throwLoad: ['2026-10-22'] });

    await assert.rejects(
        runExport({
            source: fakeSource({
                '2026-10-22': [[sourceEvent({ id: 1, createdAt: '2026-10-22T08:00:00.000000Z' })]],
                '2026-10-23': [[sourceEvent({ id: 2, createdAt: '2026-10-23T08:00:00.000000Z' })]],
            }),
            warehouse,
            hmacKey: KEY,
            today: '2026-10-23',
            scratchFile: scratch(),
            log: () => undefined,
        }),
        (error: unknown) => {
            assert.ok(error instanceof EventExportError);
            assert.deepEqual(error.failedDays, [{ day: '2026-10-22', outcome: 'unknown' }]);
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-23']);
});

test('runExport reloads the days holding rows under other rules, and retries a failed one alone', async () => {
    const at = (id: number, day: string) =>
        sourceEvent({ id, createdAt: `${day}T10:00:00.000000Z` });
    const pages = Object.fromEntries(
        ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'].map((day, i) => [
            day,
            [[at(i + 1, day)]],
        ]),
    );
    // 18 and 20 October hold rows under old rules, 19 October under these.
    const partitions = new Map<string, unknown[]>(
        Object.entries(pages).map(([day, dayPages]) => [
            day,
            dayPages.flat().map((row) => ({
                ...exportRow(row, KEY, RULES),
                ...(day === '2026-10-19' ? {} : { export_rules: 'old-rules' }),
            })),
        ]),
    );
    const first = fakeWarehouse(partitions);

    await assert.rejects(
        runExport({
            source: fakeSource(pages, ['2026-10-18']),
            warehouse: first.warehouse,
            hmacKey: KEY,
            today: '2026-10-22',
            scratchFile: scratch(),
            log: () => undefined,
        }),
        (error: unknown) => {
            assert.ok(error instanceof EventExportError);
            assert.deepEqual(error.failedDays, [{ day: '2026-10-18', outcome: 'kept' }]);
            return true;
        },
    );
    assert.deepEqual(first.calls, [
        'ensureTable',
        'replace 2026-10-21',
        'replace 2026-10-22',
        'replace 2026-10-20',
    ]);
    assert.deepEqual(partitions.get('2026-10-20'), [exportRow(at(3, '2026-10-20'), KEY, RULES)]);

    const second = fakeWarehouse(partitions);

    await runExport({
        source: fakeSource(pages),
        warehouse: second.warehouse,
        hmacKey: KEY,
        today: '2026-10-22',
        scratchFile: scratch(),
        log: () => undefined,
    });
    assert.deepEqual(second.calls, [
        'ensureTable',
        'replace 2026-10-21',
        'replace 2026-10-22',
        'replace 2026-10-18',
    ]);
});

test('runExport names the short days beside a failed day', async () => {
    const partitions = new Map<string, unknown[]>([['2026-10-21', [{ id: 5 }, { id: 6 }]]]);
    const { warehouse, calls } = fakeWarehouse(partitions);

    await assert.rejects(
        runExport({
            source: fakeSource(
                {
                    '2026-10-21': [[sourceEvent({ id: 6 })]],
                    '2026-10-22': [[sourceEvent({ id: 9 })]],
                },
                ['2026-10-22'],
            ),
            warehouse,
            hmacKey: KEY,
            today: '2026-10-22',
            scratchFile: scratch(),
            log: () => undefined,
        }),
        (error: unknown) => {
            assert.ok(error instanceof EventExportError);
            assert.deepEqual(error.failedDays, [{ day: '2026-10-22', outcome: 'kept' }]);
            assert.deepEqual(error.shortDays, [
                { day: '2026-10-21', read: 1, count: 2, countedIn: 'partition' },
            ]);
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable']);
    assert.equal(partitions.get('2026-10-21')?.length, 2);
});

test(
    'a day whose pages each answer in time but together run past the read deadline fails, and the next day loads',
    { timeout: 5_000 },
    async () => {
        const partitions = new Map<string, unknown[]>();
        const { warehouse, calls } = fakeWarehouse(partitions);
        // The day each page query reads.
        const pages: string[] = [];
        const db = {
            query: async (sql: string, params: unknown[] = []) => {
                if (sql !== ROW_SHAPE.READ_DAY_SQL) {
                    return [
                        { day: '2026-10-21', n: 1 },
                        { day: '2026-10-22', n: 1 },
                    ];
                }

                const [after, , afterId] = params;
                const day = String(after).slice(0, 10);

                pages.push(day);

                // 21 October answers a full page every 20 ms without end, 22
                // October one row.
                if (day === '2026-10-21') {
                    await sleep(20);
                    return [
                        sourceEvent({ id: pages.length, createdAt: `${day}T08:00:00.000000Z` }),
                    ];
                }

                return afterId === 0
                    ? [sourceEvent({ id: 100, createdAt: `${day}T08:00:00.000000Z` })]
                    : [];
            },
        } as unknown as ExportDb;
        const started = performance.now();

        await assert.rejects(
            runExport({
                source: pgEventSource(db, { pageSize: 1, readMs: 50 }),
                warehouse,
                hmacKey: KEY,
                today: '2026-10-22',
                scratchFile: scratch(),
                log: () => undefined,
            }),
        );

        assert.ok(performance.now() - started < 1_000);
        // 50 ms of 20 ms pages: no page starts past the deadline.
        assert.ok(pages.filter((day) => day === '2026-10-21').length <= 4);
        assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-22']);
    },
);

test('bigQueryWarehouse loads a day into its partition and lets the schema gain columns', async () => {
    const loads: [string, string, Record<string, unknown>][] = [];
    const bigquery = {
        load: async (table: string, file: string, metadata: Record<string, unknown>) => {
            loads.push([table, file, metadata]);
            return REPLACED;
        },
    } as unknown as ExportBigQuery;
    const warehouse = bigQueryWarehouse({ bigquery });

    assert.deepEqual(await warehouse.replaceDay('2026-10-22', '/tmp/day.ndjson'), REPLACED);
    assert.equal(loads.length, 1);
    assert.equal(loads[0]?.[0], 'event$20261022');
    assert.equal(loads[0]?.[1], '/tmp/day.ndjson');
    assert.equal(loads[0]?.[2].writeDisposition, 'WRITE_TRUNCATE');
    assert.deepEqual(loads[0]?.[2].schemaUpdateOptions, ['ALLOW_FIELD_ADDITION']);
});

test('EXPORT_SCHEMA admits a REQUIRED column only among those the table was created with', () => {
    // @ts-expect-error ALLOW_FIELD_ADDITION adds NULLABLE columns only.
    const required: ExportField = { name: 'added', type: 'STRING', mode: 'REQUIRED' };
    const nullable: ExportField = { name: 'added', type: 'STRING' };

    assert.ok(required && nullable);
});

test('bigQueryWarehouse creates the table, and counts rows and finds stale days per day', async (t) => {
    const fakeTable = ({ exists, fields = [] }: { exists: boolean; fields?: string[] }) => {
        const calls: unknown[] = [];
        const bigquery = {
            tableExists: async () => exists,
            tableFields: async () => fields.map((name) => ({ name })),
            createTable: async (name: string, options: { schema: unknown }) => {
                calls.push(['createTable', name, options.schema]);
            },
            query: async (query: string, params?: unknown) => {
                // The table itself, so each count is exact.
                calls.push(['query', query.match(/FROM (\w+)/)?.[1], params]);
                const stale = fields.includes('export_rules') ? [true, false] : [true, true];
                return [
                    { day: '2026-10-21', n: 3, stale: stale[0] },
                    { day: '2026-10-22', n: 1434, stale: stale[1] },
                ];
            },
        } as unknown as ExportBigQuery;
        const warehouse = bigQueryWarehouse({ bigquery });

        return { warehouse, calls };
    };
    const counts = new Map([
        ['2026-10-21', 3],
        ['2026-10-22', 1434],
    ]);

    await t.test('a missing table is created with the schema', async () => {
        const { warehouse, calls } = fakeTable({ exists: false });

        await warehouse.ensureTable();
        assert.deepEqual(calls, [['createTable', 'event', { fields: EXPORT_SCHEMA }]]);
    });

    await t.test('one query over the table counts each day and finds the stale ones', async () => {
        const { warehouse, calls } = fakeTable({ exists: true, fields: ['id', 'export_rules'] });

        assert.deepEqual(await warehouse.days('r1'), {
            counts,
            stale: new Set(['2026-10-21']),
        });
        assert.deepEqual(calls, [['query', 'event', { rules: 'r1' }]]);
    });

    await t.test('a table without export_rules is stale on every day', async () => {
        const { warehouse, calls } = fakeTable({ exists: true, fields: ['id'] });

        assert.deepEqual(await warehouse.days('r1'), {
            counts,
            stale: new Set(['2026-10-21', '2026-10-22']),
        });
        assert.deepEqual(calls, [['query', 'event', { rules: 'r1' }]]);
    });

    await t.test('a query over the bytes-billed cap fails naming the cap', async () => {
        const bigquery = {
            tableFields: async () => [{ name: 'export_rules' }],
            query: async () => {
                throw new Error('Query exceeded limit for bytes billed: 1000000000.');
            },
        } as unknown as ExportBigQuery;
        const warehouse = bigQueryWarehouse({ bigquery });

        await assert.rejects(warehouse.days('r1'), /maximumBytesBilled cap/);
    });
});

test('runExportJob runs both exports, failed or not, then fails with every failure', async (t) => {
    const accountError = new Error('bigquery down');
    const eventError = new Error('2026-10-21: load job failed');
    // The errors the run rejects with, each read back to the phase's own error.
    const cases: [string, () => Promise<void>, (error: unknown) => unknown[]][] = [
        ['the account export alone', async () => undefined, (error) => [(error as Error).cause]],
        [
            'both',
            async () => {
                throw eventError;
            },
            (error) => {
                assert.ok(error instanceof AggregateError);
                const [account, event] = error.errors as Error[];

                return [account?.cause, event];
            },
        ],
    ];

    for (const [label, exportEvents, phaseErrors] of cases) {
        await t.test(label, async () => {
            const ran: string[] = [];

            await assert.rejects(
                runExportJob({
                    exportAccounts: async () => {
                        ran.push('accounts');
                        throw accountError;
                    },
                    exportEvents: async () => {
                        ran.push('events');
                        await exportEvents();
                    },
                }),
                (error: unknown) => {
                    assert.deepEqual(
                        phaseErrors(error),
                        label === 'both' ? [accountError, eventError] : [accountError],
                    );
                    return true;
                },
            );
            assert.deepEqual(ran.toSorted(), ['accounts', 'events']);
        });
    }
});

const hang = () => new Promise<never>(() => undefined);

/** What a run stopped by runAndExit's deadline reports, from its one logged error. */
const stopReport = async (main: Parameters<typeof runAndExit>[0], deadlineMs = 20) => {
    const exits: number[] = [];
    const logged: unknown[] = [];

    await runAndExit(main, {
        deadlineMs,
        exit: (code) => exits.push(code),
        logError: (error) => logged.push(error),
    });

    assert.deepEqual(exits, [1]);
    assert.equal(logged.length, 1);

    const [error] = logged;

    assert.ok(error instanceof ExportJobError);

    const { events, accounts, unknown, unstarted, faults } = error;

    return { events, accounts, unknown, unstarted, faults };
};

const NOTHING_LEFT = { unknown: [], unstarted: [], faults: [] };

test(
    'runExportJob runs the account export to its end while the event export hangs',
    { timeout: 2_000 },
    async () => {
        let accountsEnded = false;

        assert.deepEqual(
            await stopReport((progress) =>
                runExportJob({
                    exportEvents: hang,
                    exportAccounts: async () => {
                        await sleep(1);
                        accountsEnded = true;
                    },
                    progress,
                }),
            ),
            { events: 'the start', accounts: 'done', ...NOTHING_LEFT },
        );
        assert.ok(accountsEnded);
    },
);

test(
    'the account export loads all three tables while the event export waits on day counts that never answer',
    { timeout: 2_000 },
    async () => {
        const unanswered = { query: hang, snapshot: hang } as unknown as ExportDb;
        const loaded: string[] = [];

        assert.deepEqual(
            await stopReport(
                (progress) =>
                    runExportJob({
                        exportEvents: () =>
                            runExport({
                                source: pgEventSource(unanswered),
                                warehouse: fakeWarehouse(new Map()).warehouse,
                                hmacKey: KEY,
                                today: '2026-10-22',
                                scratchFile: scratch(),
                                log: () => undefined,
                                progress,
                            }),
                        exportAccounts: () =>
                            runAccountExport({
                                readAccounts: async () => ({
                                    rows: [
                                        { day: '2026-10-21', organisation: 'one.org', accounts: 3 },
                                    ],
                                    organisations: [{ userId: 'user-1', organisation: 'one.org' }],
                                    webmailDomains: true,
                                }),
                                readConversations: async () => [],
                                replace: async (table) => {
                                    loaded.push(table);
                                    return REPLACED;
                                },
                                hmacKey: KEY,
                                scratchFile: scratch(),
                                log: () => undefined,
                                progress,
                            }),
                        progress,
                    }),
                200,
            ),
            { events: 'the event table check and day counts', accounts: 'done', ...NOTHING_LEFT },
        );
        assert.deepEqual(loaded, ['account_daily', 'account_organisation', 'conversation']);
    },
);

test(
    'a phase that fails marks its step failed and gives its error to the deadline report',
    { timeout: 2_000 },
    async () => {
        const failure = new Error('event table check failed');
        const logged: unknown[] = [];

        await runAndExit(
            (progress) =>
                runExportJob({
                    exportEvents: async () => {
                        throw failure;
                    },
                    exportAccounts: hang,
                    progress,
                }),
            { deadlineMs: 20, exit: () => undefined, logError: (error) => logged.push(error) },
        );

        const [error] = logged;

        assert.ok(error instanceof ExportJobError);
        assert.equal(error.cause, failure);
        assert.deepEqual(
            [error.events, error.accounts],
            [`failed: ${failure.message}`, 'the start'],
        );
    },
);

test(
    "the deadline report leaves a failed phase's faults to its error",
    { timeout: 2_000 },
    async () => {
        const logged: unknown[] = [];
        let failures: JobProgress['failures'] = {};

        await runAndExit(
            (progress) => {
                failures = progress.failures;

                return runExportJob({
                    exportEvents: () =>
                        runExport({
                            source: fakeSource({
                                '2026-10-22': [
                                    [
                                        sourceEvent({
                                            id: 1,
                                            createdAt: '2026-10-22T08:00:00.000000Z',
                                        }),
                                    ],
                                ],
                            }),
                            warehouse: fakeWarehouse(new Map(), { failLoad: ['2026-10-22'] })
                                .warehouse,
                            hmacKey: KEY,
                            today: '2026-10-22',
                            scratchFile: scratch(),
                            log: () => undefined,
                            progress,
                        }),
                    exportAccounts: hang,
                    progress,
                });
            },
            { deadlineMs: 200, exit: () => undefined, logError: (error) => logged.push(error) },
        );

        const [error] = logged;

        assert.ok(error instanceof ExportJobError);
        assert.ok(error.cause instanceof EventExportError);
        assert.equal(error.cause, failures.events);
        assert.deepEqual(error.cause.failedDays, [{ day: '2026-10-22', outcome: 'kept' }]);
        assert.deepEqual(error.faults, []);
    },
);

test('runAndExit names each failed phase once in its report', async () => {
    const logged: unknown[] = [];

    await runAndExit(
        (progress) =>
            runExportJob({
                exportEvents: async () => {
                    throw new EventExportError(
                        '2026-10-22: load job failed',
                        [new Error('load job failed')],
                        {
                            failedDays: [{ day: '2026-10-22', outcome: 'kept' }],
                            shortDays: [],
                            daysLeft: [],
                        },
                    );
                },
                exportAccounts: async () => {
                    throw new AccountExportError(
                        [new Error('load job failed')],
                        [{ table: 'account_daily', outcome: 'kept' }],
                    );
                },
                progress,
            }),
        { exit: () => undefined, logError: (error) => logged.push(error) },
    );

    const [error] = logged;

    assert.ok(error instanceof ExportJobError);

    for (const phase of ['event export', 'account export']) {
        assert.equal(error.message.split(phase).length - 1, 1, phase);
    }
});

test(
    'runAndExit stops a run hung past its deadline, names each phase and exits 1',
    { timeout: 5_000 },
    async (t) => {
        const source = fakeSource({
            '2026-10-21': [[sourceEvent({ id: 1, createdAt: '2026-10-21T08:00:00.000000Z' })]],
            '2026-10-22': [[sourceEvent({ id: 2, createdAt: '2026-10-22T08:00:00.000000Z' })]],
            '2026-10-23': [[sourceEvent({ id: 3, createdAt: '2026-10-23T08:00:00.000000Z' })]],
        });
        const run = (
            progress: Parameters<Parameters<typeof runAndExit>[0]>[0],
            warehouse: Warehouse,
        ) =>
            runExport({
                source: {
                    ...source,
                    async *readDay(day) {
                        if (day === '2026-10-22') {
                            yield await hang();
                        }

                        yield* source.readDay(day);
                    },
                },
                warehouse,
                hmacKey: KEY,
                today: '2026-10-23',
                scratchFile: scratch(),
                log: () => undefined,
                progress,
            });
        const cases: [
            string,
            Parameters<typeof runAndExit>[0],
            Awaited<ReturnType<typeof stopReport>>,
        ][] = [
            [
                'a hung account export',
                (progress) =>
                    runExportJob({
                        exportAccounts: hang,
                        exportEvents: async () => undefined,
                        progress,
                    }),
                { events: 'done', accounts: 'the start', ...NOTHING_LEFT },
            ],
            [
                "a hung day's read after a failed day",
                (progress) =>
                    run(progress, fakeWarehouse(new Map(), { failLoad: ['2026-10-21'] }).warehouse),
                {
                    events: 'the read of 2026-10-22',
                    accounts: 'the start',
                    unknown: [],
                    unstarted: ['2026-10-23'],
                    faults: ['2026-10-21: load job failed'],
                },
            ],
            [
                'a load in flight, whose outcome is unknown',
                (progress) =>
                    run(progress, { ...fakeWarehouse(new Map()).warehouse, replaceDay: hang }),
                {
                    events: 'the load of 2026-10-21',
                    accounts: 'the start',
                    unknown: ['2026-10-21'],
                    unstarted: ['2026-10-22', '2026-10-23'],
                    faults: [],
                },
            ],
        ];

        for (const [label, main, report] of cases) {
            // A run with no watchdog never ends, so each case is bounded.
            await t.test(label, { timeout: 2_000 }, async () => {
                assert.deepEqual(await stopReport(main), report);
            });
        }
    },
);

test("runAndExit names a failed phase's error once, in that phase's line", async () => {
    const failure = new Error('event table check failed');
    const logged: unknown[] = [];

    await runAndExit(
        (progress) =>
            runExportJob({
                exportEvents: async () => {
                    throw failure;
                },
                exportAccounts: async () => undefined,
                progress,
            }),
        { exit: () => undefined, logError: (error) => logged.push(error) },
    );

    const [error] = logged;

    assert.ok(error instanceof ExportJobError);
    assert.equal(error.cause, failure);
    assert.equal(error.events, `failed: ${failure.message}`);
    assert.deepEqual(error.faults, []);
});

test('runAndExit exits with 0 after main resolves, and with 1 after one error naming each phase when it rejects', async (t) => {
    const failure = new Error('table check failed');
    const cases: [string, Parameters<typeof runAndExit>[0], number, [string, string][]][] = [
        ['a run that succeeds', async () => undefined, 0, []],
        [
            'a run that fails',
            async (progress) => {
                progress.events = 'the event table check and day counts';
                throw failure;
            },
            1,
            [['the event table check and day counts', 'the start']],
        ],
    ];

    for (const [label, main, code, phases] of cases) {
        await t.test(label, async () => {
            const exits: number[] = [];
            const logged: unknown[] = [];

            await runAndExit(main, {
                exit: (exitCode) => exits.push(exitCode),
                logError: (error) => logged.push(error),
            });

            assert.deepEqual(exits, [code]);
            assert.ok(logged.every((error) => error instanceof ExportJobError));
            assert.deepEqual(
                (logged as ExportJobError[]).map(({ events, accounts }) => [events, accounts]),
                phases,
            );
            assert.ok((logged as ExportJobError[]).every(({ cause }) => cause === failure));
        });
    }
});

test('runAndExit passes main the deadline it stops the run at', async () => {
    let deadlineAt = 0;
    const before = Date.now();

    await runAndExit(
        async (_progress, at) => {
            deadlineAt = at;
        },
        { deadlineMs: 60_000, exit: () => undefined, logError: () => undefined },
    );

    assert.ok(deadlineAt >= before + 60_000 && deadlineAt <= Date.now() + 60_000);
});

/**
 * Reads a migrated database as a login member of `website_export_reader`,
 * the way the Job's IAM user reads it, and checks each UTC day's rows
 * against Postgres's own per-day count. The page size is 2, so every day
 * spans pages, rows sit either side of a midnight, three rows share one
 * time across a page boundary, and each row's props hold a key no event
 * keeps. A short page ends a day's read without a further query.
 */
test('the export reader reads every row of each UTC day and no other table', async (t) => {
    const database = await createTestDatabase();
    const admin = database.adminPool();
    const reader = `test_export_${randomBytes(4).toString('hex')}`;
    const password = randomBytes(16).toString('hex');
    let readerPool: Pool | null = null;

    t.after(async () => {
        await readerPool?.end();
        await admin.query(`drop role if exists "${reader}"`);
        await database.teardown();
    });

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    await admin.query(
        `create role "${reader}" login password '${password}' in role ${EXPORT_READER_ROLE}`,
    );
    await database.runtimePool().query(
        `insert into event (name, created_at, user_id, visitor_id, page, props)
         select 'search.query', ts::timestamptz, null, 'v', '/data',
                '{"post": 0, "query": "aid to kenya"}'
         from unnest($1::text[]) ts`,
        [
            [
                '2026-10-19T23:59:59.999999Z',
                '2026-10-20T00:00:00Z',
                '2026-10-20T11:00:00Z',
                '2026-10-20T23:59:59.999999Z',
                '2026-10-21T00:00:00.000001Z',
                '2026-10-22T05:00:00Z',
                '2026-10-22T05:00:00Z',
                '2026-10-22T05:00:00Z',
            ],
        ],
    );

    readerPool = new Pool({
        host: process.env.PGHOST ?? 'localhost',
        port: Number(process.env.PGPORT ?? 5433),
        user: reader,
        password,
        database: database.databaseName,
        max: 1,
    });

    const db = exportDb(readerPool);
    // The statements readDay sends, by text.
    const pageQueries: string[] = [];
    const source = pgEventSource(
        {
            ...db,
            query: (text: string, values?: unknown[]) => {
                pageQueries.push(text);
                return db.query(text, values);
            },
        },
        { pageSize: 2 },
    );
    const { rows: expected } = await admin.query<{ day: string; count: number }>(
        `select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
                count(*)::int as count
         from event group by 1 order by 1`,
    );
    const read: { day: string; count: number }[] = [];
    const ids: number[] = [];

    for (const { day } of expected) {
        let count = 0;

        for await (const page of source.readDay(day)) {
            assert.ok(page.every((row) => row.createdAt.startsWith(day)));
            assert.ok(page.every((row) => Object.keys(row.props).join() === 'post'));
            count += page.length;
            ids.push(...page.map((row) => row.id));
        }

        read.push({ day, count });
    }

    assert.deepEqual(read, expected);
    // Days of 1, 3, 1 and 3 rows take 1, 2, 1 and 2 page queries, each the
    // SQL the export_rules digest covers.
    const pages = pageQueries.filter((text) => text === ROW_SHAPE.READ_DAY_SQL);

    assert.equal(pages.length, 6);
    // Each page is one statement of its own, with no transaction around them.
    assert.equal(pages.length, pageQueries.length);
    // The three rows that share 05:00 on 22 October span two pages.
    assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(
        expected.map(({ count }) => count),
        [1, 3, 1, 3],
    );
    assert.deepEqual(
        await source.dayCounts(),
        new Map(expected.map(({ day, count }) => [day, count])),
    );
    await assert.rejects(readerPool.query('select 1 from feedback'), /permission denied/);
});
