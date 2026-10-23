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
    type EventSource,
    exportDays,
    exportRow,
    pgEventSource,
    runExport,
    type SourceEvent,
    type Warehouse,
} from '../event-export.ts';
import { EXPORT_READER_ROLE } from '../local-roles.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');
const KEY = 'test-key';

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
    });
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
            assert.deepEqual(exportRow(sourceEvent(overrides), KEY).props, {});
        });
    }
});

test('exportRow leaves the hashes null for a guest without consent', () => {
    const row = exportRow(sourceEvent({ page: '/topics/health' }), KEY);

    assert.equal(row.signed_in, false);
    assert.equal(row.visitor_hash, null);
    assert.equal(row.user_hash, null);
    assert.equal(row.page, '/topics/health');
});

test('exportDays replaces from the day before the latest loaded day through today', async (t) => {
    const cases: [string, Parameters<typeof exportDays>[0], string[]][] = [
        ['no event at all', { latest: null, first: null, today: '2026-10-23' }, []],
        [
            'an empty table backfills from the first event',
            { latest: null, first: '2026-10-21', today: '2026-10-23' },
            ['2026-10-21', '2026-10-22', '2026-10-23'],
        ],
        [
            'a run after an outage reloads every missed day',
            { latest: '2026-10-19', first: null, today: '2026-10-22' },
            ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'],
        ],
        [
            'a run on a loaded day',
            { latest: '2026-10-23', first: null, today: '2026-10-23' },
            ['2026-10-22', '2026-10-23'],
        ],
        [
            'a month boundary',
            { latest: '2026-03-01', first: null, today: '2026-03-01' },
            ['2026-02-28', '2026-03-01'],
        ],
    ];

    for (const [label, input, days] of cases) {
        await t.test(label, () => {
            assert.deepEqual(exportDays(input), days);
        });
    }
});

/** An in-memory warehouse. Each partition is the parsed lines of its last load. */
const fakeWarehouse = (partitions: Map<string, unknown[]>) => {
    const calls: string[] = [];
    const warehouse: Warehouse = {
        async ensureTable() {
            calls.push('ensureTable');
        },
        async latestDay() {
            return [...partitions.keys()].sort().at(-1) ?? null;
        },
        async replaceDay(day, file) {
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
    failOn: string | null = null,
): EventSource => ({
    async firstDay() {
        return Object.keys(pages).sort()[0] ?? null;
    },
    async *readDay(day) {
        for (const page of pages[day] ?? []) {
            yield page;
        }

        if (day === failOn) {
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
    assert.deepEqual(partitions.get('2026-10-20'), [exportRow(first, KEY), exportRow(second, KEY)]);
    assert.deepEqual(partitions.get('2026-10-22'), [exportRow(third, KEY)]);
    await assert.rejects(fs.access(scratchFile));
});

test('runExport keeps the partitions of days that read no rows', async () => {
    const partitions = new Map<string, unknown[]>([
        ['2026-10-21', [{ id: 6 }]],
        ['2026-10-22', [{ id: 7 }]],
    ]);
    const before = structuredClone(partitions);
    const { warehouse, calls } = fakeWarehouse(partitions);

    for (const today of ['2026-10-22', '2026-10-23']) {
        const loaded = await runExport({
            source: fakeSource({}),
            warehouse,
            hmacKey: KEY,
            today,
            scratchFile: scratch(),
            log: () => undefined,
        });

        assert.ok(loaded.every(({ rows }) => rows === 0));
    }

    assert.deepEqual(partitions, before);
    assert.deepEqual(calls, ['ensureTable', 'ensureTable']);
    assert.equal(await warehouse.latestDay(), '2026-10-22');
});

test('runExport names the day it failed on and leaves that day as it was', async () => {
    const kept = [{ id: 7 }];
    const partitions = new Map<string, unknown[]>([
        ['2026-10-21', [{ id: 6 }]],
        ['2026-10-22', kept],
    ]);
    const { warehouse, calls } = fakeWarehouse(partitions);
    const fresh = sourceEvent({ id: 8, createdAt: '2026-10-21T10:00:00.000000Z' });
    const scratchFile = scratch();
    const logged: string[] = [];

    await assert.rejects(
        runExport({
            source: fakeSource(
                { '2026-10-21': [[fresh]], '2026-10-22': [[sourceEvent({ id: 9 })]] },
                '2026-10-22',
            ),
            warehouse,
            hmacKey: KEY,
            today: '2026-10-22',
            scratchFile,
            log: (line) => logged.push(line),
        }),
        (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /^event export 2026-10-22: /);
            assert.ok(error.cause instanceof Error);
            assert.equal(error.cause.message, 'connection lost');
            return true;
        },
    );

    assert.deepEqual(calls, ['ensureTable', 'replace 2026-10-21']);
    assert.deepEqual(
        logged.map((line) => line.slice(0, 10)),
        ['2026-10-21'],
    );
    assert.deepEqual(partitions.get('2026-10-21'), [exportRow(fresh, KEY)]);
    assert.equal(partitions.get('2026-10-22'), kept);
    await assert.rejects(fs.access(scratchFile));
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

/**
 * Reads a migrated database as a login member of `website_export_reader`,
 * the way the Job's IAM user reads it, and checks each UTC day's rows
 * against Postgres's own per-day count. The page size is 2, so every day
 * spans pages, and rows sit either side of a midnight.
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
         select 'search.query', ts::timestamptz, null, 'v', '/data', '{"post": 0}'
         from unnest($1::text[]) ts`,
        [
            [
                '2026-10-19T23:59:59.999999Z',
                '2026-10-20T00:00:00Z',
                '2026-10-20T11:00:00Z',
                '2026-10-20T23:59:59.999999Z',
                '2026-10-21T00:00:00.000001Z',
                '2026-10-22T05:00:00Z',
                '2026-10-22T06:00:00Z',
                '2026-10-22T07:00:00Z',
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

    for (const { day } of expected) {
        let count = 0;

        for await (const page of source.readDay(day)) {
            assert.ok(page.every((row) => row.createdAt.startsWith(day)));
            count += page.length;
        }

        read.push({ day, count });
    }

    assert.deepEqual(read, expected);
    assert.deepEqual(
        expected.map(({ count }) => count),
        [1, 3, 1, 3],
    );
    assert.equal(await source.firstDay(), '2026-10-19');
    await assert.rejects(readerPool.query('select 1 from feedback'), /permission denied/);
});
