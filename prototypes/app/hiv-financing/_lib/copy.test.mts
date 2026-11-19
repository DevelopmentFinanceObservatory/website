import assert from 'node:assert/strict';
import test from 'node:test';

import {
    allSentence,
    codeChangeSentence,
    flagLegend,
    shareNote,
    countrySentence,
    ledeSentence,
    largestOtherFalls,
    loansSentence,
    otherMeasures,
    plhivGapNote,
    stripCaption,
    tableRule,
    unaidsGapNote,
    unallocatedCaption,
    usTotalNote,
    usSwingSentence,
} from './copy.ts';
import {
    CONGO,
    COUNTRIES,
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
        'In 2024, the latest year of OECD data, the United States and the Global Fund disbursed almost all HIV aid recorded for countries. Of the 4 countries that received more than $1m, the Global Fund disbursed more than half in 1 and the United States in 2.',
    );
    assert.equal(
        shareNote(DATA),
        'The United States and the Global Fund disbursed 99% of HIV aid recorded for countries in 2024. Of the 2 countries where the United States disbursed more than half, 1 also received Global Fund multi-disease grants.',
    );
});

test('the all-countries sentence: allocated, recipients and table count, others now and then, the largest falls', () => {
    // Falls: IDA $86m, UNAIDS $57m, Australia $50m, Germany $23m, the UK $21.4m, against a
    // total fall of $295m; France's rise is left out.
    assert.equal(
        allSentence(DATA),
        'In 2024, donors disbursed $6.45bn in HIV aid to 8 countries. Providers other than the United States and the Global Fund disbursed $47m in 2024, against $342m in 2015. Five providers account for $237m, or 80%, of that fall: World Bank IDA, which lent $2.0m in 2024; UNAIDS; Australia; Germany; and the United Kingdom.',
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

    // With a $1m fall UNAIDS drops out of the five.
    assert.match(
        allSentence({ ...DATA, otherProviders }),
        /fall: World Bank IDA, which lent \$2\.0m in 2024; Australia; Germany; the United Kingdom; and Norway\.$/,
    );
});

test('the falls throw when a provider with a fixed fact is missing from the data', () => {
    const otherProviders = DATA.otherProviders.filter(
        ({ name }) => name !== 'International Development Association',
    );

    assert.doesNotThrow(() => allSentence(DATA));
    assert.throws(() => allSentence({ ...DATA, otherProviders }));
});

test('the unallocated note compares the US total with KFF and places the excess', () => {
    const us = (values: number[]) => ({
        us: values,
        globalFund: [0, 0, 0, 0],
        other: [0, 0, 0, 0],
    });
    const text = (parts: { text: string }[]) => parts.map((part) => part.text).join(' ');
    const recent = {
        ...DATA,
        years: [2019, 2020, 2023, 2024],
        allocated: us([2e9, 3.2e9, 3.9e9, 3.5e9]),
        unallocated: { ...us([0, 0, 0.1e9, 4.5e9]), other: [0, 0, 0, 0.1e9] },
    };
    const parts = usTotalNote(recent);

    assert.equal(
        unallocatedCaption(recent),
        'The chart excludes $4.60bn of 2024 HIV aid reported for regions or no country, $4.50bn of it from the United States.',
    );
    assert.equal(
        text(parts),
        "Including aid for regions or no country, US disbursements under the HIV code totalled $4.00bn in 2023 and $8.00bn in 2024. KFF puts US bilateral HIV spending at $5.4bn in 2024. In 2024, $3.50bn went to named countries, so the excess over KFF's figure lies in the $4.50bn reported for regions or no country. US disbursements to countries stayed between $3.20bn and $3.90bn a year from 2020 to 2024.",
    );
    // The KFF citation sits on the part that quotes KFF.
    assert.match(parts[0]?.sources?.[0]?.url ?? '', /kff\.org/);
    // With US money to countries above KFF's figure, the excess cannot be placed.
    assert.doesNotMatch(
        text(usTotalNote({ ...recent, allocated: us([2e9, 3.2e9, 3.9e9, 5.5e9]) })),
        /excess over KFF/,
    );
    // Before 2020 there is no range, and outside KFF's year no excess sentence.
    assert.match(
        text(
            usTotalNote({
                ...DATA,
                years: [2016, 2017, 2018, 2019],
                allocated: us([2e9, 3.2e9, 3.9e9, 3.5e9]),
                unallocated: us([0, 0, 0.1e9, 4.5e9]),
            }),
        ),
        /at \$5\.4bn in 2024\.$/,
    );
});

test('the flag legend counts the multi-disease money to countries outside the table', () => {
    assert.match(flagLegend(DATA), /A further \$595m went to countries with no HIV aid in 2024\.$/);
    assert.doesNotMatch(flagLegend({ ...DATA, globalFundMulti: [0, 5e6] }), /A further/);
});

test('the UNAIDS gap note names missing coverage and deaths outside the PLHIV gap', () => {
    assert.equal(
        unaidsGapNote(COUNTRIES, YEARS),
        'The same data have no figures on treatment coverage for Côte d\'Ivoire. Missing cells show "–". With no 2015 AIDS-related deaths figure for Côte d\'Ivoire, its summary leaves out the 2015 comparison.',
    );
    assert.equal(unaidsGapNote([DR_CONGO, UKRAINE], YEARS), null);
});

test('the strip caption counts from the data, and the table rule names the year', () => {
    assert.equal(
        stripCaption(COUNTRIES, 2024),
        '3 countries that received HIV aid in 2024 and have at least 50,000 people living with HIV',
    );
    assert.equal(tableRule(DATA), 'Every country that received HIV aid in 2024.');
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
            'In 2024, Namibia received $71m in HIV aid, or $323 per person living with HIV. Of that, 100% came from the United States. The Global Fund disbursed $16m in multi-disease grants to Namibia in 2024, recorded under other CRS codes and excluded from the HIV aid total. 95% of the 220,000 people living with HIV were on antiretroviral therapy. AIDS-related deaths fell from 3,800 in 2015 to 3,200 in 2024.',
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
    assert.doesNotThrow(() => ledeSentence(DATA));
    assert.throws(() =>
        ledeSentence({ ...DATA, allocated: { ...DATA.allocated, other: [342e6, 1e9] } }),
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
        'Disbursements to countries from 2015 to 2024 included $467m in ODA loans, all from World Bank IDA ($303m) and the Asian Development Bank ($164m).',
    );
    assert.match(
        loansSentence({ ...DATA, loans: { ...DATA.loans, total: 500e6 } }) ?? '',
        /, including World Bank IDA/,
    );
    assert.equal(loansSentence({ ...DATA, loans: { total: 0, lenders: [] } }), null);
});

test('the Notes line names the countries with no estimate of people living with HIV', () => {
    assert.equal(
        plhivGapNote(COUNTRIES),
        'The UNAIDS data here lack an estimate of people living with HIV for Ukraine, so aid per person is blank and the strip excludes it.',
    );
});

test('the code-change sentence reads the jump only when the multi-disease fall explains most of it', () => {
    const flat = { us: [0, 0], globalFund: [1061e6, 2100e6], other: [0, 0] };
    const around = { ...DATA, years: [2019, 2020], allocated: flat };

    assert.equal(
        codeChangeSentence({ ...around, globalFundMulti: [742e6, 108e6] }),
        "From 2019 to 2020, the Global Fund's multi-disease grants to countries fell from $742m to $108m, while its HIV-code disbursements rose from $1.06bn to $2.10bn. That reclassification, marked by the dashed line, explains much of the jump.",
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
        'US disbursements to countries fell from $3.65bn in 2018 to $2.11bn in 2019, then rose to $3.72bn in 2020.',
    );
    assert.match(
        usSwingSentence(us([2e9, 3e9, 2e9])) ?? '',
        /rose from \$2\.00bn in 2018 to \$3\.00bn in 2019, then fell/,
    );
    assert.equal(usSwingSentence(us([3.6e9, 3.5e9, 3.7e9])), null);
    assert.equal(usSwingSentence(DATA), null);
});

test('other measures: the Global Fund share against countries and against the wider total', () => {
    const series = (us: number, globalFund: number, other: number) => ({
        us: [0, us],
        globalFund: [0, globalFund],
        other: [0, other],
    });
    const data = {
        ...DATA,
        years: [2023, 2024],
        allocated: series(3e9, 2e9, 0.1e9),
        unallocated: series(4e9, 0, 0.1e9),
    };

    // Countries: GF 2/5.1 = 39%, US and GF 98%. With $4.1bn more: GF 2/9.2 = 22%, together 98%.
    assert.match(
        otherMeasures(data).text,
        /^Shares depend on the total\. Here the Global Fund disbursed 39% of HIV aid recorded for countries in 2024\. Including the \$4\.10bn reported for regions or no country, mostly from the United States, its share is 22%, and the two together still disbursed 98%\. The Global Fund puts/,
    );
    // Money elsewhere mostly from other providers: no "mostly" clause, and no "still" when the
    // combined share moves (5/8.1 = 62%).
    assert.match(
        otherMeasures({ ...data, unallocated: series(0, 0, 3e9) }).text,
        /no country, its share is 25%, and the two together disbursed 62%\./,
    );
    // Nothing elsewhere: no wider-total sentence.
    assert.doesNotMatch(otherMeasures({ ...data, unallocated: series(0, 0, 0) }).text, /Including/);
});
