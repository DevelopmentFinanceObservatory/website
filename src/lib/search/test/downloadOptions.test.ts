import assert from 'node:assert/strict';
import test from 'node:test';

import {
    type BoundEntity,
    choicesNeedOptions,
    DEFAULT_DOWNLOAD_CHOICES,
    enrichmentGroups,
    inFileNote,
    mintColumns,
    parseDownloadChoices,
    resolveChoices,
    totalsNote,
} from '../downloadOptions.ts';
import type { DatasetEnrichment, DatasetOutputOptions } from '../searchClient.ts';

const enrichment = (
    column: string,
    field: string,
    state = 'available',
    coverage = { entities: 1, covered: 1 },
): DatasetEnrichment => ({ column, field, token: `${column}_${field}`, state, coverage });

/** An options document holding `fields`, every other member empty. */
const outputOptions = (fields: Partial<DatasetOutputOptions>): DatasetOutputOptions => ({
    capability_version: 'test',
    columns: [],
    formats: [],
    bundle: { state: 'available' },
    enrichments: [],
    long_layout_defaults: [],
    long_layout_totals: [],
    pivots: [],
    groupby: { state: 'available' },
    ...fields,
});

const column = (name: string) => ({ name, kind: 'dimension', droppable: false, distinct: null });

// A flow answer's options: its frame columns, and extras on both role columns
// (the recipient side partial), as the options door for "Humanitarian aid
// from Germany" answers them.
const flowOptions = outputOptions({
    columns: ['stat_var', 'financingProvider', 'financingRecipient', 'time_period', 'value'].map(
        column,
    ),
    enrichments: [
        enrichment('financingProvider', 'iso3'),
        enrichment('financingProvider', 'type'),
        enrichment('financingRecipient', 'iso3', 'partial', { entities: 145, covered: 125 }),
        enrichment('financingRecipient', 'label', 'unavailable'),
    ],
});

const flowDimensions = [
    {
        label: 'financingProvider',
        count: 1,
        axis: 'origin' as const,
        noun: { singular: 'provider', plural: 'providers' },
    },
    {
        label: 'financingRecipient',
        count: 145,
        axis: 'destination' as const,
        noun: { singular: 'recipient', plural: 'recipients' },
    },
    { label: 'years', count: 42 },
];

test('parseDownloadChoices keeps valid stored fields and defaults the rest', () => {
    assert.deepEqual(
        parseDownloadChoices(
            JSON.stringify({ format: 'xlsx', bundle: false, enrichment: ['a_iso3', 3] }),
        ),
        { format: 'xlsx', bundle: false, enrichment: ['a_iso3'] },
    );
    assert.deepEqual(
        parseDownloadChoices(JSON.stringify({ format: 'pdf', bundle: 'yes' })),
        DEFAULT_DOWNLOAD_CHOICES,
    );

    for (const raw of [null, '', '{not json', '"csv"', 'null']) {
        assert.deepEqual(parseDownloadChoices(raw), DEFAULT_DOWNLOAD_CHOICES, String(raw));
    }
});

test('mintColumns posts only the remembered extras this answer offers, as tokens', () => {
    // observationAbout_iso3 came from another answer; financingRecipient_label
    // is unavailable here.
    const remembered = [
        'observationAbout_iso3',
        'financingRecipient_label',
        'financingRecipient_iso3',
        'financingProvider_iso3',
    ];

    assert.deepEqual(mintColumns(remembered, flowOptions), [
        'financingProvider_iso3',
        'financingRecipient_iso3',
    ]);
    assert.equal(mintColumns(['observationAbout_iso3'], flowOptions), undefined);
    assert.equal(mintColumns(remembered, null), undefined);
});

test('resolveChoices keeps a remembered format only where the answer renders it', () => {
    const remembered = { format: 'xlsx' as const, bundle: true, enrichment: [] };
    // Over Excel's row limit, with the bundle switched off for the deployment.
    const large = outputOptions({
        formats: [
            { name: 'csv', state: 'available' },
            { name: 'xlsx', state: 'unavailable' },
            { name: 'parquet', state: 'available' },
        ],
        bundle: { state: 'unavailable' },
    });

    const narrowed = resolveChoices(remembered, large);

    assert.deepEqual(
        [narrowed.formats.map((entry) => entry.id), narrowed.format, narrowed.bundle],
        [['csv', 'parquet'], 'csv', false],
    );

    const unanswered = resolveChoices(remembered, null);

    assert.deepEqual([unanswered.format, unanswered.bundle], ['xlsx', true]);
});

test('choicesNeedOptions waits for the options document only when a choice depends on it', () => {
    assert.equal(choicesNeedOptions(DEFAULT_DOWNLOAD_CHOICES), false);
    assert.equal(choicesNeedOptions({ ...DEFAULT_DOWNLOAD_CHOICES, format: 'xlsx' }), true);
    assert.equal(choicesNeedOptions({ ...DEFAULT_DOWNLOAD_CHOICES, enrichment: ['a_iso3'] }), true);
});

