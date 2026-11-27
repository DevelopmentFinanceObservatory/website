/**
 * `seriesLabels.ts`: what every series name shares is dropped, what tells
 * them apart is kept, and a name that would lose that is left alone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { legendLabels, splitLabels } from '../seriesLabels.ts';

const who = (category: string) =>
    `Health expenditure as a share of a reference expenditure aggregate [Health expenditure category=${category}, Reference expenditure category=Current health expenditure] / Kenya`;

test('a WHO series keeps only what the category adds', () => {
    assert.deepEqual(
        legendLabels([
            who('Domestic general government health expenditure'),
            who('Domestic private health expenditure'),
            who('External health expenditure'),
        ]),
        [
            'Domestic general government health expenditure',
            'Domestic private health expenditure',
            'External health expenditure',
        ],
    );
});

// Indicator names as the graph and the World Development Indicators label
// them, each set the siblings a chart compares: the shared sentence and keys
// go, and each dimension value or name stays whole.
for (const [labels, expected] of [
    [
        [
            'Infant mortality rate [Age=Under 1 year old, Sex=Male]',
            'Infant mortality rate [Age=Under 1 year old]',
        ],
        ['Under 1 year old, Sex=Male', 'Under 1 year old'],
    ],
    [
        [
            'Unemployment rate - 13th ICLS [15 years old and over, Disability status = Persons with disability] / Kenya',
            'Unemployment rate - 13th ICLS [15 years old and over, Disability status = Persons without disability] / Kenya',
        ],
        ['Persons with disability', 'Persons without disability'],
    ],
    [
        [
            'Average monthly earnings of employees in international dollars at Purchasing Power Parity rates (PPP) [Economic activity=Non-agriculture]',
            'Average monthly earnings of employees in international dollars at Purchasing Power Parity rates (PPP) [Economic activity=Total (broad sector)]',
        ],
        ['Non-agriculture', 'Total (broad sector)'],
    ],
    [
        [
            'Net bilateral aid flows from DAC donors, United States (current US$)',
            'Net bilateral aid flows from DAC donors, United Kingdom (current US$)',
        ],
        ['United States', 'United Kingdom'],
    ],
] as const) {
    test(`an indicator set shortens to whole values: ${expected.join(' | ')}`, () => {
        assert.deepEqual(legendLabels([...labels]), expected);
    });
}

// Place and organisation names share whole words with their neighbours. The
// sets are written from the M49, DAC and multilateral names. A row without
// an expected value expects the names unchanged.
const nameRows: [labels: string[], expected?: string[]][] = [
    [['United States of America', 'United Kingdom']],
    [['South Africa', 'South Sudan']],
    [['Republic of Korea', 'Republic of Moldova']],
    [['Democratic Republic of the Congo', "Democratic People's Republic of Korea"]],
    [['Northern America', 'Latin America']],
    [['Solomon Islands', 'Marshall Islands', 'Cook Islands']],
    [['Bolivia (Plurinational State of)', 'Venezuela (Bolivarian Republic of)']],
    [['Virgin Islands (British)', 'Virgin Islands (U.S.)']],
    [
        [
            'China, Hong Kong Special Administrative Region',
            'China, Macao Special Administrative Region',
        ],
    ],
    [['United Nations Population Fund', "United Nations Children's Fund"]],
    [
        ['United States of America / Current US dollars', 'United Kingdom / Current US dollars'],
        ['United States of America', 'United Kingdom'],
    ],
    [
        ['Gavi, the Vaccine Alliance / Kenya', 'Global Fund / Kenya'],
        ['Gavi, the Vaccine Alliance', 'Global Fund'],
    ],
    [['Kenya total', 'Kenyatta total']],
    [
        ['GDP of Kenya / current USD', 'GDP of Ghana / current USD'],
        ['GDP of Kenya', 'GDP of Ghana'],
    ],
];

for (const [labels, expected = labels] of nameRows) {
    test(`a shared word stays with its name: ${labels.join(' | ')}`, () => {
        assert.deepEqual(legendLabels(labels), expected);
    });
}

test('the leading clause stands alone when it is already unique', () => {
    assert.deepEqual(
        legendLabels([
            'Spend [scheme=Public health, unit=USD, year=2020] / Kenya',
            'Spend [scheme=Private care, unit=EUR, year=2021] / Kenya',
        ]),
        ['Public health', 'Private care'],
    );
});

test('names with nothing in common are left alone', () => {
    const labels = ['Kenya', 'Ghana', 'Nigeria'];

    assert.deepEqual(legendLabels(labels), labels);
});

test('a lone series is left alone', () => {
    assert.deepEqual(legendLabels(['Health expenditure / Kenya']), ['Health expenditure / Kenya']);
});

test('an empty name leaves every name whole', () => {
    const labels = ['Spend / Kenya', ''];

    assert.deepEqual(legendLabels(labels), labels);
});

test('cutting that would make two names the same leaves them whole', () => {
    const labels = ['Spend [a] / Kenya', 'Spend [a / Kenya'];

    assert.deepEqual(legendLabels(labels), labels);
});

test('splitLabels returns the shared head and tail, edges trimmed', () => {
    assert.deepEqual(
        splitLabels([
            'Spend [scheme=Public health, unit=USD, year=2020] / Kenya',
            'Spend [scheme=Private care, unit=EUR, year=2021] / Kenya',
        ]),
        { prefix: 'Spend [scheme', suffix: 'Kenya', names: ['Public health', 'Private care'] },
    );
    assert.deepEqual(splitLabels(['Kenya', 'Ghana']), {
        prefix: '',
        suffix: '',
        names: ['Kenya', 'Ghana'],
    });
});
