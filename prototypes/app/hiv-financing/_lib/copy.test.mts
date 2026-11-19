import assert from 'node:assert/strict';
import test from 'node:test';

import {
    allSentence,
    codeChangeSentence,
    shareNote,
    countrySentence,
    ledeSentence,
    largestOtherFalls,
    loansSentence,
    plhivGapNote,
    stripCaption,
    tableRule,
    unallocatedNote,
    usSwingSentence,
} from './copy.ts';
import {
    CONGO,
    country,
    DATA,
    DR_CONGO,
    IVORY_COAST,
    KENYA,
    MEXICO,
    NAMIBIA,
    UKRAINE,
    YEARS,
} from './fixture.mts';

test('the lede names the two providers and the majority split; the share note carries the share', () => {
    assert.equal(
        ledeSentence(DATA),
        'In 2024, the United States and the Global Fund disbursed almost all HIV aid recorded for countries. Of the 4 countries that received more than $1m, the Global Fund disbursed more than half in 1 and the United States in 2.',
    );
    assert.equal(
        shareNote(DATA),
        'In these CRS figures, the United States and the Global Fund disbursed 99% of the HIV aid official donors recorded for countries in 2024. In 1 of the 2 countries where the United States disbursed more than half, the Global Fund also disbursed multi-disease grants under other codes.',
    );
});

test('the all-countries sentence: allocated, recipients and table count, others now and then, the largest falls', () => {
    // Falls: IDA $86m, UNAIDS $57m, Australia $50m, Germany $23m, the UK $21.4m, against a
    // total fall of $295m; France's rise is left out.
    assert.equal(
        allSentence(DATA),
        'In 2024, donors disbursed $6.45bn in HIV aid to 8 countries. Providers other than the United States and the Global Fund disbursed $47m to countries in 2024, against $342m in 2015. Five providers account for $237m, or 80%, of that fall: World Bank IDA, which lent $2.0m in 2024; UNAIDS, which reports most of its HIV money under another code; Australia; Germany; and the United Kingdom.',
    );
});

test('the falls name only the largest, and a fact attaches only to a named provider', () => {
    assert.deepEqual(
        largestOtherFalls(DATA, 2).map(({ name }) => name),
        ['International Development Association', 'Joint United Nations Programme on HIV/AIDS'],
    );

    const otherProviders = DATA.otherProviders.map((provider) =>
        provider.name === 'Joint United Nations Programme on HIV/AIDS'
            ? { ...provider, first: 1e6, last: 0 }
            : provider,
    );

    // With a $1m fall UNAIDS drops out of the five, and its fact with it.
    assert.match(
        allSentence({ ...DATA, otherProviders }),
        /fall: World Bank IDA, which lent \$2\.0m in 2024; Australia; Germany; the United Kingdom; and Norway\.$/,
    );
});

test('the falls throw when a provider with a fixed fact is missing from the data', () => {
    const otherProviders = DATA.otherProviders.filter(
        ({ name }) => name !== 'International Development Association',
    );

    assert.throws(
        () => allSentence({ ...DATA, otherProviders }),
        /"International Development Association"/,
    );
});

test('the unallocated note compares the US total with KFF and gives the range to countries', () => {
    const us = (values: number[]) => ({
        us: values,
        globalFund: [0, 0, 0, 0],
        other: [0, 0, 0, 0],
    });

    assert.equal(
        unallocatedNote({
            ...DATA,
            years: [2019, 2020, 2023, 2024],
            allocated: us([2e9, 3.2e9, 3.9e9, 3.5e9]),
            unallocated: { ...us([0, 0, 0.1e9, 4.5e9]), other: [0, 0, 0, 0.1e9] },
        }),
        'The chart excludes $4.60bn of 2024 HIV aid reported for regions or with no country specified. Including those flows, total US disbursements under this code were $4.00bn in 2023 and $8.00bn in 2024. KFF puts US bilateral HIV spending at $5.4bn in 2024. US disbursements to countries ranged from $3.20bn to $3.90bn a year from 2020 to 2024, with the remainder reported as regional or unallocated.',
    );
    // With no year from 2020 the range sentence is left out.
    assert.match(
        unallocatedNote({
            ...DATA,
            years: [2016, 2017, 2018, 2019],
            allocated: us([2e9, 3.2e9, 3.9e9, 3.5e9]),
            unallocated: us([0, 0, 0.1e9, 4.5e9]),
        }),
        /at \$5\.4bn in 2024\.$/,
    );
});

