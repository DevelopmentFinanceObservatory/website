import assert from 'node:assert/strict';
import test from 'node:test';

import { sourceDataset } from '../dataset.ts';
import type { SourceDoc } from '../graph.ts';

type Fields = {
    details: Partial<SourceDoc['details']>;
    license?: Partial<SourceDoc['license']>;
    scope_and_units?: Partial<SourceDoc['scope_and_units']>;
};

// A documentation answer as the graph serves it, every member the fixture
// leaves out empty.
const docOf = ({ details, license, scope_and_units }: Fields): SourceDoc => ({
    details: {
        name_of_source: null,
        publisher: null,
        source: null,
        data_commons: null,
        description: null,
        source_url: null,
        source_data_url: null,
        citation: null,
        ...details,
    },
    license: {
        type: null,
        url: null,
        update_cadence: null,
        last_update: null,
        next_expected_update: null,
        ...license,
    },
    scope_and_units: {
        countries: [],
        years_covered: null,
        granularity: null,
        currencies: [],
        ...scope_and_units,
    },
    methodology: { description: null },
    data_notes: [],
    usage: { api_access: null, python: null },
    transformation_log: [],
    version_history: [],
    gaps: [],
    document_errors: [],
});

const IDS_DESCRIPTION =
    "International Debt Statistics (IDS) is the World Bank's annual dataset on the external debt of low- and middle-income countries. It reports debt stocks, disbursements, debt service and projected repayments by borrower and creditor type, with public and publicly guaranteed debt broken down by creditor, from 1970 onwards.";

// The World Bank's IDS as the graph documents it: every member the block reads.
const IDS = docOf({
    details: {
        name_of_source: 'World Bank International Debt Statistics (IDS)',
        publisher: 'World Bank',
        source: { ref: 'dc/s/WorldBank', label: 'World Bank' },
        data_commons: { id: 'dfo', label: 'Development Finance Observatory' },
        description: IDS_DESCRIPTION,
        source_url:
            'https://datacatalog.worldbank.org/search/dataset/0038015/international-debt-statistics',
        source_data_url:
            'https://datacatalogfiles.worldbank.org/ddh-published/0038015/DR0092201/A_D.xlsx,https://datacatalogfiles.worldbank.org/ddh-published/0038015/DR0092202/E_K.xlsx',
        citation:
            'International Debt Statistics by the World Bank, https://datacatalog.worldbank.org/search/dataset/0038015/international-debt-statistics, licensed under CC BY 4.0. Modified by The ONE Campaign.',
    },
    license: {
        type: 'Creative Commons Attribution License',
        url: 'https://datacatalog.worldbank.org/public-licenses?fragment=cc',
        update_cadence: 'Annual',
        last_update: '2026-11-12',
        next_expected_update: '2026-12',
    },
    scope_and_units: {
        years_covered: '1970-2033',
        granularity: 'Annual, by provider and recipient',
        currencies: ['USD'],
    },
});

const dataset = (doc: SourceDoc, dcid = 'dc/d/Test') =>
    JSON.parse(JSON.stringify(sourceDataset(dcid, doc)));

test('sourceDataset describes a fully documented source with its publisher as creator', () => {
    assert.deepEqual(dataset(IDS, 'provenance/WorldBankInternationalDebtStatistics'), {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'World Bank International Debt Statistics (IDS)',
        description: IDS_DESCRIPTION,
        url: 'https://developmentfinance.org/data/sources/provenance/WorldBankInternationalDebtStatistics',
        sameAs: 'https://datacatalog.worldbank.org/search/dataset/0038015/international-debt-statistics',
        creator: { '@type': 'Organization', name: 'World Bank' },
        publisher: { '@type': 'Organization', name: 'World Bank' },
        citation:
            'International Debt Statistics by the World Bank, https://datacatalog.worldbank.org/search/dataset/0038015/international-debt-statistics, licensed under CC BY 4.0. Modified by The ONE Campaign.',
        license: 'https://datacatalog.worldbank.org/public-licenses?fragment=cc',
        dateModified: '2026-11-12',
        temporalCoverage: '1970/2033',
        includedInDataCatalog: {
            '@type': 'DataCatalog',
            name: 'Development Finance Observatory data sources',
            url: 'https://developmentfinance.org/data/sources',
            publisher: {
                '@type': 'Organization',
                name: 'Development Finance Observatory',
                url: 'https://developmentfinance.org',
            },
        },
        distribution: [
            {
                '@type': 'DataDownload',
                contentUrl:
                    'https://datacatalogfiles.worldbank.org/ddh-published/0038015/DR0092201/A_D.xlsx',
            },
            {
                '@type': 'DataDownload',
                contentUrl:
                    'https://datacatalogfiles.worldbank.org/ddh-published/0038015/DR0092202/E_K.xlsx',
            },
        ],
    });
});

test('sourceDataset gives the page URL the sitemap lists, without a dcid: prefix', () => {
    for (const dcid of [
        'dc/d/WorldBank_WorldDevelopmentIndicators',
        'dcid:dc/d/WorldBank_WorldDevelopmentIndicators',
    ]) {
        assert.equal(
            dataset(IDS, dcid).url,
            'https://developmentfinance.org/data/sources/dc/d/WorldBank_WorldDevelopmentIndicators',
            dcid,
        );
    }
});

test('sourceDataset gives no block for a document without a name', () => {
    assert.equal(sourceDataset('dc/d/Test', docOf({ details: { name_of_source: '  ' } })), null);
    assert.equal(sourceDataset('dc/d/Test', docOf({ details: { publisher: 'World Bank' } })), null);
});

