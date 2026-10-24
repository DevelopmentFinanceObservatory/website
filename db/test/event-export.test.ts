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
    exportRules,
    pgEventSource,
    runExport,
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
            ['2026-10-17', '2026-10-20', '2026-10-22', '2026-10-23'],
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
            ['2026-10-19', '2026-10-22', '2026-10-23'],
        ],
        [
            'a day missing from BigQuery',
            { '2026-10-15': 2, ...loaded },
            loaded,
            ['2026-10-15', '2026-10-22', '2026-10-23'],
        ],
        [
            'a day BigQuery holds more of than the source',
            { '2026-10-17': 2, ...loaded },
            { '2026-10-17': 3, ...loaded },
            ['2026-10-17', '2026-10-22', '2026-10-23'],
        ],
        [
            'a day BigQuery holds that the source lacks',
            loaded,
            { '2026-10-16': 1, ...loaded },
            ['2026-10-16', '2026-10-22', '2026-10-23'],
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
        async dayCounts() {
            return new Map([...partitions].map(([day, rows]) => [day, rows.length]));
        },
        async staleDays(rules) {
            return new Set(
                [...partitions]
                    .filter(([, rows]) =>
                        rows.some(
                            (row) => (row as { export_rules?: string }).export_rules !== rules,
                        ),
                    )
                    .map(([day]) => day),
            );
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
                'replace 2026-10-19',
                'replace 2026-10-22',
                'replace 2026-10-23',
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
                'replace 2026-10-19',
                'replace 2026-10-22',
                'replace 2026-10-23',
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
        'replace 2026-10-20',
        'replace 2026-10-21',
        'replace 2026-10-22',
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
        'replace 2026-10-18',
        'replace 2026-10-21',
        'replace 2026-10-22',
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

test('runExport starts no new day past its budget and fails naming the days it did not reach', async () => {
    const partitions = new Map<string, unknown[]>();
    const { warehouse, calls } = fakeWarehouse(partitions, { failLoad: ['2026-10-21'] });
    const clock = { ms: 0 };
    const source = fakeSource({
        '2026-10-20': [[sourceEvent({ id: 1, createdAt: '2026-10-20T08:00:00.000000Z' })]],
        '2026-10-21': [[sourceEvent({ id: 2, createdAt: '2026-10-21T08:00:00.000000Z' })]],
        '2026-10-22': [[sourceEvent({ id: 3, createdAt: '2026-10-22T08:00:00.000000Z' })]],
        '2026-10-23': [[sourceEvent({ id: 4, createdAt: '2026-10-23T08:00:00.000000Z' })]],
    });

    await assert.rejects(
        runExport({
            source: {
                ...source,
                // Each day read costs 4 minutes of the injected clock.
                readDay: (day) => {
                    clock.ms += 240_000;
                    return source.readDay(day);
                },
            },
            warehouse,
            hmacKey: KEY,
            today: '2026-10-23',
            scratchFile: scratch(),
            log: () => undefined,
            budgetMs: 600_000,
            now: () => clock.ms,
        }),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /2026-10-21: load job failed/);
            assert.match(error.message, /not reached\D+10 minute budget: 2026-10-23$/);
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-20', 'replace 2026-10-22']);
});

test('bigQueryWarehouse loads a day into its partition and lets the schema gain columns', async () => {
    const loads: { table: string; file: string; metadata: Record<string, unknown> }[] = [];
    const fake = {
        dataset: () => ({
            table: (table: string) => ({
                load: async (file: string, metadata: Record<string, unknown>) => {
                    loads.push({ table, file, metadata });
                    return [{}];
                },
            }),
        }),
    };
    const warehouse = bigQueryWarehouse({
        projectId: 'p',
        datasetId: 'd',
        bigquery: fake as unknown as BigQuery,
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

test('bigQueryWarehouse creates the table, finds stale days and counts from partition metadata', async (t) => {
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
                calls.push(['query', params]);
                return query.includes('PARTITIONS')
                    ? [
                          [
                              { partition_id: '20261021', total_rows: 3 },
                              { partition_id: '20261022', total_rows: '1434' },
                          ],
                      ]
                    : [[{ day: '2026-10-21' }]];
            },
        };
        const warehouse = bigQueryWarehouse({
            projectId: 'p',
            datasetId: 'd',
            bigquery: bigquery as unknown as BigQuery,
        });

        return { warehouse, calls };
    };

    await t.test('a missing table is created with the schema', async () => {
        const { warehouse, calls } = fakeTable({ exists: false });

        await warehouse.ensureTable();
        assert.deepEqual(calls, [['createTable', 'event', { fields: EXPORT_SCHEMA }]]);
    });

    await t.test('staleDays queries the days whose rows carry other rules', async () => {
        const { warehouse, calls } = fakeTable({ exists: true, fields: ['id', 'export_rules'] });

        assert.deepEqual(await warehouse.staleDays('r1'), new Set(['2026-10-21']));
        assert.deepEqual(calls, [['query', { rules: 'r1' }]]);
    });

    await t.test('a table without export_rules is stale on every day', async () => {
        assert.deepEqual(
            await fakeTable({ exists: true, fields: ['id'] }).warehouse.staleDays('r1'),
            new Set(['2026-10-21', '2026-10-22']),
        );
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

        await assert.rejects(warehouse.staleDays('r1'), /maximumBytesBilled cap/);
    });

    await t.test('dayCounts reads each partition_id as its day', async () => {
        assert.deepEqual(
            await fakeTable({ exists: true }).warehouse.dayCounts(),
            new Map([
                ['2026-10-21', 3],
                ['2026-10-22', 1434],
            ]),
        );
    });
});

test('runExportJob runs the event export after a failed account export, then fails', async () => {
    const ran: string[] = [];
    const logged: unknown[] = [];
    const accountError = new Error('bigquery down');

    await assert.rejects(
        runExportJob({
            exportAccounts: async () => {
                ran.push('accounts');
                throw accountError;
            },
            exportEvents: async () => {
                ran.push('events');
            },
            logError: (error) => logged.push(error),
        }),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.equal(error.cause, accountError);
            return true;
        },
    );

    assert.deepEqual(ran, ['accounts', 'events']);
    assert.deepEqual(logged, [accountError]);
});

/**
 * Reads a migrated database as a login member of `website_export_reader`,
 * the way the Job's IAM user reads it, and checks each UTC day's rows
 * against Postgres's own per-day count. The page size is 2, so every day
 * spans pages, rows sit either side of a midnight, three rows share one
 * time across a page boundary, and each row's props hold a key no event
 * keeps.
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

    const source = pgEventSource(readerPool, 2);
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
