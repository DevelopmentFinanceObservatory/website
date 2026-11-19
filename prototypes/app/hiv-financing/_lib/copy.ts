// The page's words that carry a figure or a rule: the lede and the lines under it, the
// summary sentence for all countries or for one, the notes under the chart, the strip and
// the table, and the sources they cite.
import type { Country, HivData, OtherProvider } from '../_data/types.ts';

import {
    deathCount,
    listOf,
    money,
    pct,
    people,
    percent,
    perPerson,
    roundDeaths,
    wholePercents,
} from './format.ts';
import { PROVIDERS } from './providers.ts';
import { perPersonPoints, STRIP_MIN_PLHIV } from './strip.ts';
import {
    aidPerPerson,
    lastAid,
    lastShares,
    lastTotal,
    lastYear,
    ledeFigures,
    PER_PERSON_MIN_PLHIV,
    withoutPlhiv,
} from './summary.ts';

/** A cited web page; `date` is null for an undated page, and `detail` names what the page
 *  takes from it. */
export type Source = {
    publisher: string;
    title: string;
    date: string | null;
    url: string;
    detail?: string;
};

/** The data sources the page's figures come from, listed first under Sources. */
export const DATA_SOURCES: readonly Source[] = [
    {
        publisher: 'OECD',
        title: 'Creditor Reporting System',
        date: null,
        url: 'https://developmentfinance.org/data/sources/provenance/OECDCreditorReportingSystem',
        detail: 'purpose codes 13040, 12110, and 12250',
    },
    {
        publisher: 'UNAIDS',
        title: 'AIDSinfo',
        date: null,
        url: 'https://aidsinfo.unaids.org',
        detail: 'people living with HIV, antiretroviral therapy coverage, and AIDS-related deaths',
    },
];

/** The sources behind the fixed figures in this module. */
export const SOURCES = {
    kff2025: {
        publisher: 'KFF and UNAIDS',
        title: 'Donor Government Funding for HIV in Low- and Middle-Income Countries in 2025',
        date: '27 July 2026',
        url: 'https://www.kff.org/global-health-policy/donor-government-funding-for-hiv-in-low-and-middle-income-countries-in-2025/',
    },
    unaids2026: {
        publisher: 'UNAIDS',
        title: 'A perilous moment for the response to HIV warns UNAIDS',
        date: '12 June 2026',
        url: 'https://unaids.org/en/resources/presscentre/pressreleaseandstatementarchive/2026/june/20260612_PR_global_aids_brief',
    },
    globalFundHiv: {
        publisher: 'The Global Fund',
        title: 'HIV and AIDS',
        date: null,
        url: 'https://www.theglobalfund.org/en/hivaids/',
    },
    globalFundUsCap: {
        publisher: 'The Global Fund',
        title: 'President Biden Signals a $6 billion U.S. Pledge for the Seventh Replenishment',
        date: '28 March 2022',
        url: 'https://www.theglobalfund.org/en/news/2022/2022-03-28-president-biden-signals-a-6-billion-pledge-for-the-seventh-replenishment/',
    },
} as const satisfies Record<string, Source>;

/** The line under the lede on where the Global Fund's money comes from. Source: `SOURCES.globalFundUsCap`. */
export const UNDER_LEDE =
    'Each provider is the government or agency that reported disbursing the aid to the country. The Global Fund reports as a provider in its own right, so money that governments and foundations give it counts as Global Fund aid. By US law, the United States may give at most a third of all contributions to the Global Fund.';

/** The scope note under the lede. Source: `SOURCES.unaids2026`. */
export const SCOPE_NOTE =
    'UNAIDS estimates that governments in low- and middle-income countries paid for 52% of their HIV responses in 2024. The figures here cover external aid only.';

/** The dated line under the chart on funding after the data end. Source: `SOURCES.kff2025`. */
export const FUNDING_2025 = {
    text: 'KFF reports donor-government HIV funding of $8.3bn in 2024 and $6.2bn in 2025.',
    source: SOURCES.kff2025,
} as const;

/** The How to interpret line on measures that give the US and the Global Fund lower shares.
 *  Sources: `SOURCES.globalFundHiv` and `SOURCES.kff2025`. */
export const OTHER_MEASURES = {
    text: 'Other measures give lower shares. The Global Fund says it provides 28% of all international financing for HIV programmes. KFF puts the United States at 74% of donor-government HIV funding in 2025, including the US contribution to the Global Fund.',
    sources: [SOURCES.globalFundHiv, SOURCES.kff2025],
} as const;

