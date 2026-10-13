import assert from 'node:assert/strict';
import test from 'node:test';

import {
    choicesNeedOptions,
    coverageNote,
    DEFAULT_DOWNLOAD_CHOICES,
    enrichmentGroups,
    enrichmentLabel,
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
    coverage?: { entities: number; covered: number },
): DatasetEnrichment => ({ column, field, token: `${column}_${field}`, state, coverage });

// A flow answer's options: its frame columns, and extras on both role columns
// (the recipient side partial), as the options door for "Humanitarian aid
// from Germany" answers them.
const flowOptions: DatasetOutputOptions = {
    columns: [
        { name: 'stat_var' },
        { name: 'financingProvider' },
        { name: 'financingRecipient' },
        { name: 'time_period' },
        { name: 'value' },
    ],
    enrichments: [
        enrichment('financingProvider', 'iso3'),
        enrichment('financingProvider', 'type'),
        enrichment('financingRecipient', 'iso3', 'partial', { entities: 145, covered: 125 }),
        enrichment('financingRecipient', 'label', 'unavailable'),
    ],
};

const flowDimensions = [
    { label: 'financingProvider', count: 1, axis: 'origin' as const },
    { label: 'financingRecipient', count: 145, axis: 'destination' as const },
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
    const large: DatasetOutputOptions = {
        formats: [
            { name: 'csv', state: 'available' },
            { name: 'xlsx', state: 'unavailable' },
            { name: 'parquet', state: 'available' },
        ],
        bundle: { state: 'unavailable' },
    };

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
                options: { enrichments: [enrichment(column, 'iso3')] },
                dimensions: [{ label: column, count: 1 }],
                entities,
            });

            assert.equal(group?.heading, heading);
        });
    }
});

test('enrichment rows read their field in words and a partial one its coverage', () => {
    assert.equal(enrichmentLabel(enrichment('a', 'type')), 'Entity types');
    assert.equal(enrichmentLabel(enrichment('a', 'incomeGroup')), 'Income group');
    assert.equal(
        coverageNote(enrichment('a', 'iso3', 'partial', { entities: 132, covered: 118 })),
        '118 of 132',
    );
    assert.equal(coverageNote(enrichment('a', 'iso3')), null);
});

test('the extras list leaves out a column the long layout already writes', () => {
    const options: DatasetOutputOptions = {
        enrichments: [
            enrichment('financingRecipient', 'party_kind'),
            enrichment('financingRecipient', 'iso3'),
        ],
        long_layout_defaults: ['financingRecipient_label', 'financingRecipient_party_kind'],
    };

    assert.deepEqual(
        enrichmentGroups({ options, dimensions: flowDimensions }).flatMap((group) =>
            group.entries.map((entry) => entry.token),
        ),
        ['financingRecipient_iso3'],
    );
    assert.deepEqual(
        mintColumns(['financingRecipient_party_kind', 'financingRecipient_iso3'], options),
        ['financingRecipient_iso3'],
    );
    // An API that predates the field offers everything it lists.
    assert.equal(
        enrichmentGroups({ options: { ...options, long_layout_defaults: undefined } })[0]?.entries
            .length,
        2,
    );
});

test.describe('totalsNote says where the totals of the roles in long_layout_totals go', () => {
    const base = { dimensions: flowDimensions, bundleOffered: true };
    const withTotals: DatasetOutputOptions = { long_layout_totals: ['financingRecipient'] };
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
            { ...base, options: { long_layout_totals: [] }, format: 'csv', bundle: true },
            null,
        ],
        ['an older API', { ...base, options: {}, format: 'csv', bundle: true }, null],
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
