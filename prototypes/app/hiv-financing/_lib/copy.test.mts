import assert from 'node:assert/strict';
import test from 'node:test';

import { allSentence, countrySentence, ledeSentence, plhivGapNote } from './copy.ts';
import {
    CONGO,
    country,
    DATA,
    DR_CONGO,
    IVORY_COAST,
    KENYA,
    MEXICO,
    UKRAINE,
    YEARS,
} from './fixture.mts';

test('the lede states the US and Global Fund share and the single-provider majority count', () => {
    assert.equal(
        ledeSentence(DATA),
        'In 2024 the United States and the Global Fund gave 99% of the external HIV financing that donors assigned to countries. In 3 of the 4 countries that received more than $1m, one of the two gave more than half.',
    );
});

test('the all-countries sentence: allocated, recipients, unallocated, others now and then', () => {
    assert.equal(
        allSentence(DATA),
        'In 2024 donors assigned $6.45bn of HIV aid to 96 countries and reported another $4.24bn for regions or no country. Providers other than the United States and the Global Fund gave $47m to countries, against $342m in 2015.',
    );
});

test('a country sentence with every clause', () => {
    assert.equal(
        countrySentence(KENYA, YEARS),
        'In 2024 Kenya received $304m in HIV aid, $217 per person living with HIV. Of that, 66% came from the United States, 33% from the Global Fund, and 1% from all other providers. 87% of its 1.40 million people living with HIV were on antiretroviral therapy. AIDS-related deaths fell from 36,400 in 2015 to 20,800 in 2024.',
    );
});

test('missing data leaves its clause out', () => {
    const cases: [string, string][] = [
        // No ART figure and no 2015 deaths. A provider with no money is left out of the mix.
        [
            countrySentence(IVORY_COAST, YEARS),
            "In 2024 Côte d'Ivoire received $90m in HIV aid, $450 per person living with HIV. Of that, 44% came from the United States and 56% from the Global Fund.",
        ],
        // No UNAIDS figures: no per-person figure, no treatment, no deaths.
        [
            countrySentence(UKRAINE, YEARS),
            'In 2024 Ukraine received $52m in HIV aid. Of that, 58% came from the United States, 38% from the Global Fund, and 4% from all other providers.',
        ],
        // No aid: no per-person figure and no mix.
        [
            countrySentence(MEXICO, YEARS),
            'In 2024 Mexico received no HIV aid. 70% of its 300,000 people living with HIV were on antiretroviral therapy. AIDS-related deaths held at 4,000 from 2015 to 2024.',
        ],
    ];

    for (const [actual, expected] of cases) {
        assert.equal(actual, expected);
    }
});

test('the deaths verb compares the printed figures', () => {
    assert.match(
        countrySentence(DR_CONGO, YEARS),
        /AIDS-related deaths held at 15,000 from 2015 to 2024\.$/,
    );
    assert.match(
        countrySentence(CONGO, YEARS),
        /AIDS-related deaths rose from 1,000 in 2015 to 1,200 in 2024\.$/,
    );
});

test('a share under half a point is not named', () => {
    const mostlyUs = country({
        name: 'Beta',
        aid: { us: [0, 996e3], globalFund: [0, 4e3], other: [0, 0] },
    });

    assert.equal(
        countrySentence(mostlyUs, YEARS),
        'In 2024 Beta received $1.0m in HIV aid. Of that, 100% came from the United States.',
    );
});

test('the Notes line names the countries with no estimate of people living with HIV', () => {
    assert.equal(
        plhivGapNote(DATA),
        'The DFO holds no UNAIDS estimate of people living with HIV for Ukraine, so the page gives no aid per person for it and leaves it off the dot strip.',
    );
});