/** Why aid per person is a ratio, and when the page leaves it blank. */
export const PER_PERSON_NOTE = `Aid per person living with HIV divides a country's HIV aid by its number of people living with HIV. Because aid also pays for prevention, testing, and health systems, this ratio does not measure spending per patient. The ratio is blank where fewer than ${PER_PERSON_MIN_PLHIV.toLocaleString('en-GB')} people live with HIV, because small counts make it swing.`;

/** The caveat beside the strip's median. */
export const MEDIAN_CAVEAT =
    "The median is the middle country's ratio. It does not measure what a typical patient receives.";

/** The Notes line naming the countries kept in the table with no estimate of people living with HIV. */
export const plhivGapNote = (data: HivData): string => {
    const names = withoutPlhiv(data);
    const them = names.length === 1 ? 'it' : 'them';

    return names.length === 0
        ? "The Development Finance Observatory's UNAIDS data include an estimate of people living with HIV for every country in the table."
        : `Estimates of people living with HIV for ${listOf(names)} are missing from the Development Finance Observatory's UNAIDS data, so aid per person is blank for ${them} and the dot strip excludes ${them}.`;
};

/** The lede says "almost all" from this US and Global Fund share up; below it the lede throws. */
const ALMOST_ALL = 0.95;

export const ledeSentence = (data: HivData): string => {
    const { usGfShare, over1m, gfMajority, usMajority } = ledeFigures(data);

    if (usGfShare < ALMOST_ALL) {
        throw new Error(
            `The lede says "almost all", but the US and Global Fund share is ${pct(usGfShare)}`,
        );
    }

    return [
        `In ${lastYear(data)}, the United States and the Global Fund disbursed almost all HIV aid recorded for countries.`,
        `Of the ${over1m} countries that received more than $1m, the Global Fund disbursed more than half in ${gfMajority} and the United States in ${usMajority}.`,
    ].join(' ');
};

/**
 * The provider share the lede leaves out, for How to interpret: the US and Global Fund share of
 * HIV aid recorded for countries, and the US-majority countries that also received Global
 * Fund multi-disease grants under other codes.
 */
export const shareNote = (data: HivData): string => {
    const { usGfShare, usMajority, usMajorityGfMulti } = ledeFigures(data);

    return [
        `In these CRS figures, the United States and the Global Fund disbursed ${pct(usGfShare)} of the HIV aid official donors recorded for countries in ${lastYear(data)}.`,
        usMajorityGfMulti > 0
            ? `In ${usMajorityGfMulti} of the ${usMajority} countries where the United States disbursed more than half, the Global Fund also disbursed multi-disease grants under other codes.`
            : null,
    ]
        .filter((sentence) => sentence !== null)
        .join(' ');
};

/** How the page prints a provider's DFO label; a label not here prints as given. */
export const OTHER_PROVIDER_LABELS: Readonly<Record<string, string>> = {
    'International Development Association': 'World Bank IDA',
    'Joint United Nations Programme on HIV/AIDS': 'UNAIDS',
    'United Kingdom': 'the United Kingdom',
    'Asian Development Bank': 'the Asian Development Bank',
    Netherlands: 'the Netherlands',
};

/**
 * Facts the summary sentence attaches to a named provider, by DFO label. They cannot be
 * computed from first and last values, so they are fixed text, and `largestOtherFalls`
 * throws when a label here is missing from `HivData.otherProviders`.
 */
export const OTHER_PROVIDER_FACTS: Readonly<Record<string, string>> = {
    'International Development Association': 'which has lent about $2m a year since 2020',
    'Joint United Nations Programme on HIV/AIDS':
        'which reports most of its HIV money under another code',
};

/** How many providers the summary sentence names. */
export const OTHER_FALLS_NAMED = 5;

/** The providers whose money to countries fell most from the first year to the last,
 *  largest fall first, at most `count`, falls above 0 only. */
