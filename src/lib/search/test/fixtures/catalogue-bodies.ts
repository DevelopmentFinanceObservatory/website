/**
 * `GET /api/search/catalogue` bodies, written to the API's `CatalogueResponse`
 * model (dfo-apis `src/search/catalogue/response.py`) and checked against it
 * by scripts/check-search-fixtures.ts. The whole catalogue counts countries,
 * indicators and datasets; one country's counts variables in their place, and either may carry
 * `aid.years: null` when the build holds no CRS rows.
 */

const HUMANITARIAN =
    'Amount_FinancialFlow_Gross_Disbursement_CRSTypeOfFlow10_CRSTypeOfFinance110_CRSPurposeCode72010_Nominal';

export const wholeCatalogueBody = {
    catalogue_version: '2026-09-30T12:00:00Z-3f9c2a1b',
    counts: {
        publishers: 40,
        countries: 205,
        indicators: 112866,
        datasets: 90,
        aid: { donors: 169, recipients: 205, years: { first: 1973, last: 2024 } },
    },
    examples: [
        {
            text: 'Humanitarian aid to Ethiopia',
            template: 'Humanitarian aid to {place}',
            stat_var: HUMANITARIAN,
            place: 'country/ETH',
        },
        {
            text: 'Humanitarian aid from Germany',
            template: 'Humanitarian aid from {place}',
            stat_var: HUMANITARIAN,
            place: 'country/DEU',
        },
        {
            text: 'Population of Kenya',
            template: 'Population of {place}',
            stat_var: 'Count_Person',
            place: 'country/KEN',
        },
    ],
};

export const wholeCatalogueNoAidYearsBody = {
    ...wholeCatalogueBody,
    counts: {
        ...wholeCatalogueBody.counts,
        aid: { donors: 0, recipients: 0, years: null },
    },
};

export const placeCatalogueKenyaBody = {
    catalogue_version: '2026-09-30T12:00:00Z-3f9c2a1b',
    counts: {
        publishers: 12,
        variables: 900,
        aid: { donors: 41, recipients: 0, years: { first: 1973, last: 2024 } },
    },
    examples: [
        {
            text: 'Humanitarian aid to Kenya',
            template: 'Humanitarian aid to {place}',
            stat_var: HUMANITARIAN,
            place: 'country/KEN',
        },
        {
            text: 'Population of Kenya',
            template: 'Population of {place}',
            stat_var: 'Count_Person',
            place: 'country/KEN',
        },
    ],
};

export const catalogueBodies: Record<string, unknown> = {
    'catalogue-whole': wholeCatalogueBody,
    'catalogue-whole-no-aid-years': wholeCatalogueNoAidYearsBody,
    'catalogue-place-kenya': placeCatalogueKenyaBody,
};
