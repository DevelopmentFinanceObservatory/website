// Records rows-fixture.json: the rows of each read at the version refs.json pins, cut to the
// columns _lib/derive.ts reads, so _lib/derive.test.mts checks the derivation against
// counts.json offline. Rerun after a refresh rewrites refs.json and counts.json:
//
//     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON app/oda-counts/_data/fixture.mts
import { readFileSync, writeFileSync } from 'node:fs';

import { Client, DatasetRef } from '@developmentfinance/client';

import { READ_KEYS } from '../_lib/derive.ts';

import { writeDataFile } from '#lib/dataFile.mts';

const refs = JSON.parse(readFileSync(new URL('./refs.json', import.meta.url), 'utf8')) as {
    data: Record<string, { ref: unknown }>;
};
const client = new Client({ apiKey: false });

const reads = await Promise.all(
    READ_KEYS.map(async (key) => {
        const data = await client.fetch(DatasetRef.fromJSON(refs.data[key]?.ref));
        const rows = await data.toRows();
        const providers = new Map<string, number>();
        const labels: [string, string, string][] = [];
        const bases = new Set(rows.map((row) => row.price_basis));

        if (bases.size !== 1) {
            throw new Error(`${key}: price bases ${[...bases].join(', ')}`);
        }

        const compact = rows.map((row) => {
            const provider = String(row.financingProvider);
            let index = providers.get(provider);

            if (index === undefined) {
                index = labels.length;
                providers.set(provider, index);
                labels.push([
                    provider,
                    String(row.financingProvider_label),
                    String(row.financingProvider_kind),
                ]);
            } else if (
                labels[index]![1] !== row.financingProvider_label ||
                labels[index]![2] !== row.financingProvider_kind
            ) {
                throw new Error(`${key}: ${provider}'s label or kind differs between rows`);
            }

            return [index, row.time_period, row.value];
        });

        return [key, { priceBasis: [...bases][0], providers: labels, rows: compact }] as const;
    }),
);

const target = new URL('./rows-fixture.json', import.meta.url);

writeDataFile(target, {
    query: "Each oda-counts read's rows at the version refs.json pins, as provider, year and value",
    data: Object.fromEntries(reads),
});
// Each row and provider on one line, which keeps the file a third of its indented size.
writeFileSync(
    target,
    readFileSync(target, 'utf8').replace(
        /\[\s+([^[\]{}]*?)\s+\]/g,
        (_, items: string) => `[${items.replace(/,\s+/g, ', ')}]`,
    ),
);