export const largestOtherFalls = (data: HivData, count = OTHER_FALLS_NAMED): OtherProvider[] => {
    for (const name of Object.keys(OTHER_PROVIDER_FACTS)) {
        if (!data.otherProviders.some((provider) => provider.name === name)) {
            throw new Error(`HivData.otherProviders has no "${name}"`);
        }
    }

    return data.otherProviders
        .filter((provider) => provider.first > provider.last)
        .toSorted((a, b) => b.first - b.last - (a.first - a.last) || a.name.localeCompare(b.name))
        .slice(0, count);
};

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** "Five providers account for $231m, or 78%, of that fall: World Bank IDA, ...". */
const fallSentence = (data: HivData): string | null => {
    const others = data.allocated.other;
    const fall = (others[0] ?? 0) - (others.at(-1) ?? 0);
    const named = largestOtherFalls(data);

    if (fall <= 0 || named.length === 0) {
        return null;
    }

    const part = named.reduce((sum, provider) => sum + provider.first - provider.last, 0);
    const items = named.map(({ name }) => {
        const label = OTHER_PROVIDER_LABELS[name] ?? name;
        const fact = OTHER_PROVIDER_FACTS[name];

        return fact === undefined ? label : `${label}, ${fact}`;
    });
    // Semicolons separate the items once one of them carries a comma.
    const list = items.some((item) => item.includes(','))
        ? `${items.slice(0, -1).join('; ')}; and ${items.at(-1) ?? ''}`
        : listOf(items);
    const subject = `${NUMBER_WORDS[named.length] ?? named.length} ${named.length === 1 ? 'provider accounts' : 'providers account'}`;
    // Where other providers rose, the named falls can exceed the net fall, and the sentence then gives no share.
    const share = part <= fall ? `, or ${pct(part / fall)},` : '';

    return `${subject} for ${money(part)}${share} of that fall: ${list}.`;
};

/** The table's countries that received some aid in the last year, which `data.recipients`
 *  counts; the table also lists countries with none. */
const tableRecipients = (data: HivData): Country[] =>
    data.countries.filter((country) => lastAid(country) > 0);

/** The summary sentence with no country selected. */
export const allSentence = (data: HivData): string => {
    const first = data.years[0] ?? 0;
    const last = lastYear(data);
    const others = data.allocated.other;

    return [
        `In ${last}, donors disbursed ${money(lastTotal(data.allocated))} in HIV aid to ${data.recipients} countries, ${tableRecipients(data).length} of them in the table.`,
        `Providers other than the United States and the Global Fund disbursed ${money(others.at(-1) ?? 0)} to countries in ${last}, against ${money(others[0] ?? 0)} in ${first}.`,
        fallSentence(data),
    ]
        .filter((sentence) => sentence !== null)
        .join(' ');
};

/** US bilateral HIV spending in 2024, from `SOURCES.kff2025`. */
const KFF_US_BILATERAL_2024 = '$5.4bn';

/** From this year US money to countries held in a narrow range. */
const US_STEADY_FROM = 2020;

/**
 * The note under the chart on money reported for regions or no country, which the chart
 * leaves out, and on the US total that runs above US government reports.
 */
export const unallocatedNote = (data: HivData): string => {
    const last = lastYear(data);
    const previous = data.years.at(-2) ?? last;
    const usAll = data.allocated.us.map(
        (value, index) => value + (data.unallocated.us[index] ?? 0),
    );
    const steady = data.allocated.us.filter(
        (_, index) => (data.years[index] ?? 0) >= US_STEADY_FROM,
    );
    const range =
        steady.length === 0
            ? null
            : `US disbursements to countries ranged from ${money(Math.min(...steady))} to ${money(Math.max(...steady))} a year from ${US_STEADY_FROM} to ${last}, with the remainder reported as regional or unallocated.`;

    return [
        `The chart excludes ${money(lastTotal(data.unallocated))} of ${last} HIV aid reported for regions or with no country specified.`,
        `Including those flows, total US disbursements under this code were ${money(usAll.at(-2) ?? 0)} in ${previous} and ${money(usAll.at(-1) ?? 0)} in ${last}.`,
        `KFF puts US bilateral HIV spending at ${KFF_US_BILATERAL_2024} in 2024.`,
        range,
    ]
        .filter((sentence) => sentence !== null)
        .join(' ');
};

/** A lender is named in the loans sentence from this share of the loans up. */
const LENDER_NAMED_SHARE = 0.05;

/** The How to interpret sentence on ODA loans inside code 13040; null with none. */
export const loansSentence = (data: HivData): string | null => {
    const { total, lenders } = data.loans;

    if (total <= 0) {
        return null;
    }

    const named = lenders.filter(({ value }) => value >= LENDER_NAMED_SHARE * total);
    const covered = named.reduce((sum, { value }) => sum + value, 0);
    const items = named.map(
        ({ name, value }) => `${OTHER_PROVIDER_LABELS[name] ?? name} (${money(value)})`,
    );
    // "from" when the named lenders make up the printed total, else "including".
    const from = money(covered) === money(total) ? 'from' : 'including';

    return `It also includes ${money(total)} in ODA loans to countries from ${data.years[0] ?? 0} to ${lastYear(data)}, ${from} ${listOf(items)}.`;
};

