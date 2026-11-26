import { DATA_AVAILABILITY_PROMPT, EXAMPLE_PROMPTS } from '../src/lib/studio/examples.ts';

import type { ExportBigQuery, TableField } from './bounded.ts';

/**
 * The Studio example export, which the export Job (db/export-events.ts) runs
 * as a phase of its own beside the event export. It keeps the BigQuery table `studio_examples`,
 * one row per question the build offers as a pick: each landing example
 * (EXAMPLE_PROMPTS) as `example` and the "What data is available?"
 * question (DATA_AVAILABILITY_PROMPT) as `availability`. Each run sets
 * `last_seen_at` on the rows the build offers and adds a row for a new
 * text, so a row's two times bound the hours some deployed build offered
 * it. A text the build drops keeps its row and its last time.
 */

export const STUDIO_EXAMPLES_TABLE = 'studio_examples';

export type StudioExample = { kind: 'example' | 'availability'; text: string };

export const STUDIO_EXAMPLES_SCHEMA: TableField[] = [
    { name: 'kind', type: 'STRING', mode: 'REQUIRED' },
    { name: 'text', type: 'STRING', mode: 'REQUIRED' },
    { name: 'first_seen_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'last_seen_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

/** The questions this build offers, each (kind, text) once, since MERGE
 *  refuses two source rows that match one table row. */
export const studioExamples = (
    examples: readonly string[] = EXAMPLE_PROMPTS,
    availability: string = DATA_AVAILABILITY_PROMPT,
): StudioExample[] => [
    ...[...new Set(examples)].map((text): StudioExample => ({ kind: 'example', text })),
    { kind: 'availability', text: availability },
];

// One statement, so a run either marks every offered row or none.
// CURRENT_TIMESTAMP() is one value for the whole statement.
const MERGE_EXAMPLES_SQL = `MERGE ${STUDIO_EXAMPLES_TABLE} AS t
 USING (SELECT JSON_VALUE(entry, '$.kind') AS kind, JSON_VALUE(entry, '$.text') AS text
        FROM UNNEST(JSON_QUERY_ARRAY(@examples)) AS entry) AS s
 ON t.kind = s.kind AND t.text = s.text
 WHEN MATCHED THEN UPDATE SET last_seen_at = CURRENT_TIMESTAMP()
 WHEN NOT MATCHED THEN INSERT (kind, text, first_seen_at, last_seen_at)
   VALUES (s.kind, s.text, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`;

/** Creates `studio_examples` when it is missing, then merges `examples` into it. */
export const runExampleExport = async ({
    bigquery,
    examples = studioExamples(),
    log,
}: {
    bigquery: Pick<ExportBigQuery, 'tableExists' | 'createTable' | 'query'>;
    examples?: StudioExample[];
    log: (line: string) => void;
}): Promise<void> => {
    if (!(await bigquery.tableExists(STUDIO_EXAMPLES_TABLE))) {
        await bigquery.createTable(STUDIO_EXAMPLES_TABLE, {
            schema: { fields: STUDIO_EXAMPLES_SCHEMA },
        });
    }

    await bigquery.query(MERGE_EXAMPLES_SQL, { examples: JSON.stringify(examples) });
    log(`${STUDIO_EXAMPLES_TABLE}: marked ${examples.length} offered questions`);
};
