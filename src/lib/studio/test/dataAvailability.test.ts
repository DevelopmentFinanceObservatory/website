import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCatalogue } from '../../search/catalogue.ts';
import { wholeCatalogueBody } from '../../search/test/fixtures/catalogue-bodies.ts';
import {
    fetchCounts,
    fetchSources,
    type Half,
    needsRead,
    parseSources,
    READING,
    settledHalf,
    sourceDatasetCount,
    sourceHref,
    UNREAD,
} from '../dataAvailability.ts';

const SOURCES = [
    { id: 'dc/s/OECD', label: 'OECD', count: 2 },
    { id: 'base', label: 'Data Commons by Google', count: 1 },
];

const pathOf = (call: { arguments: readonly unknown[] }): string => String(call.arguments[0]);

test('a source links to the Sources page filtered to it, with its dataset count', () => {
    assert.equal(sourceHref(SOURCES[0]!), '/data/sources?filter=dc%2Fs%2FOECD');
    assert.equal(sourceDatasetCount(1), '1 dataset');
    assert.equal(sourceDatasetCount(1200), '1,200 datasets');
});

test('opening the drawer reads a half that is unread or failed, and leaves one read or on its way', () => {
    const read: Half<number> = { status: 'read', value: 1 };

    assert.equal(needsRead(UNREAD), true);
    assert.equal(needsRead(settledHalf(null)), true);
    assert.equal(needsRead(READING), false);
    assert.equal(needsRead(read), false);
    assert.deepEqual(settledHalf(1), read);
    assert.deepEqual(settledHalf([]), { status: 'read', value: [] });
});

test('parseSources keeps the rows and drops a malformed one', () => {
    assert.deepEqual(parseSources({ sources: SOURCES }), SOURCES);
    assert.deepEqual(parseSources({ sources: [SOURCES[0], { id: 'x' }, null] }), [SOURCES[0]]);
    assert.deepEqual(parseSources({ sources: [] }), []);
});

test('parseSources rejects a body that is not a source list', () => {
    assert.equal(parseSources(null), null);
    assert.equal(parseSources('no'), null);
    assert.equal(parseSources({ sources: 'many' }), null);
    assert.equal(parseSources([SOURCES]), null);
});

test('fetchCounts reads the counts from the catalogue the route serves', async (t) => {
    // The route serves the catalogue the server parsed.
    const served = parseCatalogue(wholeCatalogueBody);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json(served));

    assert.deepEqual(await fetchCounts(), wholeCatalogueBody.counts);
    assert.equal(pathOf(fetchMock.mock.calls[0]!), '/api/data-availability/counts');
});

test('fetchCounts gives null for a malformed body or a failed read', async (t) => {
    for (const body of [{ ...wholeCatalogueBody, counts: {} }, { counts: [] }, [], null]) {
        t.mock.method(globalThis, 'fetch', async () => Response.json(body));
        assert.equal(await fetchCounts(), null, JSON.stringify(body));
    }

    t.mock.method(globalThis, 'fetch', async () =>
        Response.json(wholeCatalogueBody, { status: 503 }),
    );
    assert.equal(await fetchCounts(), null);

    t.mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('fetch failed');
    });
    assert.equal(await fetchCounts(), null);
});

test('fetchSources reads the rows and gives null on a failed read', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ sources: SOURCES }),
    );

    assert.deepEqual(await fetchSources(), SOURCES);
    assert.equal(pathOf(fetchMock.mock.calls[0]!), '/api/data-availability/sources');

    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ sources: SOURCES }, { status: 503 }),
    );
    assert.equal(await fetchSources(), null);

    t.mock.method(globalThis, 'fetch', async () => new Response('not json'));
    assert.equal(await fetchSources(), null);
});
