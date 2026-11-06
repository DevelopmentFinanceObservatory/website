import assert from 'node:assert/strict';
import test from 'node:test';

import type { CatalogueCounts } from '../../search/catalogue.ts';
import type { Filterable } from '../../sources/filters.ts';
import {
    DATA_AVAILABILITY_PATH,
    dataAvailabilityOf,
    EMPTY_DATA_AVAILABILITY,
    fetchDataAvailability,
    parseDataAvailability,
    sourceDatasetCount,
    sourceHref,
} from '../dataAvailability.ts';

const COUNTS: CatalogueCounts = {
    publishers: 42,
    countries: 246,
    indicators: 108917,
    datasets: 92,
    aid: { donors: 172, recipients: 235, years: { first: 1960, last: 2025 } },
};

const DFO = { id: 'dfo', label: 'Development Finance Observatory' } as const;
const BASE = { id: 'base', label: 'Data Commons by Google' } as const;

const card = (
    title: string,
    family: string,
    publisher: string,
    dataCommons: Filterable['dataCommons'],
): Filterable => ({ title, family, publisher, dataCommons });

const CARDS = [
    card('CRS', 'dc/s/OECD', 'OECD', DFO),
    card('WDI', 'dc/s/WorldBank', 'World Bank', BASE),
    card('DAC', 'dc/s/OECD', 'OECD', DFO),
];

const SOURCES = [
    { id: 'dc/s/OECD', label: 'OECD', count: 2 },
    { id: 'base', label: 'Data Commons by Google', count: 1 },
];

test('the overview groups the cards the way the Sources page chips do', () => {
    assert.deepEqual(dataAvailabilityOf(COUNTS, CARDS), { counts: COUNTS, sources: SOURCES });
});

test('a missing read leaves its half null', () => {
    assert.deepEqual(dataAvailabilityOf(null, CARDS).counts, null);
    assert.deepEqual(dataAvailabilityOf(COUNTS, null).sources, null);
    assert.deepEqual(dataAvailabilityOf(null, null), EMPTY_DATA_AVAILABILITY);
});

test('a source links to the Sources page filtered to it, with its dataset count', () => {
    assert.equal(sourceHref(SOURCES[0]!), '/data/sources?filter=dc%2Fs%2FOECD');
    assert.equal(sourceDatasetCount(1), '1 dataset');
    assert.equal(sourceDatasetCount(1200), '1,200 datasets');
});

test('parseDataAvailability accepts the route body and drops a malformed source', () => {
    assert.deepEqual(parseDataAvailability({ counts: COUNTS, sources: SOURCES }), {
        counts: COUNTS,
        sources: SOURCES,
    });
    assert.deepEqual(
        parseDataAvailability({ counts: null, sources: null }),
        EMPTY_DATA_AVAILABILITY,
    );
    assert.deepEqual(parseDataAvailability({ counts: null, sources: [SOURCES[0], { id: 'x' }] }), {
        counts: null,
        sources: [SOURCES[0]],
    });
});

test('parseDataAvailability rejects a body that is not an overview', () => {
    assert.equal(parseDataAvailability(null), null);
    assert.equal(parseDataAvailability('no'), null);
    assert.equal(parseDataAvailability({ counts: 5, sources: null }), null);
    assert.equal(parseDataAvailability({ counts: null, sources: 'many' }), null);
});

test('fetchDataAvailability reads the route and gives null on any failure', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ counts: COUNTS, sources: SOURCES }),
    );

    assert.deepEqual(await fetchDataAvailability(), { counts: COUNTS, sources: SOURCES });
    assert.equal(String(fetchMock.mock.calls[0]!.arguments[0]), DATA_AVAILABILITY_PATH);

    t.mock.method(globalThis, 'fetch', async () => new Response('down', { status: 503 }));
    assert.equal(await fetchDataAvailability(), null);

    t.mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('fetch failed');
    });
    assert.equal(await fetchDataAvailability(), null);
});
