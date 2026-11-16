// The data step: run by hand with `pnpm data <slug>`, never by the build.
// It writes _data/series.json, which the page imports and git keeps.
import { Client } from '@developmentfinance/client';

import { writeDataFile } from '#lib/dataFile.mts';

import type { Point } from './types.ts';

const QUERY = 'ODA from Germany to Nigeria';

// Without a key the client calls the API anonymously, under a per-IP quota.
const client = new Client();
const answer = await client.search(QUERY);

console.log(String(answer));

const dataset = await answer.fetch();
const rows = await dataset.toRows();

const data: Point[] = rows.map((row) => ({
    year: Number(row.time_period),
    value: Number(row.value),
}));

writeDataFile(new URL('./series.json', import.meta.url), {
    query: QUERY,
    data,
    extra: { sentence: dataset.sentence, citation: dataset.citation.text },
});
