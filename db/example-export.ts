import { DATA_AVAILABILITY_PROMPT, EXAMPLE_PROMPTS } from '../src/lib/studio/examples.ts';

import type { ExportBigQuery, TableField } from './bounded.ts';

/**
 * The Studio example export, which the export Job (db/export-events.ts) runs
 * as a phase of its own beside the event export. It keeps the BigQuery table `studio_examples`,
 * one row per question production offers or offered as a pick: each landing example
 * (EXAMPLE_PROMPTS) as `example` and the "What data is available?"
 * question (DATA_AVAILABILITY_PROMPT) as `availability`. Each run sets
 * `last_seen_at` on the rows the build offers and adds a row for a new
 * text, so a row's two times bound the hours some deployed build offered
 * it. A text the build drops keeps its row and its last time.
 *
 * A text production offered before the export ran takes its first time,
 * and its last time when production dropped it, from OFFERED_BEFORE_EXPORT,
 * so the table covers every pick since Studio opened.
 */

export const STUDIO_EXAMPLES_TABLE = 'studio_examples';

export type StudioExample = { kind: 'example' | 'availability'; text: string };

/** A question production offered before the export ran: the time of the
 *  production release that first shipped it and, when an earlier release
 *  dropped it, the time of that release. */
export type OfferedBefore = StudioExample & { firstSeenAt: string; lastSeenAt?: string };

/**
 * Every question production offered before the export ran, timed by the
 * release merges on `main` (in this repository and, before 13 Oct 2026, in
 * its first home), each of which deploys production. A run inserts these
 * times for a text the table lacks, and moves a row's `first_seen_at` back
 * to its time here.
 */
export const OFFERED_BEFORE_EXPORT: readonly OfferedBefore[] = [
    {
        kind: 'example',
        text: 'Life expectancy in Nigeria',
        firstSeenAt: '2026-09-14T14:02:16Z',
        lastSeenAt: '2026-10-13T15:06:49Z',
    },
    {
        kind: 'example',
        text: 'GDP per capita of Vietnam in 2023',
        firstSeenAt: '2026-09-14T14:02:16Z',
        lastSeenAt: '2026-10-13T15:06:49Z',
    },
    {
        kind: 'example',
        text: 'Give me a comprehensive overview of health spending in Kenya',
        firstSeenAt: '2026-09-14T14:02:16Z',
    },
    ...[
        'Compare per capita health spending in Kenya, Niger, and Liberia',
        'What does G7 aid data for the latest year look like?',
        'Compare under-5 mortality rates in Sierra Leone and Nigeria',
        'How much does the DRC spend to service its debt each year since 2008?',
        "Show me Zimbabwe's debt composition held in different currencies",
        'Compare remittances to Nigeria, Ethiopia and South Africa since 2015',
        'What share of the ODA Kenya receives goes to health?',
        'Which donor gave Kenya the most ODA in each year from 2018 to 2022?',
        "Show Kenya's and Nigeria's external debt as a share of GDP over time",
    ].map((text): OfferedBefore => ({
        kind: 'example',
        text,
        firstSeenAt: '2026-10-13T15:06:49Z',
    })),
    {
        kind: 'availability',
        text: DATA_AVAILABILITY_PROMPT,
        firstSeenAt: '2026-11-12T22:48:11Z',
    },
];

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

/** One MERGE source row: a question, whether this build offers it, and its
 *  times from OFFERED_BEFORE_EXPORT. */
export type MergeEntry = StudioExample & {
    offered: boolean;
    since: string | null;
    until: string | null;
};

const exampleKey = ({ kind, text }: StudioExample) => JSON.stringify([kind, text]);

/**
 * The MERGE source: each question this build offers, with its first time
 * from `before` when it has one, and each question in `before` with a last
 * time that the build no longer offers. A text in `before` without a last
 * time that the build no longer offers was dropped after the export ran,
 * so the table holds its row already and it is left out.
 */
export const mergeEntries = (
    offered: readonly StudioExample[],
    before: readonly OfferedBefore[] = OFFERED_BEFORE_EXPORT,
): MergeEntry[] => {
    const history = new Map(before.map((entry) => [exampleKey(entry), entry]));
    const offeredKeys = new Set(offered.map(exampleKey));

    return [
        ...offered.map(({ kind, text }) => ({
            kind,
            text,
            offered: true,
            since: history.get(exampleKey({ kind, text }))?.firstSeenAt ?? null,
            until: null,
        })),
        ...before
            .filter((entry) => entry.lastSeenAt && !offeredKeys.has(exampleKey(entry)))
            .map(({ kind, text, firstSeenAt, lastSeenAt }) => ({
                kind,
                text,
                offered: false,
                since: firstSeenAt,
                until: lastSeenAt ?? null,
            })),
    ];
};

