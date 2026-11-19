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
    mixPercents,
} from './format.ts';
import { BREAK_YEAR } from './chart.ts';
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

/** A sentence or run of sentences, with the sources that back it. */
export type Cited = { text: string; sources?: readonly Source[] };

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
    kff2024: {
        publisher: 'KFF and UNAIDS',
        title: 'Donor Government Funding for HIV in Low- and Middle-Income Countries in 2024',
        date: '10 July 2025',
        url: 'https://www.kff.org/global-health-policy/donor-government-funding-for-hiv-in-low-and-middle-income-countries-in-2024/',
    },
    unaidsFactSheet2025: {
        publisher: 'UNAIDS',
        title: 'Fact sheet 2025: Global HIV statistics',
        date: '2025',
        url: 'https://www.unaids.org/sites/default/files/media_asset/UNAIDS_FactSheet_en.pdf',
    },
    unaidsSpecialReport2026: {
        publisher: 'UNAIDS',
        title: 'Global HIV response falters as reemergence looms',
        date: '27 July 2026',
        url: 'https://www.unaids.org/en/resources/presscentre/pressreleaseandstatementarchive/2026/july/20260727_PR_UNAIDS_special_report_AIDS2026',
    },
    unaidsGlobalAidsUpdate2025: {
        publisher: 'UNAIDS',
        title: 'Global AIDS Update 2025',
        date: '10 July 2025',
        url: 'https://www.unaids.org/en/resources/presscentre/pressreleaseandstatementarchive/2025/july/20250710_global-aids-update',
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

/** The How to interpret line on what a provider is and where the Global Fund's money comes from. */
export const PROVIDER_NOTE: Cited = {
    text: 'A provider is the government or agency that reported disbursing aid. Because the Global Fund reports as a provider, contributions from governments and foundations count as Global Fund aid. By law, the United States may give at most a third of all contributions to the Global Fund.',
    sources: [SOURCES.globalFundUsCap],
};

/** The How to interpret line on domestic money, which the data leave out. */
export const SCOPE_NOTE: Cited = {
    text: 'UNAIDS estimates that around 52% of the money available for HIV in low- and middle-income countries in 2024 came from domestic sources.',
    sources: [SOURCES.unaidsFactSheet2025],
};

/** The Notes item on funding in 2025, after the OECD data end. */
export const FUNDING_2025: Cited = {
    text: 'The OECD data end in 2024. KFF reports that donor-government HIV funding fell from $8.3bn in 2024 to $6.2bn in 2025, in current dollars, and UNAIDS that international HIV funding fell from $8.8bn to $7.3bn over the same years. Both count differently from the OECD.',
    sources: [SOURCES.kff2025, SOURCES.unaidsSpecialReport2026],
};

/** The How to interpret paragraph on how the shares here line up with other measures, whose
 *  totals are wider. */
export const otherMeasures = (data: HivData): Cited => {
    const last = lastYear(data);
    const countries = lastTotal(data.allocated);
    const elsewhere = lastTotal(data.unallocated);
    const all = countries + elsewhere;
    const gf = (data.allocated.globalFund.at(-1) ?? 0) + (data.unallocated.globalFund.at(-1) ?? 0);
    const usGf = (series: HivData['allocated']) =>
        (series.us.at(-1) ?? 0) + (series.globalFund.at(-1) ?? 0);
    const togetherHere = pct(usGf(data.allocated) / countries);
    const togetherAll = pct((usGf(data.allocated) + usGf(data.unallocated)) / all);
    const mostlyUs =
        (data.unallocated.us.at(-1) ?? 0) > elsewhere / 2 ? ', mostly from the United States' : '';
    const wider =
        elsewhere > 0
            ? `Including the ${money(elsewhere)} reported for regions or no country${mostlyUs}, its share is ${pct(gf / all)}, and the two together ${togetherAll === togetherHere ? 'still ' : ''}disbursed ${togetherAll}.`
            : null;

    return {
        text: [
            'Shares depend on the total.',
            `Here the Global Fund disbursed ${pct((data.allocated.globalFund.at(-1) ?? 0) / countries)} of HIV aid recorded for countries in ${last}.`,
            wider,
            'The Global Fund puts its own share of all international financing for HIV programmes at 28%.',
            'KFF credits Global Fund money to the governments that fund it, which puts the United States at 80% of donor-government HIV funding in 2024 and 74% in 2025.',
        ]
            .filter((sentence) => sentence !== null)
            .join(' '),
        sources: [SOURCES.globalFundHiv, SOURCES.kff2024, SOURCES.kff2025],
    };
};

/** Why aid per person is a ratio, and when the page leaves it blank. */
export const PER_PERSON_NOTE: Cited = {
    text: `Aid per person living with HIV is a ratio, not spending per patient. Aid also funds prevention, testing, and health systems. Because the ratio excludes domestic spending, it reads low where governments pay most of the cost. South Africa funds 77% of its AIDS response. The ratio is blank below ${PER_PERSON_MIN_PLHIV.toLocaleString('en-GB')} people living with HIV, where small counts make it swing.`,
    sources: [SOURCES.unaidsGlobalAidsUpdate2025],
};

/** The caveat beside the strip's median. */
export const MEDIAN_CAVEAT = "The middle country's ratio, not spending per patient.";

/** The Notes line naming the countries kept in the table with no estimate of people living with HIV. */
export const plhivGapNote = (data: HivData): string => {
    const names = withoutPlhiv(data);
    const them = names.length === 1 ? 'it' : 'them';

    return names.length === 0
        ? 'The UNAIDS data here include an estimate of people living with HIV for every country in the table.'
        : `The UNAIDS data here lack an estimate of people living with HIV for ${listOf(names)}, so aid per person is blank and the strip excludes ${them}.`;
};

/** The Notes line on the other UNAIDS figures missing for countries that do have an
 *  estimate of people living with HIV; null when none is missing. */
export const unaidsGapNote = (data: HivData): string | null => {
    const named = data.countries.filter((country) => country.plhiv !== null);
    const sorted = (names: string[]) => names.toSorted((a, b) => a.localeCompare(b, 'en'));
    const noArt = sorted(named.filter((c) => c.art === null).map((c) => c.name));
    const noDeaths = sorted(named.filter((c) => c.deaths.at(-1) === null).map((c) => c.name));
    const noFirst = sorted(named.filter((c) => c.deaths[0] === null).map((c) => c.name));
    const [first, last] = [data.years[0], lastYear(data)];
    const missing = [
        noArt.length === 0 ? null : `treatment coverage for ${listOf(noArt)}`,
        noDeaths.length === 0 ? null : `AIDS-related deaths in ${last} for ${listOf(noDeaths)}`,
    ].filter((part) => part !== null);

    return (
        [
            missing.length === 0
                ? null
                : `The same data have no figures on ${missing.join(', or ')}. Missing cells show "–".`,
            noFirst.length === 0
                ? null
                : `With no ${first} AIDS-related deaths figure for ${listOf(noFirst)}, ${noFirst.length === 1 ? 'its summary leaves' : 'their summaries leave'} out the ${first} comparison.`,
        ]
            .filter((sentence) => sentence !== null)
            .join(' ') || null
    );
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
        `In ${lastYear(data)}, the latest year of OECD data, the United States and the Global Fund disbursed almost all HIV aid recorded for countries.`,
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
        `The United States and the Global Fund disbursed ${pct(usGfShare)} of HIV aid recorded for countries in ${lastYear(data)}.`,
        usMajorityGfMulti > 0
            ? `Of the ${usMajority} countries where the United States disbursed more than half, ${usMajorityGfMulti} also received Global Fund multi-disease grants.`
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
 * Facts the summary sentence attaches to a named provider, by DFO label, built from the
 * provider's figures where they carry a number. `largestOtherFalls` throws when a label here
 * is missing from `HivData.otherProviders`.
 */
export const OTHER_PROVIDER_FACTS: Readonly<
    Record<string, (provider: OtherProvider, year: number) => string>
> = {
    'International Development Association': (provider, year) =>
        `which lent ${money(provider.last)} in ${year}`,
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
    const items = named.map((provider) => {
        const label = OTHER_PROVIDER_LABELS[provider.name] ?? provider.name;
        const fact = OTHER_PROVIDER_FACTS[provider.name];

        return fact === undefined ? label : `${label}, ${fact(provider, lastYear(data))}`;
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

/** The summary sentence with no country selected. */
export const allSentence = (data: HivData): string => {
    const first = data.years[0] ?? 0;
    const last = lastYear(data);
    const others = data.allocated.other;

    return [
        `In ${last}, donors disbursed ${money(lastTotal(data.allocated))} in HIV aid to ${data.recipients} countries.`,
        `Providers other than the United States and the Global Fund disbursed ${money(others.at(-1) ?? 0)} in ${last}, against ${money(others[0] ?? 0)} in ${first}.`,
        fallSentence(data),
    ]
        .filter((sentence) => sentence !== null)
        .join(' ');
};

/** US bilateral HIV spending in `KFF_YEAR`, from `SOURCES.kff2025`, in current dollars,
 *  which equal constant dollars in that year. */
const KFF_US_BILATERAL = 5.4e9;
const KFF_YEAR = 2024;

/** From this year US money to countries held in a narrow range. */
const US_STEADY_FROM = 2020;

/** The line under the chart on money reported for regions or no country, which the chart
 *  leaves out. */
export const unallocatedCaption = (data: HivData): string => {
    const last = lastYear(data);
    const usElsewhere = data.unallocated.us.at(-1) ?? 0;

    return `The chart excludes ${money(lastTotal(data.unallocated))} of ${last} HIV aid reported for regions or no country, ${money(usElsewhere)} of it from the United States.`;
};

/** The Notes item on the US total with those flows, which runs above US government reports. */
export const usTotalNote = (data: HivData): Cited[] => {
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
            : `US disbursements to countries stayed between ${money(Math.min(...steady))} and ${money(Math.max(...steady))} a year from ${US_STEADY_FROM} to ${last}.`;
    const usCountries = data.allocated.us.at(-1) ?? 0;
    const usElsewhere = data.unallocated.us.at(-1) ?? 0;
    // Money to countries at or below KFF's figure puts all of the excess in the rest.
    const excess =
        last === KFF_YEAR &&
        usCountries <= KFF_US_BILATERAL &&
        usCountries + usElsewhere > KFF_US_BILATERAL
            ? `In ${last}, ${money(usCountries)} went to named countries, so the excess over KFF's figure lies in the ${money(usElsewhere)} reported for regions or no country.`
            : null;

    return [
        {
            text: [
                `Including aid for regions or no country, US disbursements under the HIV code totalled ${money(usAll.at(-2) ?? 0)} in ${previous} and ${money(usAll.at(-1) ?? 0)} in ${last}.`,
                `KFF puts US bilateral HIV spending at $${KFF_US_BILATERAL / 1e9}bn in ${KFF_YEAR}.`,
            ].join(' '),
            sources: [SOURCES.kff2025],
        },
        ...[excess, range].filter((sentence) => sentence !== null).map((text) => ({ text })),
    ];
};

/** The table's legend for the marked rows, with the multi-disease money to countries the
 *  table leaves out. */
export const flagLegend = (data: HivData): string => {
    const last = lastYear(data);
    const inTable = data.countries.reduce(
        (sum, country) => sum + (country.globalFundMulti.at(-1) ?? 0),
        0,
    );
    const outside = (data.globalFundMulti.at(-1) ?? 0) - inTable;

    return [
        `Marked countries also received Global Fund multi-disease grants in ${last}, shown beside each name. These grants are recorded under other CRS codes and excluded from HIV aid totals.`,
        outside >= 0.5e6
            ? `A further ${money(outside)} went to countries with no HIV aid in ${last}.`
            : null,
    ]
        .filter((sentence) => sentence !== null)
        .join(' ');
};

/** A value by year, 0 for a year the series does not hold. */
const inYear = (data: HivData, series: readonly number[], year: number): number => {
    const index = data.years.indexOf(year);

    return index < 0 ? 0 : (series[index] ?? 0);
};

/** The Global Fund's move between codes counts as most of its jump from this share up. */
const CODE_CHANGE_SHARE = 0.5;

/**
 * How to interpret's sentence on the Global Fund's change of codes in `BREAK_YEAR`: its
 * multi-disease grants and its HIV-code money either side, and the reading of the jump only
 * when the multi-disease fall makes up at least `CODE_CHANGE_SHARE` of the HIV-code rise.
 * Null when the years are missing or the two did not move apart.
 */
export const codeChangeSentence = (data: HivData): string | null => {
    const [before, after] = [BREAK_YEAR - 1, BREAK_YEAR];

    if (!data.years.includes(before) || !data.years.includes(after)) {
        return null;
    }

    const multi = [
        inYear(data, data.globalFundMulti, before),
        inYear(data, data.globalFundMulti, after),
    ];
    const hiv = [
        inYear(data, data.allocated.globalFund, before),
        inYear(data, data.allocated.globalFund, after),
    ];
    const [fall, rise] = [multi[0] - multi[1], hiv[1] - hiv[0]];

    if (fall <= 0 || rise <= 0) {
        return null;
    }

    const moves = `From ${before} to ${after}, the Global Fund's multi-disease grants to countries fell from ${money(multi[0])} to ${money(multi[1])}, while its HIV-code disbursements rose from ${money(hiv[0])} to ${money(hiv[1])}.`;

    return fall >= CODE_CHANGE_SHARE * rise
        ? `${moves} That reclassification, marked by the dashed line, explains much of the jump.`
        : moves;
};

/** A middle year counts as a swing when it differs from both neighbours by this share. */
const SWING_SHARE = 0.2;

/**
 * How to interpret's sentence on the US swing from 2018 to 2020; null unless 2019 moved more
 * than `SWING_SHARE` against both 2018 and 2020, in the same direction.
 */
export const usSwingSentence = (data: HivData): string | null => {
    const [a, b, c] = [2018, 2019, 2020].map((year) => inYear(data, data.allocated.us, year));

    if (a <= 0 || c <= 0) {
        return null;
    }

    const dip = b < a * (1 - SWING_SHARE) && b < c * (1 - SWING_SHARE);
    const spike = b > a * (1 + SWING_SHARE) && b > c * (1 + SWING_SHARE);

    if (!dip && !spike) {
        return null;
    }

    const [first, second] = dip ? ['fell', 'rose'] : ['rose', 'fell'];

    return `US disbursements to countries ${first} from ${money(a)} in 2018 to ${money(b)} in 2019, then ${second} to ${money(c)} in 2020.`;
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
    const from = money(covered) === money(total) ? 'all from' : 'including';

    return `Disbursements to countries from ${data.years[0] ?? 0} to ${lastYear(data)} included ${money(total)} in ODA loans, ${from} ${listOf(items)}.`;
};

/** The strip's caption: how many countries it holds and the rule that picks them. */
export const stripCaption = (data: HivData): string => {
    const count = perPersonPoints(data.countries).length;

    return `${count} ${count === 1 ? 'country' : 'countries'} that received HIV aid in ${lastYear(data)} and ${count === 1 ? 'has' : 'have'} at least ${STRIP_MIN_PLHIV.toLocaleString('en-GB')} people living with HIV`;
};

/** The line under the table's heading: which countries it lists. */
export const tableRule = (data: HivData): string =>
    `Every country that received HIV aid in ${lastYear(data)}.`;

/** Countries whose name takes "the" in running text, by ISO3 code. */
const WITH_ARTICLE: ReadonlySet<string> = new Set(['CAF', 'COG', 'DOM', 'PHL']);

/** A country's name as a sentence uses it: "the Philippines", "Kenya". */
const nameInText = (country: Country): string =>
    WITH_ARTICLE.has(country.iso3) ? `the ${country.name}` : country.name;

const mixClause = (country: Country): string | null => {
    const shares = lastShares(country.aid);
    const printed = mixPercents(shares);
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
        ? `The Global Fund disbursed ${money(multi)} in multi-disease grants to ${nameInText(country)} in ${year}, recorded under other CRS codes and excluded from the HIV aid total.`
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
        opening = `In ${year}, ${nameInText(country)} received no HIV aid.`;
    } else if (ratio === null) {
        opening = `In ${year}, ${nameInText(country)} received ${money(aid)} in HIV aid.`;
    } else {
        opening = `In ${year}, ${nameInText(country)} received ${money(aid)} in HIV aid, or ${perPerson(ratio)} per person living with HIV.`;
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