test('enrichmentGroups heads each role column with the role the answer gives it', () => {
    const groups = enrichmentGroups({ options: flowOptions, dimensions: flowDimensions });

    assert.deepEqual(
        groups.map((group) => [group.heading, group.entries.map((entry) => entry.token)]),
        [
            ['Provider', ['financingProvider_iso3', 'financingProvider_type']],
            ['Recipient', ['financingRecipient_iso3']],
        ],
    );
});

test.describe('enrichmentGroups heading for a column without a flow axis', () => {
    const cases: [string, string, { role: string; entity_type: string }[] | undefined, string][] = [
        [
            'the bound entity type',
            'observationAbout',
            [{ role: 'observationAbout', entity_type: 'Country' }],
            'Country',
        ],
        ['Place when nothing is bound', 'observationAbout', undefined, 'Place'],
        ['the readable column name', 'financingChannel', undefined, 'Financing channel'],
    ];

    for (const [name, column, entities, heading] of cases) {
        test(name, () => {
            const [group] = enrichmentGroups({
                options: outputOptions({ enrichments: [enrichment(column, 'iso3')] }),
                dimensions: [{ label: column, count: 1 }],
                entities,
            });

            assert.equal(group?.heading, heading);
        });
    }
});

test.describe('an extra column reads as a plain name and an example from the answer', () => {
    // ODA to Mozambique from Official donors and France: the first provider has
    // no country code, the second has.
    const bound = [
        { ref: 'country/MOZ', label: 'Mozambique', role: 'destination', entity_type: 'Country' },
        { ref: 'dc/official', label: 'Official donors', role: 'origin', entity_type: null },
        { ref: 'country/FRA', label: 'France', role: 'origin', entity_type: 'Country' },
    ];
    const cases: [string, DatasetEnrichment, BoundEntity[], string | null][] = [
        [
            "the recipient's bound country code",
            enrichment('financingRecipient', 'iso3'),
            bound,
            'MOZ, for example',
        ],
        [
            'the first bound provider that has a code',
            enrichment('financingProvider', 'iso3'),
            bound,
            'FRA, for example',
        ],
        ['no example for an open role', enrichment('financingProvider', 'iso3'), [], null],
        [
            'no example where the answer holds no value, and the blanks in words',
            enrichment('financingRecipient', 'iso2', 'partial', { entities: 45, covered: 36 }),
            bound,
            'blank for the 9 recipients that are not countries',
        ],
        [
            'one blank',
            enrichment('financingRecipient', 'iso3', 'partial', { entities: 45, covered: 44 }),
            bound,
            'MOZ, for example; blank for the 1 recipient that is not a country',
        ],
        [
            'a partial field that is not a country code',
            enrichment('financingProvider', 'type', 'partial', { entities: 45, covered: 40 }),
            bound,
            'Country, for example; blank for the 5 providers',
        ],
        [
            'a field with no words of its own',
            enrichment('financingProvider', 'incomeGroup'),
            bound,
            null,
        ],
    ];

    for (const [name, entry, entities, detail] of cases) {
        test(name, () => {
            const [group] = enrichmentGroups({
                options: outputOptions({ enrichments: [entry] }),
                dimensions: flowDimensions,
                entities,
            });

            assert.equal(group?.entries[0]?.detail, detail);
        });
    }

    test('names read in plain words', () => {
        const [group] = enrichmentGroups({
            options: outputOptions({
                enrichments: ['iso3', 'iso2', 'label', 'type', 'incomeGroup'].map((field) =>
                    enrichment('financingProvider', field),
                ),
            }),
            dimensions: flowDimensions,
        });

        assert.deepEqual(
            group?.entries.map((entry) => entry.name),
            ['ISO 3-letter code', 'ISO 2-letter code', 'Name', 'Type', 'Income group'],
        );
    });

    test('a partial field on a column with no noun counts what it leaves blank', () => {
        const [group] = enrichmentGroups({
            options: outputOptions({
                enrichments: [
                    enrichment('financingChannel', 'type', 'partial', {
                        entities: 12,
                        covered: 10,
                    }),
                ],
            }),
        });

        assert.equal(group?.entries[0]?.detail, 'blank for 2 of 12');
    });
});

test('the extras list leaves out every enrichment flagged in_long_layout', () => {
    const flagged = (column: string, field: string, inLongLayout: boolean) => ({
        ...enrichment(column, field),
        in_long_layout: inLongLayout,
    });
    const options = outputOptions({
        enrichments: [
            flagged('financingProvider', 'label', true),
            flagged('financingProvider', 'party_kind', true),
            flagged('financingProvider', 'party_class', true),
            flagged('financingProvider', 'party_whole', true),
            flagged('financingProvider', 'iso3', false),
            flagged('financingRecipient', 'label', true),
            flagged('financingRecipient', 'iso3', false),
        ],
        // The flag decides alone, so a default listing iso3 does not hide it,
        // and the in-file note reads the same flags.
        long_layout_defaults: ['financingProvider_iso3'],
    });
    const groups = enrichmentGroups({ options, dimensions: flowDimensions });

    assert.deepEqual(
        groups.flatMap((group) => group.entries.map((entry) => entry.token)),
        ['financingProvider_iso3', 'financingRecipient_iso3'],
    );
    assert.equal(
        inFileNote(groups),
        'The file already names each provider and recipient, and says what kind each provider is, such as official, private or a total.',
    );
});

