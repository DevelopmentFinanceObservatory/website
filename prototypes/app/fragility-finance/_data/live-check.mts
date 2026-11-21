// Runs the page's browser read from Node, as the page would with READ_LIVE on, and checks it
// gives profiles.json's and groups.json's figures. It times each pass and counts its requests,
// so it says whether the read fits the page. The first pass is cold for this process, though DFO may
// hold answers from an earlier run. Point it at an API with DFO_BASE_URL:
//
//     DFO_BASE_URL=https://.../api/v1 node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
//         app/fragility-finance/_data/live-check.mts [timeout seconds per read, default 120]
//
// It exits 1 unless every pass reads the stored tier and matches the committed figures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Client } from '@developmentfinance/client';

import type { Context, Groups } from './types.ts';
import { figuresFromRows, recipes, type LiveInputs } from '../_lib/live.ts';

import { READ_CONCURRENCY, readLive } from '#lib/liveRead.ts';

const json = <T,>(name: string): T =>
    JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')) as T;

const refs = json<{ data: Record<string, { ref: unknown }> }>('refs.json').data;
const live = json<{ data: LiveInputs }>('live.json').data;
const committed = {
    contexts: json<{ data: Context[] }>('profiles.json').data,
    groups: json<{ data: Groups }>('groups.json').data,
};
const timeout = Number(process.argv[2] ?? 120) * 1000;
const chains = recipes(
    refs,
    live,
    new Map(committed.contexts.map((context) => [`country/${context.iso3}`, context.tier])),
);
const sources = Object.fromEntries(
    Object.entries(chains).map(([key, chain]) => [key, { recipe: chain }]),
);
let failed = false;

for (const pass of ['first', 'second']) {
    const requests: string[] = [];
    const client = new Client({
        apiKey: false,
        fetch: (input, init) => {
            const url = input instanceof Request ? input.url : String(input);

            requests.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);

            return fetch(input, init);
        },
    });
    const start = performance.now();
    const read = await readLive(sources, (rows) => figuresFromRows(rows, committed, live), {
        fallback: { tier: 'committed', value: committed },
        client,
        timeout,
    });
    const seconds = (performance.now() - start) / 1000;
    const posts = requests.filter((request) => request.startsWith('POST')).length;

    console.log(
        `${pass} pass: tier ${read.tier}, ${seconds.toFixed(1)} s, ${requests.length} requests ` +
            `(${posts} analysis POSTs) for ${Object.keys(sources).length} recipes, ` +
            `${READ_CONCURRENCY} at a time, ${client.toString()}`,
    );

    if (read.tier !== 'stored') {
        failed = true;
        continue;
    }

    try {
        assert.deepEqual(read.value, committed);
        console.log(`${pass} pass: the figures equal profiles.json and groups.json.`);
    } catch (error) {
        failed = true;
        console.error(`${pass} pass: the figures differ from the committed ones.`, error);
    }
}

process.exit(failed ? 1 : 0);
