import assert from 'node:assert/strict';
import test from 'node:test';

import type { CatalogueCounts } from '../../search/catalogue.ts';
import type { Filterable } from '../../sources/filters.ts';
import {
    dataAvailabilityOf,
    dataFacts,
    datasetCount,
    EMPTY_DATA_AVAILABILITY,
    publisherHref,
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

const SOURCES = [
    card('CRS', 'dc/s/OECD', 'OECD', DFO),
    card('WDI', 'dc/s/WorldBank', 'World Bank', BASE),
    card('DAC', 'dc/s/OECD', 'OECD', DFO),
];

test('the overview groups the sources the way the Sources page chips do', () => {
    assert.deepEqual(dataAvailabilityOf(COUNTS, SOURCES), {
        counts: COUNTS,
        publishers: [
            { id: 'dc/s/OECD', label: 'OECD', count: 2 },
            { id: 'base', label: 'Data Commons by Google', count: 1 },
        ],
    });
});

test('a missing read leaves its half null', () => {
    assert.deepEqual(dataAvailabilityOf(null, SOURCES).counts, null);
    assert.deepEqual(dataAvailabilityOf(COUNTS, null).publishers, null);
    assert.deepEqual(dataAvailabilityOf(null, null), EMPTY_DATA_AVAILABILITY);
});

test('the facts are the counts, formatted, with the aid years as a range', () => {
    assert.deepEqual(dataFacts(COUNTS), [
        { label: 'Indicators', value: '108,917' },
        { label: 'Datasets', value: '92' },
        { label: 'Publishers', value: '42' },
        { label: 'Countries', value: '246' },
        { label: 'Aid donors', value: '172' },
        { label: 'Aid recipients', value: '235' },
        { label: 'Aid data years', value: '1960–2025' },
    ]);
});

test('without aid years the facts stop at the recipients; without counts there are none', () => {
    const facts = dataFacts({ ...COUNTS, aid: { ...COUNTS.aid, years: null } });

    assert.equal(facts.at(-1)?.label, 'Aid recipients');
    assert.deepEqual(dataFacts(null), []);
});

test('a publisher links to the Sources page filtered to it', () => {
    assert.equal(
        publisherHref({ id: 'dc/s/OECD', label: 'OECD', count: 2 }),
        '/data/sources?filter=dc%2Fs%2FOECD',
    );
    assert.equal(datasetCount(1), '1 dataset');
    assert.equal(datasetCount(12), '12 datasets');
});