// One statement, so a run either marks every offered row or none.
// CURRENT_TIMESTAMP() is one value for the whole statement.
const MERGE_EXAMPLES_SQL = `MERGE ${STUDIO_EXAMPLES_TABLE} AS t
 USING (SELECT JSON_VALUE(entry, '$.kind') AS kind, JSON_VALUE(entry, '$.text') AS text,
               JSON_VALUE(entry, '$.offered') = 'true' AS offered,
               TIMESTAMP(JSON_VALUE(entry, '$.since')) AS since,
               TIMESTAMP(JSON_VALUE(entry, '$.until')) AS until
        FROM UNNEST(JSON_QUERY_ARRAY(@examples)) AS entry) AS s
 ON t.kind = s.kind AND t.text = s.text
 WHEN MATCHED AND s.offered THEN UPDATE SET
   first_seen_at = LEAST(t.first_seen_at, COALESCE(s.since, t.first_seen_at)),
   last_seen_at = CURRENT_TIMESTAMP()
 WHEN MATCHED THEN UPDATE SET first_seen_at = LEAST(t.first_seen_at, s.since)
 WHEN NOT MATCHED THEN INSERT (kind, text, first_seen_at, last_seen_at)
   VALUES (s.kind, s.text, COALESCE(s.since, CURRENT_TIMESTAMP()),
           IF(s.offered, CURRENT_TIMESTAMP(), s.until))`;

/** Runs `work` while this session holds the example export's advisory lock. */
export type ExportLock = <T>(work: () => Promise<T>) => Promise<T>;

// BigQuery lets two MERGEs that each find no row insert the same text, so
// two Job executions that overlap would each add a copy. The merge runs
// under this Postgres advisory lock instead, which a second execution waits
// for until its pool's statement timeout. The key is a literal, the first
// 52 bits of sha256('dfo-website:db/example-export.ts:advisory-lock'), as
// MIGRATION_LOCK_KEY in db/apply-migrations.ts is.
const EXAMPLE_LOCK_KEY = 1112866248700761;

/** The part of a pg pool the lock uses: one connection, held and released. */
export type LockPool = {
    connect(): Promise<{
        query(sql: string, params: unknown[]): Promise<unknown>;
        release(error?: Error): void;
    }>;
};

/** The ExportLock on one connection of `pool`, held from the lock until
 *  `work` settles. A connection that drops releases the lock with it. */
export const pgExportLock =
    (pool: LockPool): ExportLock =>
    async (work) => {
        const client = await pool.connect();
        let failure: Error | undefined;

        try {
            await client.query('select pg_advisory_lock($1)', [EXAMPLE_LOCK_KEY]);

            try {
                return await work();
            } finally {
                await client.query('select pg_advisory_unlock($1)', [EXAMPLE_LOCK_KEY]);
            }
        } catch (error) {
            failure = error instanceof Error ? error : new Error(String(error));
            throw error;
        } finally {
            // A connection whose statement failed is destroyed, not reused.
            client.release(failure);
        }
    };

/** Creates `studio_examples` when it is missing, then merges `examples` into
 *  it under `lock`. */
export const runExampleExport = async ({
    bigquery,
    lock,
    examples = studioExamples(),
    before = OFFERED_BEFORE_EXPORT,
    log,
}: {
    bigquery: Pick<ExportBigQuery, 'tableExists' | 'createTable' | 'query'>;
    lock: ExportLock;
    examples?: StudioExample[];
    before?: readonly OfferedBefore[];
    log: (line: string) => void;
}): Promise<void> => {
    await lock(async () => {
        if (!(await bigquery.tableExists(STUDIO_EXAMPLES_TABLE))) {
            await bigquery.createTable(STUDIO_EXAMPLES_TABLE, {
                schema: { fields: STUDIO_EXAMPLES_SCHEMA },
            });
        }

        await bigquery.query(MERGE_EXAMPLES_SQL, {
            examples: JSON.stringify(mergeEntries(examples, before)),
        });
    });
    log(`${STUDIO_EXAMPLES_TABLE}: marked ${examples.length} offered questions`);
};
