import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { type Lookups, readDefinitions, readLive } from './build.ts';
import { definitionsFromNodes, NODE_IDS, OECD_QUOTES } from './definitions.ts';
import { DEFINITIONS, OFFER } from './testFixture.ts';

import { createLane, type Lane } from '#lib/pacing.ts';

const liveRefs = JSON.parse(
    readFileSync(new URL('../_data/live-refs.json', import.meta.url), 'utf8'),
) as { data: Record<string, unknown> };

/** The graph nodes as the lookups gave them for the fixture's definitions. */
const NODES = DEFINITIONS.filter(({ source }) => source === 'graph').map(
    ({ id, label, description }) => ({
        id,
        // The graph gives Nominal no name.
        name: id === 'Nominal' ? null : label,
        description,
    }),
);

/** A client whose lookups answer from NODES and whose Search answers `answer`, recording each
 *  call. */
const stubClient = (answer: (body: unknown) => { status: number; body: unknown }) => {
    const looked: string[] = [];
    const posted: { path: string; body: unknown }[] = [];
    const client: Lookups = {
        lookup: {
            node: async (dcid) => {
                looked.push(dcid);
                const node = NODES.find(({ id }) => id === dcid);

                assert.ok(node, dcid);

                // The part of a Node readDefinitions reads.
                return { name: node.name, raw: { description: node.description } } as Awaited<
                    ReturnType<Lookups['lookup']['node']>
                >;
            },
        },
        request: async (_method, path, { json }) => {
            posted.push({ path, body: json });
            const { status, body } = answer(json);

            return { status, json: () => body };
        },
    };

    return { client, looked, posted };
};

/** Search's answer to an offer request: every part definite, with the fixture's offer. */
const offerAnswer = (body: unknown) => {
    const { entries } = (body as { input: { entries: unknown[] } }).input;
    const resolved = {
        unit_conversion: { default_base_year: OFFER.defaultBaseYear, currencies: OFFER.currencies },
    };

    return {
        status: 200,
        body: { parts: entries.map(() => ({ status: 'definite', spec: { resolved } })) },
    };
};

test('the definitions are the graph nodes in order, then the OECD quotes', async () => {
    const { client, looked } = stubClient(offerAnswer);

    assert.deepEqual(await readDefinitions(client), DEFINITIONS);
    assert.deepEqual(looked, NODE_IDS);
    assert.deepEqual(
        DEFINITIONS.filter(({ source }) => source === 'oecd'),
        OECD_QUOTES,
    );
});

test('a graph node with no description, or no name and no written label, is refused', () => {
    assert.throws(() => definitionsFromNodes([{ id: 'Gross', name: 'gross', description: '' }]));
    assert.throws(() => definitionsFromNodes([{ id: 'Net', name: null, description: 'Net.' }]));
});

test('the offer is two Search requests for the series in live-refs.json', async () => {
    const { client, posted } = stubClient(offerAnswer);
    const live = await readLive(client, liveRefs.data);

    assert.deepEqual(
        posted.map(({ path }) => path),
        ['/search/resolve', '/search/resolve'],
    );
    assert.equal(live.identities.length, 9);
    assert.equal(live.maxEntries, 6);
    assert.deepEqual(live.offer, OFFER);
});

test('a Search answer other than 200 fails the offer', async () => {
    const { client } = stubClient(() => ({ status: 503, body: {} }));

    await assert.rejects(readLive(client, liveRefs.data));
});

test('the lookups and Search requests run in the lane given', async () => {
    const { client, looked, posted } = stubClient(offerAnswer);
    const inner = createLane(1);
    let ran = 0;
    const lane: Lane = {
        run: (task, signal) => {
            ran += 1;

            return inner.run(task, signal);
        },
    };

    await readDefinitions(client, lane);
    await readLive(client, liveRefs.data, lane);

    assert.equal(ran, looked.length + posted.length);
    assert.equal(ran, NODE_IDS.length + 2);
});
