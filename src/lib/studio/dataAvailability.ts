/**
 * The landing's "What data is available?" overview: what the Observatory
 * holds, in the words Studio's agent gives when asked. Static copy: the
 * counts are the catalogue's at the time of writing and are updated here
 * when the catalogue grows.
 */

export type DataAvailabilityDataset = {
    name: string;
    summary: string;
};

export const DATA_AVAILABILITY_INTRO: readonly string[] = [
    'The Development Finance Observatory (DFO) brings together data on aid, external debt, and related economic, health, and social indicators into a single open platform.',
    'DFO holds 108,917 indicators across 92 datasets from 42 publishers, covering 246 countries. Its aid data covers 172 donors and 235 recipients from 1960 to 2025.',
];

export const DATA_AVAILABILITY_DATASETS: readonly DataAvailabilityDataset[] = [
    {
        name: 'OECD Creditor Reporting System (CRS)',
        summary:
            'Detailed aid activities by donor, recipient, sector, channel, and financial instrument.',
    },
    {
        name: 'World Bank International Debt Statistics (IDS)',
        summary:
            'External debt stocks, flows, and debt service for low- and middle-income countries, including scheduled future debt service.',
    },
    {
        name: 'IMF World Economic Outlook (WEO)',
        summary:
            'Macroeconomic measures including GDP (in national currencies, US dollars, and PPP), GDP per capita, savings, investment, and projections.',
    },
    {
        name: 'ONE Imputed Multilateral Sectors',
        summary:
            'Estimates tracing core contributions through multilateral organisations to specific sectors and recipients.',
    },
    {
        name: 'Development & Social Indicators',
        summary:
            "Datasets via Data Commons and the UN System Data Commons, such as the World Bank's World Development Indicators (WDI), the WHO Global Health Observatory, and the UN SDG Indicators Database.",
    },
];

/** The question "Ask a follow-up" opens a fresh canvas with: specific enough
 *  that the agent answers it outright rather than asking what is meant. */
export const DATA_AVAILABILITY_PROMPT =
    'What data is available in DFO? Give me an overview of the datasets, publishers, countries and years covered, so I can ask about what interests me.';
