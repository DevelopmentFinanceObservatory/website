import assert from 'node:assert/strict';
import test from 'node:test';

import { DATA_AVAILABILITY_PROMPT } from '../../src/lib/studio/dataAvailability.ts';
import { EXAMPLE_PROMPTS } from '../../src/lib/studio/examples.ts';
import {
    MERGE_EXAMPLES_SQL,
    runExampleExport,
    settleWithExamples,
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

test('runExampleExport merges every question the build offers, creating the table only when missing', async (t) => {
    const offered = [
        ...EXAMPLE_PROMPTS.map((text) => ({ kind: 'example', text })),
        { kind: 'availability', text: DATA_AVAILABILITY_PROMPT },
    ];

    for (const exists of [false, true]) {
        await t.test(exists ? 'an existing table' : 'a missing table', async () => {
            const { bigquery, calls } = fakeDataset(exists);

            await runExampleExport({ bigquery, log: () => {} });

            const merge = calls.at(-1)!;

            assert.equal(merge[1], MERGE_EXAMPLES_SQL);
            assert.deepEqual(JSON.parse((merge[2] as Record<string, string>).examples!), offered);
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

test('settleWithExamples waits for both exports and rejects with each failure', async (t) => {
    const events = new Error('day 2026-11-25 failed');
    const examples = new Error('quota');
    // Each run is the error it rejects with, or null for one that resolves.
    const cases: [string, Error | null, Error | null, ((error: unknown) => void) | null][] = [
        ['both succeed', null, null, null],
        ['the event export fails', events, null, (error) => assert.equal(error, events)],
        [
            'the example export fails',
            null,
            examples,
            (error) => assert.equal((error as Error).cause, examples),
        ],
        [
            'both fail',
            events,
            examples,
            (error) => {
                assert.ok(error instanceof AggregateError);
                assert.equal(error.errors[0], events);
                assert.equal((error.errors[1] as Error).cause, examples);
            },
        ],
    ];

    const run = (failure: Error | null) => (failure ? Promise.reject(failure) : Promise.resolve());

    for (const [label, eventFailure, exampleFailure, check] of cases) {
        await t.test(label, async () => {
            const eventRun = run(eventFailure);
            const exampleRun = run(exampleFailure);

            if (check === null) {
                await settleWithExamples(eventRun, exampleRun);
            } else {
                await assert.rejects(settleWithExamples(eventRun, exampleRun), (error) => {
                    check(error);

                    return true;
                });
            }
        });
    }
});

test('settleWithExamples waits for the example export after the event export fails', async () => {
    let merged = false;
    const exampleRun = new Promise<void>((resolve) =>
        setTimeout(() => {
            merged = true;
            resolve();
        }, 5),
    );

    await assert.rejects(settleWithExamples(Promise.reject(new Error('events')), exampleRun));
    assert.equal(merged, true);
});
