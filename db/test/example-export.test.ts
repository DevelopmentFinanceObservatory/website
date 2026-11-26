import assert from 'node:assert/strict';
import test from 'node:test';

import { DATA_AVAILABILITY_PROMPT, EXAMPLE_PROMPTS } from '../../src/lib/studio/examples.ts';
import {
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

            assert.equal(merge[0], 'query');
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