test('sourceDataset leaves out every property a thin document does not state', () => {
    // A UN System agency as the graph documents it: a name, a publisher and a page.
    const unicef = docOf({
        details: {
            name_of_source: "United Nations Children's Fund (UNICEF)",
            publisher: 'United Nations',
            source: { ref: 'undata/p/UNICEF', label: "United Nations Children's Fund (UNICEF)" },
            source_url: 'https://data.unicef.org/',
        },
    });

    assert.deepEqual(Object.keys(dataset(unicef)).toSorted(), [
        '@context',
        '@type',
        'creator',
        'description',
        'includedInDataCatalog',
        'name',
        'publisher',
        'sameAs',
        'url',
    ]);
    assert.equal(dataset(unicef).creator.name, "United Nations Children's Fund (UNICEF)");
    assert.doesNotMatch(dataset(unicef).description, /published by/);

    const bare = dataset(docOf({ details: { name_of_source: 'UN Geodata' } }));

    assert.equal(bare.creator, undefined);
    assert.ok(bare.description.length >= 50, bare.description);
});

test('sourceDataset builds a description from the name, publisher and years for a short one', () => {
    const france = dataset(
        docOf({
            details: {
                name_of_source: 'France Demographics',
                publisher: 'National Institute of Statistics and Economic Studies, France',
                description: 'Population data for France from INSEE',
            },
            scope_and_units: { years_covered: '1968-2024' },
        }),
    );

    assert.ok(france.description.length >= 50 && france.description.length <= 5_000);
    assert.match(france.description, /^France Demographics\b/);
    assert.match(france.description, /National Institute of Statistics and Economic Studies/);
    assert.match(france.description, /1968-2024/);
    assert.match(france.description, /Population data for France from INSEE/);
});

test('sourceDataset clips a long description to 5,000 characters', () => {
    const long = dataset(
        docOf({ details: { name_of_source: 'A', description: 'word '.repeat(2_000) } }),
    );

    assert.ok(long.description.length <= 5_000);
});

test('sourceDataset maps the stated licence', () => {
    const cases: [Partial<SourceDoc['license']>, unknown][] = [
        // A URL wins over the licence's name.
        [
            { type: 'INSEE Open License', url: 'https://www.insee.fr/fr/information/2381863' },
            'https://www.insee.fr/fr/information/2381863',
        ],
        // A name without a URL is a named work.
        [{ type: 'PublicDomain' }, { '@type': 'CreativeWork', name: 'PublicDomain' }],
        // The graph lists two licences in one field.
        [
            {
                url: 'https://www.oecd.org/en/about/terms-conditions.html,https://www.imf.org/external/terms.htm',
            },
            [
                'https://www.oecd.org/en/about/terms-conditions.html',
                'https://www.imf.org/external/terms.htm',
            ],
        ],
        [{ type: 'Not stated' }, undefined],
        [
            { type: 'Terms of use', url: 'ftp://example.org/terms' },
            { '@type': 'CreativeWork', name: 'Terms of use' },
        ],
        [{}, undefined],
    ];

    for (const [license, expected] of cases) {
        assert.deepEqual(
            dataset(docOf({ details: { name_of_source: 'A' }, license })).license,
            expected,
            JSON.stringify(license),
        );
    }
});

test('sourceDataset keeps a comma inside a data URL and drops one that is not http or is the source page', () => {
    const sdmx =
        'https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,/Q.....B1GQ......G1.?dimensionAtObservation=AllDimensions';
    const oecd = dataset(docOf({ details: { name_of_source: 'OECD GDP', source_data_url: sdmx } }));

    assert.deepEqual(
        oecd.distribution.map(({ contentUrl }: { contentUrl: string }) => contentUrl),
        [new URL(sdmx).href],
    );

    const local = dataset(
        docOf({
            details: {
                name_of_source: 'A',
                source_data_url: 'gs://bucket/a.csv',
                source_url: 'www.example.org',
            },
        }),
    );

    assert.equal(local.distribution, undefined);
    assert.equal(local.sameAs, undefined);

    const page = 'https://www.insee.fr/en/statistiques/8333211?sommaire=8333329';
    const france = dataset(
        docOf({ details: { name_of_source: 'A', source_url: page, source_data_url: page } }),
    );

    assert.equal(france.sameAs, page);
    assert.equal(france.distribution, undefined);
});

test('sourceDataset states dates and places only in forms schema.org reads', () => {
    const cases: [Fields, Record<string, unknown>][] = [
        [
            {
                details: {},
                license: { last_update: '2026-10-12T15:27:14Z' },
                scope_and_units: { years_covered: '2021' },
            },
            { dateModified: '2026-10-12T15:27:14Z', temporalCoverage: '2021' },
        ],
        [
            {
                details: {},
                license: { last_update: 'October 2026' },
                scope_and_units: { years_covered: 'since the 1970s' },
            },
            { dateModified: undefined, temporalCoverage: undefined },
        ],
        [{ details: {}, license: { last_update: '2026-13-45' } }, { dateModified: undefined }],
        [{ details: {}, license: { last_update: '2026-02-30' } }, { dateModified: undefined }],
        [{ details: {}, license: { last_update: '2024-02-29' } }, { dateModified: '2024-02-29' }],
        [
            { details: {}, scope_and_units: { countries: ['Kenya', 'Uganda'] } },
            {
                spatialCoverage: [
                    { '@type': 'Place', name: 'Kenya' },
                    { '@type': 'Place', name: 'Uganda' },
                ],
            },
        ],
    ];

    for (const [fields, expected] of cases) {
        const block = dataset(docOf({ ...fields, details: { name_of_source: 'A' } }));

        for (const [key, value] of Object.entries(expected)) {
            assert.deepEqual(block[key], value, `${key} of ${JSON.stringify(fields)}`);
        }
    }
});