test('without the flag, the extras list leaves out a long_layout_defaults token', () => {
    const options = outputOptions({
        enrichments: [
            enrichment('financingRecipient', 'label'),
            enrichment('financingRecipient', 'iso3'),
        ],
        long_layout_defaults: ['financingRecipient_label', 'financingRecipient_kind'],
    });
    const tokens = (groups: ReturnType<typeof enrichmentGroups>) =>
        groups.flatMap((group) => group.entries.map((entry) => entry.token));

    assert.deepEqual(tokens(enrichmentGroups({ options, dimensions: flowDimensions })), [
        'financingRecipient_iso3',
    ]);
    assert.deepEqual(
        mintColumns(['financingRecipient_label', 'financingRecipient_iso3'], options),
        ['financingRecipient_iso3'],
    );
    // A long layout that writes no defaults offers everything it lists.
    assert.deepEqual(
        tokens(enrichmentGroups({ options: { ...options, long_layout_defaults: [] } })),
        ['financingRecipient_label', 'financingRecipient_iso3'],
    );
});

test('inFileNote names the roles whose names and kinds the long layout writes', () => {
    const options = outputOptions({
        enrichments: [
            enrichment('financingProvider', 'iso3'),
            enrichment('financingRecipient', 'iso3'),
        ],
        long_layout_defaults: [
            'financingProvider_label',
            'financingProvider_kind',
            'financingRecipient_label',
            'financingRecipient_kind',
        ],
    });

    assert.equal(
        inFileNote(enrichmentGroups({ options, dimensions: flowDimensions })),
        'The file already names each provider and recipient, and says what kind each provider is, such as official, private or a total, and what kind each recipient is, such as a country or organisation, private or a total.',
    );
    // A role column with no known axis reads the kinds both sides share.
    assert.equal(
        inFileNote(
            enrichmentGroups({
                options: {
                    ...options,
                    long_layout_defaults: ['financingProvider_label', 'financingProvider_kind'],
                },
            }),
        ),
        'The file already names each financing provider and says what kind each is, such as private or a total.',
    );
    assert.equal(
        inFileNote(
            enrichmentGroups({
                options: { ...options, long_layout_defaults: ['financingRecipient_label'] },
                dimensions: flowDimensions,
            }),
        ),
        'The file already names each recipient.',
    );
    assert.equal(
        inFileNote(
            enrichmentGroups({
                options: {
                    ...options,
                    long_layout_defaults: [
                        'financingProvider_label',
                        'financingRecipient_label',
                        'financingRecipient_kind',
                    ],
                },
                dimensions: flowDimensions,
            }),
        ),
        'The file already names each provider and recipient, and says what kind each recipient is, such as a country or organisation, private or a total.',
    );
    assert.equal(
        inFileNote(enrichmentGroups({ options: { ...options, long_layout_defaults: [] } })),
        null,
    );
});

test("the group heading and the in-file note name a role with the answer's one word", () => {
    // A debt answer: its recipient column is the debtor side.
    const groups = enrichmentGroups({
        options: outputOptions({
            enrichments: [enrichment('financingRecipient', 'iso3')],
            long_layout_defaults: ['financingRecipient_label'],
        }),
        dimensions: [
            {
                label: 'financingRecipient',
                count: 1,
                axis: 'destination',
                noun: { singular: 'debtor', plural: 'debtors' },
            },
        ],
    });

    assert.deepEqual(
        [groups[0]?.heading, inFileNote(groups)],
        ['Debtor', 'The file already names each debtor.'],
    );
});

test.describe('totalsNote says where the totals of the roles in long_layout_totals go', () => {
    const base = { dimensions: flowDimensions, bundleOffered: true };
    const withTotals = outputOptions({ long_layout_totals: ['financingRecipient'] });
    const cases: [string, Parameters<typeof totalsNote>[0], RegExp | null][] = [
        [
            'a bundle',
            { ...base, options: withTotals, format: 'csv', bundle: true },
            /^Any recipient totals.*second CSV file in the download/,
        ],
        [
            'an Excel file',
            { ...base, options: withTotals, format: 'xlsx', bundle: true },
            /^Any recipient totals.*second sheet/,
        ],
        [
            'a bare CSV',
            { ...base, options: withTotals, format: 'csv', bundle: false },
            /^Any recipient totals.*left out of the file.*Tick README/,
        ],
        ['Parquet', { ...base, options: withTotals, format: 'parquet', bundle: true }, null],
        [
            'no role set apart',
            {
                ...base,
                options: outputOptions({ long_layout_totals: [] }),
                format: 'csv',
                bundle: true,
            },
            null,
        ],
    ];

    for (const [name, input, expected] of cases) {
        test(name, () => {
            const note = totalsNote(input);

            if (expected) {
                assert.match(note ?? '', expected);
            } else {
                assert.equal(note, null);
            }
        });
    }
});
