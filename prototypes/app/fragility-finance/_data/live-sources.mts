// Records the rows the page's browser read (`sources` in _lib/live.ts) gives at the versions
// refs.json pins, for live.test.mts: each recipe's tree and rows, and each read's rows, cut to
// the columns _lib/live.ts reads. Each text column's cells are written as an index into the
// column's distinct values under `values`, and the file is gzipped: the four sums by recipient
// and purpose hold about 78,000 rows, which as plain JSON would take about 2 MB. The test
// checks that these rows derive profiles.json's and groups.json's figures exactly, as the
// step's own recipes did. Run it again when refs.json or `sources` changes:
//
//     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON app/fragility-finance/_data/live-sources.mts
//
// It reads anonymously from the production API, two recipes at a time, and writes
// live-sources-fixture.json.gz beside it.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { Client, DatasetRef } from '@developmentfinance/client';

import { sources, type LiveInputs } from '../_lib/live.ts';

import { SDK } from '#lib/dataFile.mts';
import { ANALYSIS_CONCURRENCY } from '#lib/liveRead.ts';
import { createLane } from '#lib/pacing.ts';

/** The columns of a row that _lib/live.ts reads. It sums the OOF reads by recipient alone. */
const COLUMNS = [
    'financingRecipient',
    'financingProvider',
    'stat_var_crsPurpose',
    'time_period',
    'value',
] as const;
const BY_RECIPIENT = /^oof-/;

/** `rows` cut to `columns`, each text cell an index into its column's distinct values. */
const encoded = (rows: readonly Record<string, unknown>[], columns: readonly string[]) => {
    const values: Record<string, string[]> = {};
    const indexOf = (column: string, cell: string) => {
        const seen = (values[column] ??= []);
        const at = seen.indexOf(cell);

        return at === -1 ? seen.push(cell) - 1 : at;
    };

    return {
        columns,
        values,
        rows: rows.map((row) =>
            columns.map((column) => {
                const cell = row[column] ?? null;

                return typeof cell === 'string' ? indexOf(column, cell) : cell;
            }),
        ),
    };
};

const json = <T,>(name: string): T =>
    JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')) as T;

const refs = json<{ data: Record<string, { ref: unknown }> }>('refs.json').data;
const live = json<{ data: LiveInputs }>('live.json').data;
const client = new Client({ apiKey: false });
const lane = createLane(ANALYSIS_CONCURRENCY);
const page = sources(refs, live);
const recorded = await Promise.all(
    Object.entries(page).map(([key, source]) =>
        lane.run(async () => {
            const data = await client.fetch(
                'recipe' in source ? source.recipe : DatasetRef.fromJSON(source.ref),
            );
            const rows = await data.toRows();
            const columns = COLUMNS.filter(
                (column) =>
                    rows.length > 0 &&
                    column in rows[0]! &&
                    !(BY_RECIPIENT.test(key) && column === 'financingProvider'),
            );

            console.log(`${key}: ${rows.length} rows`);

            return [
                key,
                {
                    ...('recipe' in source && { tree: source.recipe.tree() }),
                    ...encoded(rows, columns),
                },
            ] as const;
        }),
    ),
);
const envelope = {
    provenance: {
        sdk: SDK,
        query: "The rows the page's browser read gives at refs.json's pinned versions, for the page's parity test",
        retrieved: new Date().toISOString(),
    },
    data: Object.fromEntries(recorded),
};
const target = new URL('./live-sources-fixture.json.gz', import.meta.url);

writeFileSync(target, gzipSync(`${JSON.stringify(envelope)}\n`, { level: 9 }));
console.log(`Wrote ${fileURLToPath(target)}.`);
