import assert from 'node:assert/strict';
import test from 'node:test';

import { DATA_AVAILABILITY_PROMPT, EXAMPLE_PROMPTS } from '../../src/lib/studio/examples.ts';
import {
    mergeEntries,
    OFFERED_BEFORE_EXPORT,
    pgExportLock,
    runExampleExport,
    STUDIO_EXAMPLES_SCHEMA,
    studioExamples,
} from '../example-export.ts';

// A dataset that holds `studio_examples` when `exists`, and records each call.
const fakeDataset = (exists: boolean) => {
    const calls: unknown[][] = [];

    return {
        calls,
        bigquery: {
            tableExists: async (table: string) => {
                calls.push(['tableExists', table]);

                return exists;
            },
            createTable: async (table: string, options: unknown) => {
                calls.push(['createTable', table, options]);
            },
            query: async <T>(sql: string, params?: Record<string, string>): Promise<T[]> => {
                calls.push(['query', sql, params]);

                return [];
            },
        },
    };
};

// A lock that records when it is held.
const recordingLock =
    (calls: unknown[][]) =>
    async <T>(work: () => Promise<T>) => {
        calls.push(['lock']);

        try {
            return await work();
        } finally {
            calls.push(['unlock']);
        }
    };

test('runExampleExport merges every question the build offers under the lock, creating the table only when missing', async (t) => {
    const offered = [
        ...EXAMPLE_PROMPTS.map((text) => ({ kind: 'example', text })),
        { kind: 'availability', text: DATA_AVAILABILITY_PROMPT },
    ];

    for (const exists of [false, true]) {
        await t.test(exists ? 'an existing table' : 'a missing table', async () => {
            const { bigquery, calls } = fakeDataset(exists);

            await runExampleExport({ bigquery, lock: recordingLock(calls), log: () => {} });

            assert.deepEqual(calls[0], ['lock']);
            assert.deepEqual(calls.at(-1), ['unlock']);

            const merge = calls.at(-2)!;
            const entries = JSON.parse((merge[2] as Record<string, string>).examples!);

            assert.equal(merge[0], 'query');
            assert.deepEqual(
                entries
                    .filter((entry: { offered: boolean }) => entry.offered)
                    .map(({ kind, text }: { kind: string; text: string }) => ({ kind, text })),
                offered,
            );
            assert.deepEqual(
                calls.filter(([call]) => call === 'createTable'),
                exists
                    ? []
                    : [
                          [
                              'createTable',
                              'studio_examples',
                              { schema: { fields: STUDIO_EXAMPLES_SCHEMA } },
                          ],
                      ],
            );
        });
    }
});

test('studioExamples lists a repeated example once', () => {
    assert.deepEqual(studioExamples(['a', 'b', 'a'], 'z'), [
        { kind: 'example', text: 'a' },
        { kind: 'example', text: 'b' },
        { kind: 'availability', text: 'z' },
    ]);
});

test('every question production offered before the export goes into the merge with its release times', () => {
    const entries = mergeEntries(studioExamples());
    const byText = new Map(entries.map((entry) => [entry.text, entry]));

    for (const before of OFFERED_BEFORE_EXPORT) {
        const entry = byText.get(before.text);

        assert.ok(entry, before.text);
        assert.equal(entry.since, before.firstSeenAt, before.text);
        assert.equal(entry.until, entry.offered ? null : before.lastSeenAt, before.text);
    }

    assert.equal(byText.get('Life expectancy in Nigeria')?.offered, false);
});

test('mergeEntries leaves out a text dropped after the export ran, and dates a new text by the run', () => {
    const before = [
        { kind: 'example', text: 'kept', firstSeenAt: '2026-09-14T00:00:00Z' },
        { kind: 'example', text: 'dropped since', firstSeenAt: '2026-09-14T00:00:00Z' },
        {
            kind: 'example',
            text: 'dropped before',
            firstSeenAt: '2026-09-14T00:00:00Z',
            lastSeenAt: '2026-10-13T00:00:00Z',
        },
    ] as const;

    assert.deepEqual(
        mergeEntries(
            [
                { kind: 'example', text: 'kept' },
                { kind: 'example', text: 'new' },
            ],
            before,
        ),
        [
            {
                kind: 'example',
                text: 'kept',
                offered: true,
                since: '2026-09-14T00:00:00Z',
                until: null,
            },
            { kind: 'example', text: 'new', offered: true, since: null, until: null },
            {
                kind: 'example',
                text: 'dropped before',
                offered: false,
                since: '2026-09-14T00:00:00Z',
                until: '2026-10-13T00:00:00Z',
            },
        ],
    );
});

test('pgExportLock unlocks and releases its connection whether the work succeeds or fails', async (t) => {
    for (const fails of [false, true]) {
        await t.test(fails ? 'failing work' : 'work', async () => {
            const calls: unknown[] = [];
            const pool = {
                connect: async () => ({
                    query: async (sql: string) => {
                        calls.push(sql.split('(')[0]);
                    },
                    release: (error?: Error) => {
                        calls.push(['release', Boolean(error)]);
                    },
                }),
            };
            const lock = pgExportLock(pool);
            const run = lock(async () => {
                calls.push('work');

                if (fails) {
                    throw new Error('merge failed');
                }
            });

            if (fails) {
                await assert.rejects(run, /merge failed/);
            } else {
                await run;
            }

            assert.deepEqual(calls, [
                'select pg_advisory_lock',
                'work',
                'select pg_advisory_unlock',
                ['release', fails],
            ]);
        });
    }
});
