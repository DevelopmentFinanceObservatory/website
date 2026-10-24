import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BigQuery } from '@google-cloud/bigquery';
import { Pool } from 'pg';
import { applyMigrations } from '../apply-migrations.ts';
import {
    bigQueryWarehouse,
    EXPORT_SCHEMA,
    type EventSource,
    exportDays,
    type ExportField,
    exportRow,
    type ExportRow,
    exportRules,
    pgEventSource,
    runExport,
    ROW_SHAPE,
    ROW_SHAPE_VERSION,
    runAndExit,
    runExportJob,
    type SourceEvent,
    type Warehouse,
} from '../event-export.ts';
import { EXPORT_READER_ROLE } from '../local-roles.ts';
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
    ];

    for (const [label, overrides] of cases) {
        await t.test(label, () => {
            assert.deepEqual(exportRow(sourceEvent(overrides), KEY, RULES).props, {});
        });
    }
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
];

// Each ROW_SHAPE_VERSION's rows for GOLDEN_SAMPLE under KEY, with rules
// `r`. A change to the rows adds the next version with its rows, and an
// entry never changes.
const GOLDEN_ROWS: Record<number, ExportRow[]> = {
    1: [
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
    ],
};

test('exportRow writes the rows pinned to the current ROW_SHAPE_VERSION', () => {
    assert.deepEqual(
        GOLDEN_SAMPLE.map((row) => exportRow(row, KEY, 'r')),
        GOLDEN_ROWS[ROW_SHAPE_VERSION],
    );
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

/**
 * An in-memory warehouse. Each partition is the parsed lines of its last
 * load, and a day is stale while any of its rows carries an `export_rules`
 * other than the run's. A load of a day in `failLoad` throws.
 */
const fakeWarehouse = (
    partitions: Map<string, unknown[]>,
    { failLoad = [] }: { failLoad?: string[] } = {},
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
            if (failLoad.includes(day)) {
                throw new Error('load job failed');
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
    assert.deepEqual(
        logged.map((line) => line.slice(0, 10)),
        ['2026-10-20', '2026-10-21', '2026-10-22'],
    );
    assert.deepEqual(partitions.get('2026-10-20'), [
        exportRow(first, KEY, RULES),
        exportRow(second, KEY, RULES),
    ]);
    assert.deepEqual(partitions.get('2026-10-22'), [exportRow(third, KEY, RULES)]);
    await assert.rejects(fs.access(scratchFile));
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
            assert.ok(error instanceof Error);
            assert.match(error.message, /2026-10-21\D+0\D+1\b/);
            assert.match(error.message, /2026-10-22\D+0\D+1\b/);
            assert.doesNotMatch(error.message, /2026-10-23/);
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
            assert.ok(error instanceof Error);
            assert.match(error.message, /2026-10-22\D+1\D+2\b/);
            assert.doesNotMatch(error.message, /2026-10-2[13]/);
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-23']);
    assert.equal(partitions.get('2026-10-22'), held);
    assert.deepEqual(partitions.get('2026-10-23'), [exportRow(fresh, KEY, RULES)]);
    assert.deepEqual(
        logged.map((line) => line.slice(0, 10)),
        ['2026-10-21', '2026-10-22', '2026-10-23'],
    );
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
            assert.ok(error instanceof Error);
            assert.equal(
                error.message,
                'event export 2026-10-21: connection lost; 2026-10-22: load job failed',
            );
            assert.ok(error.cause instanceof AggregateError);
            assert.deepEqual(
                error.cause.errors.map((cause: Error) => cause.message),
                ['connection lost', 'load job failed'],
            );
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-23']);
    assert.deepEqual(
        logged.map((line) => line.slice(0, 10)),
        ['2026-10-21', '2026-10-22', '2026-10-23'],
    );
    assert.deepEqual(partitions.get('2026-10-21'), before.get('2026-10-21'));
    assert.equal(partitions.get('2026-10-22'), kept);
    assert.deepEqual(partitions.get('2026-10-23'), [exportRow(fresh, KEY, RULES)]);
    await assert.rejects(fs.access(scratchFile));
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
        /event export 2026-10-18: connection lost$/,
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
            assert.ok(error instanceof Error);
            assert.match(error.message, /^event export 2026-10-22: /);
            assert.match(error.message, /2026-10-21\D+1\D+2\b/);
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable']);
    assert.equal(partitions.get('2026-10-21')?.length, 2);
});

test(
    'a page query that hangs past the read deadline fails its day, destroys its client, and the next day loads',
    { timeout: 5_000 },
    async () => {
        const partitions = new Map<string, unknown[]>();
        const { warehouse, calls } = fakeWarehouse(partitions);
        // Each client's queries by text, and what it was released with.
        const clients: { queries: string[]; released?: Error | 'reused' }[] = [];
        const pool = {
            options: {},
            connect: async () => {
                const client: (typeof clients)[number] = { queries: [] };
                clients.push(client);

                return {
                    query: (text: string, values?: unknown[]) => {
                        client.queries.push(text.split(/\s/, 1)[0]!);

                        if (text.includes('count(*)')) {
                            return Promise.resolve({
                                rows: [
                                    { day: '2026-10-21', n: 1 },
                                    { day: '2026-10-22', n: 1 },
                                ],
                            });
                        }

                        if (text !== ROW_SHAPE.READ_DAY_SQL) {
                            return Promise.resolve({ rows: [] });
                        }

                        // 21 October's page never answers, as over a stalled tunnel.
                        return String(values?.[0]).startsWith('2026-10-21')
                            ? new Promise(() => undefined)
                            : Promise.resolve({
                                  rows: [
                                      sourceEvent({
                                          id: 2,
                                          createdAt: '2026-10-22T08:00:00.000000Z',
                                      }),
                                  ],
                              });
                    },
                    release: (error?: Error) => {
                        client.released = error ?? 'reused';
                    },
                };
            },
        } as unknown as Pool;
        const started = Date.now();

        await assert.rejects(
            runExport({
                source: pgEventSource(pool, { readMs: 50, graceMs: 20 }),
                warehouse,
                hmacKey: KEY,
                today: '2026-10-22',
                scratchFile: scratch(),
                log: () => undefined,
            }),
            /event export 2026-10-21: read ran past its 0.05 s deadline$/,
        );

        // The 50 ms deadline plus the 20 ms grace, with room for a slow machine.
        assert.ok(Date.now() - started < 1_000);
        // The day counts' client, then each day's.
        assert.deepEqual(clients[0], { queries: ['SELECT'], released: 'reused' });
        assert.deepEqual(clients[1]?.queries, ['SELECT']);
        assert.ok(clients[1]?.released instanceof Error);
        assert.deepEqual(clients[2], { queries: ['SELECT'], released: 'reused' });
        assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-22']);
    },
);

test(
    'pgEventSource dayCounts fails a count that hangs past its bound and destroys its client',
    { timeout: 5_000 },
    async () => {
        const released: unknown[] = [];
        const pool = {
            options: { statement_timeout: 20 },
            connect: async () => ({
                // The count never answers, as over a stalled tunnel.
                query: () => new Promise(() => undefined),
                release: (error?: unknown) => released.push(error),
            }),
        } as unknown as Pool;

        await assert.rejects(
            pgEventSource(pool, { graceMs: 20 }).dayCounts(),
            /day counts ran past 0.04 s/,
        );
        assert.equal(released.length, 1);
        assert.ok(released[0] instanceof Error);
    },
);

test('bigQueryWarehouse loads a day into its partition and lets the schema gain columns', async () => {
    const loads: { table: string; file: string; metadata: Record<string, unknown> }[] = [];
    const bigquery = {
        dataset: () => ({
            table: (table: string) => ({
                createLoadJob: async (file: string, metadata: Record<string, unknown>) => {
                    loads.push({ table, file, metadata });
                    return [{ promise: async () => [{}] }];
                },
            }),
        }),
    };
    const warehouse = bigQueryWarehouse({
        projectId: 'p',
        datasetId: 'd',
        bigquery: bigquery as unknown as BigQuery,
    });

    await warehouse.replaceDay('2026-10-22', '/tmp/day.ndjson');

    assert.equal(loads.length, 1);
    assert.equal(loads[0]?.table, 'event$20261022');
    assert.equal(loads[0]?.file, '/tmp/day.ndjson');
    assert.equal(loads[0]?.metadata.writeDisposition, 'WRITE_TRUNCATE');
    assert.deepEqual(loads[0]?.metadata.schemaUpdateOptions, ['ALLOW_FIELD_ADDITION']);
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
        const table = {
            exists: async () => [exists],
            getMetadata: async () => [{ schema: { fields: fields.map((name) => ({ name })) } }],
        };
        const bigquery = {
            dataset: () => ({
                table: () => table,
                createTable: async (name: string, options: { schema: unknown }) => {
                    calls.push(['createTable', name, options.schema]);
                    return [table];
                },
            }),
            query: async ({ query, params }: { query: string; params?: unknown }) => {
                // The table itself, so each count is exact.
                calls.push(['query', query.match(/FROM `([^`]+)`/)?.[1], params]);
                const stale = fields.includes('export_rules') ? [true, false] : [true, true];
                return [
                    [
                        { day: '2026-10-21', n: 3, stale: stale[0] },
                        { day: '2026-10-22', n: 1434, stale: stale[1] },
                    ],
                ];
            },
        };
        const warehouse = bigQueryWarehouse({
            projectId: 'p',
            datasetId: 'd',
            bigquery: bigquery as unknown as BigQuery,
        });

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
        assert.deepEqual(calls, [['query', 'p.d.event', { rules: 'r1' }]]);
    });

    await t.test('a table without export_rules is stale on every day', async () => {
        const { warehouse, calls } = fakeTable({ exists: true, fields: ['id'] });

        assert.deepEqual(await warehouse.days('r1'), {
            counts,
            stale: new Set(['2026-10-21', '2026-10-22']),
        });
        assert.deepEqual(calls, [['query', 'p.d.event', { rules: 'r1' }]]);
    });

    await t.test('a query over the bytes-billed cap fails naming the cap', async () => {
        const bigquery = {
            dataset: () => ({
                table: () => ({
                    getMetadata: async () => [{ schema: { fields: [{ name: 'export_rules' }] } }],
                }),
            }),
            query: async () => {
                throw new Error('Query exceeded limit for bytes billed: 1000000000.');
            },
        };
        const warehouse = bigQueryWarehouse({
            projectId: 'p',
            datasetId: 'd',
            bigquery: bigquery as unknown as BigQuery,
        });

        await assert.rejects(warehouse.days('r1'), /maximumBytesBilled cap/);
    });
});

test('runExportJob runs the event export after a failed account export, then fails with every failure', async (t) => {
    const accountError = new Error('bigquery down');
    const eventError = new Error('event export 2026-10-21: load job failed');
    const cases: [string, () => Promise<void>, RegExp, number][] = [
        [
            'the account export alone',
            async () => undefined,
            /^account export failed: bigquery down$/,
            1,
        ],
        [
            'both',
            async () => {
                throw eventError;
            },
            /^account export failed: bigquery down; event export 2026-10-21: load job failed$/,
            2,
        ],
    ];

    for (const [label, exportEvents, message, causes] of cases) {
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
                    assert.ok(error instanceof Error);
                    assert.match(error.message, message);
                    assert.equal(error instanceof AggregateError ? error.errors.length : 1, causes);
                    return true;
                },
            );
            assert.deepEqual(ran, ['accounts', 'events']);
        });
    }
});

test(
    'runAndExit stops a run hung past its deadline, names the phase and exits 1',
    { timeout: 5_000 },
    async (t) => {
        const hang = () => new Promise<never>(() => undefined);
        const source = fakeSource({
            '2026-10-21': [[sourceEvent({ id: 1, createdAt: '2026-10-21T08:00:00.000000Z' })]],
            '2026-10-22': [[sourceEvent({ id: 2 })]],
            '2026-10-23': [[sourceEvent({ id: 3 })]],
        });
        const cases: [string, Parameters<typeof runAndExit>[0], RegExp][] = [
            [
                'a hung account export',
                (progress) =>
                    runExportJob({
                        exportAccounts: hang,
                        exportEvents: async () => undefined,
                        progress,
                    }),
                /deadline, 0.02 s from its start, during the account export$/,
            ],
            [
                "a hung day's read after a failed day",
                (progress) =>
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
                        warehouse: fakeWarehouse(new Map(), { failLoad: ['2026-10-21'] }).warehouse,
                        hmacKey: KEY,
                        today: '2026-10-23',
                        scratchFile: scratch(),
                        log: () => undefined,
                        progress,
                    }),
                /during the read of 2026-10-22; days not started: 2026-10-23; 2026-10-21: load job failed$/,
            ],
        ];

        for (const [label, main, message] of cases) {
            // A run with no watchdog never ends, so each case is bounded.
            await t.test(label, { timeout: 2_000 }, async () => {
                const exits: number[] = [];
                const logged: unknown[] = [];

                await runAndExit(main, {
                    deadlineMs: 20,
                    exit: (code) => exits.push(code),
                    logError: (error) => logged.push(error),
                });

                assert.deepEqual(exits, [1]);
                assert.equal(logged.length, 1);
                assert.match(String((logged[0] as Error).message), message);
            });
        }
    },
);

test('runAndExit exits with 0 after main resolves, and with 1 after one line naming the phase when it rejects', async (t) => {
    const failure = new Error('table check failed');
    const cases: [string, Parameters<typeof runAndExit>[0], number, string[]][] = [
        ['a run that succeeds', async () => undefined, 0, []],
        [
            'a run that fails',
            async (progress) => {
                progress.phase = 'the event table check and day counts';
                throw failure;
            },
            1,
            ['export Job failed during the event table check and day counts: table check failed'],
        ],
    ];

    for (const [label, main, code, messages] of cases) {
        await t.test(label, async () => {
            const exits: number[] = [];
            const logged: Error[] = [];

            await runAndExit(main, {
                exit: (exitCode) => exits.push(exitCode),
                logError: (error) => logged.push(error as Error),
            });

            assert.deepEqual(exits, [code]);
            assert.deepEqual(
                logged.map(({ message }) => message),
                messages,
            );
            assert.ok(logged.every(({ cause }) => cause === failure));
        });
    }
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

    const pool = readerPool;
    // The page queries readDay sends, by text.
    const pageQueries: string[] = [];
    const source = pgEventSource(
        {
            options: pool.options,
            connect: async () => {
                const client = await pool.connect();

                return {
                    query: (text: string, values?: unknown[]) => {
                        pageQueries.push(text);
                        return client.query(text, values);
                    },
                    release: (error?: Error) => client.release(error),
                };
            },
        } as unknown as Pool,
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
    assert.equal(pageQueries.length, 6);
    assert.ok(pageQueries.every((text) => text === ROW_SHAPE.READ_DAY_SQL));
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
