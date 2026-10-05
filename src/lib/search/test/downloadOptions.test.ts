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

test('mintColumns posts only the remembered extras this answer offers, after its frame', () => {
    // observationAbout_iso3 came from another answer; financingRecipient_label
    // is unavailable here.
    const remembered = [
        'observationAbout_iso3',
        'financingRecipient_label',
        'financingRecipient_iso3',
        'financingProvider_iso3',
    ];

    assert.deepEqual(mintColumns(remembered, flowOptions), [
        'stat_var',
        'financingProvider',
        'financingRecipient',
        'time_period',
        'value',
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
            ['Donor', ['financingProvider_iso3', 'financingProvider_type']],
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