test('the strip caption counts from the data, and the table rule names the year', () => {
    assert.equal(
        stripCaption(DATA),
        '3 countries that received aid in 2024 and have at least 50,000 people living with HIV',
    );
    assert.equal(tableRule(DATA), 'The table lists every country that received HIV aid in 2024.');
});

test('a country sentence with every clause', () => {
    assert.equal(
        countrySentence(KENYA, YEARS),
        'In 2024, Kenya received $304m in HIV aid, or $217 per person living with HIV. Of that, 66% came from the United States, 33% from the Global Fund, and 1% from all other providers. 87% of the 1.40 million people living with HIV were on antiretroviral therapy. AIDS-related deaths fell from 36,400 in 2015 to 20,800 in 2024.',
    );
});

test('missing data leaves its clause out', () => {
    const cases: [string, string][] = [
        // No ART figure and no 2015 deaths. A provider with no money is left out of the mix.
        [
            countrySentence(IVORY_COAST, YEARS),
            "In 2024, Côte d'Ivoire received $90m in HIV aid, or $450 per person living with HIV. Of that, 44% came from the United States and 56% from the Global Fund.",
        ],
        // No UNAIDS figures: no per-person figure, no treatment, no deaths.
        [
            countrySentence(UKRAINE, YEARS),
            'In 2024, Ukraine received $52m in HIV aid. Of that, 58% came from the United States, 38% from the Global Fund, and 4% from all other providers.',
        ],
        // All US under 13040, with Global Fund multi-disease grants under other codes.
        [
            countrySentence(NAMIBIA, YEARS),
            'In 2024, Namibia received $71m in HIV aid, or $323 per person living with HIV. Of that, 100% came from the United States. The Global Fund disbursed $16m in multi-disease grants to Namibia in 2024, recorded under other codes and excluded from the HIV aid total. 95% of the 220,000 people living with HIV were on antiretroviral therapy. AIDS-related deaths fell from 3,800 in 2015 to 3,200 in 2024.',
        ],
        // Under 5,000 people living with HIV: no per-person figure.
        [
            countrySentence(
                country({
                    name: 'Gamma',
                    aid: { us: [0, 2e6], globalFund: [0, 0], other: [0, 0] },
                    plhiv: 4_999,
                }),
                YEARS,
            ),
            'In 2024, Gamma received $2.0m in HIV aid. Of that, 100% came from the United States.',
        ],
        // No aid: no per-person figure and no mix.
        [
            countrySentence(MEXICO, YEARS),
            'In 2024, Mexico received no HIV aid. 70% of the 300,000 people living with HIV were on antiretroviral therapy. AIDS-related deaths held at 4,000 from 2015 to 2024.',
        ],
    ];

    for (const [actual, expected] of cases) {
        assert.equal(actual, expected);
    }
});

