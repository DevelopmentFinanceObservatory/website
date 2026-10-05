import assert from 'node:assert/strict';
import test from 'node:test';

import {
    catalogueChips,
    catalogueTiles,
    declinedExamples,
    parseCatalogue,
    parsePlaceCatalogue,
    placeScopeLine,
    roundedCount,
    scopeLine,
    type CatalogueExample,
    type PlaceCatalogue,
    type SearchCatalogue,
} from '../catalogue.ts';
import {
    placeCatalogueKenyaBody,
    wholeCatalogueBody,
    wholeCatalogueNoAidYearsBody,
} from './fixtures/catalogue-bodies.ts';

const example = (text: string, place: string): CatalogueExample => ({
    text,
    template: `${text.split(' ').slice(0, -1).join(' ')} {place}`,
    stat_var: 'sv',
    place,
});

const catalogue = (examples: CatalogueExample[]): SearchCatalogue => ({
    catalogue_version: 'v1',
    counts: {
        publishers: 40,
        countries: 205,
        indicators: 112866,
        datasets: 90,
        aid: { donors: 169, recipients: 205, years: { first: 1973, last: 2024 } },
    },
    examples,
});

const whole = catalogue([
    example('Health aid to Ethiopia', 'country/ETH'),
    example('Humanitarian aid from Germany', 'country/DEU'),
    example('Debt service paid by Ghana', 'country/GHA'),
    example('Population of Kenya', 'country/KEN'),
]);

const kenya: PlaceCatalogue = {
    catalogue_version: 'v1',
    counts: {
        publishers: 12,
        variables: 900,
        aid: { donors: 41, recipients: 0, years: { first: 1973, last: 2024 } },
    },
    examples: [
        example('Health aid to Kenya', 'country/KEN'),
        example('Debt service paid by Kenya', 'country/KEN'),
        example('Population of Kenya', 'country/KEN'),
        example('Inflation in Kenya', 'country/KEN'),
    ],
};

test('parseCatalogue reads the whole catalogue body the API serves', () => {
    assert.deepEqual(parseCatalogue(wholeCatalogueBody), wholeCatalogueBody);
});

test('parseCatalogue reads a body whose aid years are null', () => {
    assert.deepEqual(parseCatalogue(wholeCatalogueNoAidYearsBody), wholeCatalogueNoAidYearsBody);
});

test('parsePlaceCatalogue reads the place-scoped body the API serves', () => {
    assert.deepEqual(parsePlaceCatalogue(placeCatalogueKenyaBody), placeCatalogueKenyaBody);
});

test("each parser refuses the other scope's body", () => {
    assert.equal(parseCatalogue(placeCatalogueKenyaBody), null);
    assert.equal(parsePlaceCatalogue(wholeCatalogueBody), null);
});

test('parseCatalogue drops a malformed example', () => {
    const body = {
        ...whole,
        examples: [...whole.examples, { text: 'No template', stat_var: 'sv', place: 'x' }],
    };

    assert.deepEqual(parseCatalogue(body), whole);
});

test('parseCatalogue refuses a body without numeric counts', () => {
    assert.equal(parseCatalogue(null), null);
    assert.equal(parseCatalogue({ detail: 'Not Found' }), null);
    assert.equal(parseCatalogue({ ...whole, counts: { ...whole.counts, publishers: '40' } }), null);
    assert.equal(
        parseCatalogue({
            ...whole,
            counts: { ...whole.counts, aid: { ...whole.counts.aid, years: { first: 1973 } } },
        }),
        null,
    );
    assert.equal(parseCatalogue({ ...whole, examples: undefined }), null);
});

test('parseCatalogue refuses a whole body missing indicators or datasets', () => {
    for (const field of ['indicators', 'datasets'] as const) {
        const counts = Object.fromEntries(
            Object.entries(wholeCatalogueBody.counts).filter(([key]) => key !== field),
        );

        assert.equal(parseCatalogue({ ...wholeCatalogueBody, counts }), null, field);
    }
});

test('catalogueChips offers every example', () => {
    assert.deepEqual(catalogueChips(whole), [
        'Health aid to Ethiopia',
        'Humanitarian aid from Germany',
        'Debt service paid by Ghana',
        'Population of Kenya',
    ]);
});

test('catalogueChips offers no chips without a catalogue', () => {
    assert.deepEqual(catalogueChips(null), []);
});

test('scopeLine counts publishers and countries for the whole catalogue', () => {
    assert.equal(
        scopeLine(whole.counts),
        'DFO holds aid, debt and development data from 40 publishers, covering 205 countries.',
    );
});

test("placeScopeLine counts the place's variables and publishers", () => {
    assert.equal(
        placeScopeLine({ ...kenya.counts, publishers: 1, variables: 1 }, 'Kenya'),
        'DFO holds aid, debt and development data on Kenya, with 1 variable from 1 publisher.',
    );
    assert.equal(
        placeScopeLine({ ...kenya.counts, publishers: 9, variables: 1204 }, 'Kenya'),
        'DFO holds aid, debt and development data on Kenya, with 1,204 variables from 9 publishers.',
    );
});

test('scopeLine without counts still says what DFO holds', () => {
    assert.equal(scopeLine(null), 'DFO holds aid, debt and development data.');
    assert.equal(
        placeScopeLine(null, 'Kenya'),
        'DFO holds aid, debt and development data on Kenya.',
    );
});

test('declinedExamples prefers the first three filled with the confirmed country', () => {
    assert.deepEqual(
        declinedExamples(whole, kenya).map((one) => one.text),
        ['Health aid to Kenya', 'Debt service paid by Kenya', 'Population of Kenya'],
    );
});

test('declinedExamples falls back to the first three of the whole catalogue', () => {
    const firstThree = [
        'Health aid to Ethiopia',
        'Humanitarian aid from Germany',
        'Debt service paid by Ghana',
    ];

    assert.deepEqual(
        declinedExamples(whole, null).map((one) => one.text),
        firstThree,
    );
    assert.deepEqual(
        declinedExamples(whole, { ...kenya, examples: [] }).map((one) => one.text),
        firstThree,
    );
    assert.deepEqual(declinedExamples(null, null), []);
});

test('catalogueTiles shows indicators and datasets, or nothing without a catalogue', () => {
    assert.deepEqual(catalogueTiles(whole), [
        { value: '100K+', label: 'Indicators' },
        { value: '90', label: 'Datasets' },
    ]);
    assert.deepEqual(catalogueTiles(null), []);
});

for (const [count, shown] of [
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [1234, '1K+'],
    [100000, '100K'],
    [112866, '100K+'],
    [250000, '200K+'],
    [999999, '900K+'],
    [1000000, '1M'],
    [1234567, '1M+'],
] as const) {
    test(`roundedCount shows ${count} as ${shown}`, () => {
        assert.equal(roundedCount(count), shown);
    });
}