/** The strip's caption: how many countries it holds and the rule that picks them. */
export const stripCaption = (data: HivData): string => {
    const count = perPersonPoints(data.countries).length;

    return `${count} ${count === 1 ? 'country' : 'countries'} that received aid in ${lastYear(data)} and ${count === 1 ? 'has' : 'have'} at least ${STRIP_MIN_PLHIV.toLocaleString('en-GB')} people living with HIV`;
};

/** The line under the table's heading: the inclusion rule and the money outside the table. */
export const tableRule = (data: HivData): string => {
    const year = lastYear(data);
    const inTable = tableRecipients(data);
    const outside = data.recipients - inTable.length;
    const outsideMoney =
        lastTotal(data.allocated) - inTable.reduce((sum, country) => sum + lastAid(country), 0);
    const rule = `The table lists the ${data.countries.length} countries that received more than $1m in HIV aid in ${year} or have at least ${STRIP_MIN_PLHIV.toLocaleString('en-GB')} people living with HIV.`;

    return outside > 0
        ? `${rule} Another ${outside} ${outside === 1 ? 'country' : 'countries'} received ${money(outsideMoney)} in total.`
        : rule;
};

const mixClause = (country: Country): string | null => {
    const shares = lastShares(country.aid);
    const printed = wholePercents(shares);
    // The first item carries the verb: "66% came from the United States, 33% from ...".
    // Every provider with a share above 0 is named, as the table prints it ("<1%" for a small one).
    const named = PROVIDERS.filter(({ key }) => shares[key] > 0).map(
        ({ key, label }, index) =>
            `${printed[key]} ${index === 0 ? 'came from' : 'from'} ${key === 'other' ? 'all other providers' : `the ${label}`}`,
    );

    if (named.length === 0) {
        return null;
    }

    return `Of that, ${listOf(named)}.`;
};

/** Where the mix would show no Global Fund money under 13040 in the last year although the
 *  Global Fund gave multi-disease grants under other codes. */
const multiClause = (country: Country, year: number): string | null => {
    const multi = country.globalFundMulti.at(-1) ?? 0;

    return multi > 0 && (country.aid.globalFund.at(-1) ?? 0) === 0
        ? `The Global Fund disbursed ${money(multi)} in multi-disease grants to ${country.name} in ${year}, recorded under other codes and excluded from the HIV aid total.`
        : null;
};

const treatmentClause = (country: Country): string | null =>
    country.art === null || country.plhiv === null || country.plhiv === 0
        ? null
        : `${percent(country.art)} of the ${people(country.plhiv)} people living with HIV were on antiretroviral therapy.`;

const deathsClause = (country: Country, years: readonly number[]): string | null => {
    const first = country.deaths[0];
    const last = country.deaths.at(-1);

    if (first === null || first === undefined || last === null || last === undefined) {
        return null;
    }

    // The verb compares the figures as printed, so "held" appears only between two equal numbers.
    const [from, to] = [roundDeaths(first), roundDeaths(last)];
    const [start, end] = [years[0] ?? 0, lastYear({ years })];

    if (to === from) {
        return `AIDS-related deaths held at ${deathCount(last)} from ${start} to ${end}.`;
    }

    return `AIDS-related deaths ${to < from ? 'fell' : 'rose'} from ${deathCount(first)} in ${start} to ${deathCount(last)} in ${end}.`;
};

/** The summary sentence for one country. A clause whose data is missing is left out. */
export const countrySentence = (country: Country, years: readonly number[]): string => {
    const aid = lastAid(country);
    const year = lastYear({ years });
    const ratio = aidPerPerson(country);
    let opening: string;

    if (aid === 0) {
        opening = `In ${year}, ${country.name} received no HIV aid.`;
    } else if (ratio === null) {
        opening = `In ${year}, ${country.name} received ${money(aid)} in HIV aid.`;
    } else {
        opening = `In ${year}, ${country.name} received ${money(aid)} in HIV aid, or ${perPerson(ratio)} per person living with HIV.`;
    }

    return [
        opening,
        aid > 0 ? mixClause(country) : null,
        multiClause(country, year),
        treatmentClause(country),
        deathsClause(country, years),
    ]
        .filter((clause) => clause !== null)
        .join(' ');
};