test('a name that takes "the" gets it in the sentence', () => {
    const philippines = country({
        iso3: 'PHL',
        name: 'Philippines',
        aid: { us: [0, 2e6], globalFund: [0, 0], other: [0, 0] },
    });

    assert.match(countrySentence(philippines, YEARS), /^In 2024, the Philippines received \$2\.0m/);
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

test('the mix prints largest-remainder percentages that sum to 100', () => {
    const thirds = country({
        name: 'Delta',
        aid: { us: [0, 1e6], globalFund: [0, 1e6], other: [0, 1e6] },
    });

    assert.match(
        countrySentence(thirds, YEARS),
        /Of that, 34% came from the United States, 33% from the Global Fund, and 33% from all other providers\.$/,
    );
});

test('a small share is named as the table prints it', () => {
    const mostlyUs = country({
        name: 'Beta',
        aid: { us: [0, 996e3], globalFund: [0, 4e3], other: [0, 0] },
    });

    assert.equal(
        countrySentence(mostlyUs, YEARS),
        'In 2024, Beta received $1.0m in HIV aid. Of that, >99% came from the United States and <1% from the Global Fund.',
    );
});

test('the lede throws when the two providers no longer disburse almost all', () => {
    assert.throws(
        () => ledeSentence({ ...DATA, allocated: { ...DATA.allocated, other: [342e6, 1e9] } }),
        /almost all/,
    );
});

test('the fall sentence drops its share when the named falls exceed the net fall', () => {
    // Others fell by $142m net while the five named fell by $237m, so others rose elsewhere.
    const allocated = { ...DATA.allocated, other: [342e6, 200e6] };

    assert.match(
        allSentence({ ...DATA, allocated }),
        /Five providers account for \$237m of that fall:/,
    );
});

test('the loans sentence names the lenders, with "from" only when they make up the total', () => {
    assert.equal(
        loansSentence(DATA),
        'It also includes $467m in ODA loans to countries from 2015 to 2024, from World Bank IDA ($303m) and the Asian Development Bank ($164m).',
    );
    assert.match(
        loansSentence({ ...DATA, loans: { ...DATA.loans, total: 500e6 } }) ?? '',
        /, including World Bank IDA/,
    );
    assert.equal(loansSentence({ ...DATA, loans: { total: 0, lenders: [] } }), null);
});

test('the Notes line names the countries with no estimate of people living with HIV', () => {
    assert.equal(
        plhivGapNote(DATA),
        "Estimates of people living with HIV for Ukraine are missing from the Development Finance Observatory's UNAIDS data, so aid per person is blank for it and the dot strip excludes it.",
    );
});

test('the code-change sentence reads the jump only when the multi-disease fall explains most of it', () => {
    const flat = { us: [0, 0], globalFund: [1061e6, 2100e6], other: [0, 0] };
    const around = { ...DATA, years: [2019, 2020], allocated: flat };

    assert.equal(
        codeChangeSentence({ ...around, globalFundMulti: [742e6, 108e6] }),
        'Between 2019 and 2020, Global Fund multi-disease grants to countries fell from $742m to $108m, while its disbursements under the HIV code rose from $1.06bn to $2.10bn. Much of the jump in its bars reflects that reclassification, marked by the dashed line.',
    );
    assert.doesNotMatch(
        codeChangeSentence({ ...around, globalFundMulti: [742e6, 600e6] }) ?? '',
        /Much of the jump/,
    );
    assert.equal(codeChangeSentence({ ...around, globalFundMulti: [100e6, 200e6] }), null);
    assert.equal(codeChangeSentence(DATA), null);
});

test('the US swing sentence appears only for a dip or spike in 2019, with verbs from the data', () => {
    const years = [2018, 2019, 2020];
    const us = (values: number[]) => ({
        ...DATA,
        years,
        allocated: { us: values, globalFund: [0, 0, 0], other: [0, 0, 0] },
    });

    assert.equal(
        usSwingSentence(us([3.65e9, 2.11e9, 3.72e9])),
        'US disbursements to countries fell from $3.65bn in 2018 to $2.11bn in 2019, then rose to $3.72bn in 2020, so single-year swings can reflect reporting timing.',
    );
    assert.match(
        usSwingSentence(us([2e9, 3e9, 2e9])) ?? '',
        /rose from \$2\.00bn in 2018 to \$3\.00bn in 2019, then fell/,
    );
    assert.equal(usSwingSentence(us([3.6e9, 3.5e9, 3.7e9])), null);
    assert.equal(usSwingSentence(DATA), null);
});
