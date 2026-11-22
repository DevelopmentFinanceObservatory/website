// The page's words: labels, static section ledes, notes, sources, and the one dynamic
// headline sentence for the scope.
import type { Context, GroupKey } from '../_data/types.ts';

import type { DebtView, FlowKey } from './groups.ts';
import type { Reading } from './chart.ts';
import type { StripDot, StripSpec } from './strip.ts';

import { scopeFlows, totalPopulation } from './groups.ts';
import { formatMoney, formatPeople, listOf, ordinal } from './format.ts';
import {
    debtAboveOdaCount,
    DIMENSIONS,
    FLOW_YEAR,
    flowAt,
    inIds,
    mostFragileDimensions,
    MOVES_2026,
} from './profile.ts';
import { findContext, groupContexts, groupNoun, type Scope } from './scope.ts';

export type Source = { name: string; url: string };

/** Running text in which some words link to a source. */
export type Words = readonly (string | Source)[];

const DFO = 'https://developmentfinance.org/data/sources';

/** Every source the page names, each linked. */
export const SOURCE = {
    crs: {
        name: 'OECD Creditor Reporting System',
        url: `${DFO}/provenance/OECDCreditorReportingSystem`,
    },
    dac1: { name: 'OECD DAC1', url: `${DFO}/provenance/OECDDAC1` },
    ids: {
        name: 'World Bank International Debt Statistics',
        url: `${DFO}/provenance/WorldBankInternationalDebtStatistics`,
    },
    climate: { name: 'ONE Data Climate Finance', url: `${DFO}/provenance/ONEClimateFinance` },
    wdi: {
        name: 'World Development Indicators',
        url: `${DFO}/dc/d/WorldBank_WorldDevelopmentIndicators`,
    },
    sdg: { name: 'SDG Global Database', url: `${DFO}/undata/p/SDG` },
    unicef: { name: 'UNICEF', url: `${DFO}/undata/p/UNICEF` },
    fragility: {
        name: 'OECD, States of Fragility 2026 update',
        url: 'https://www.oecd.org/en/publications/states-of-fragility-2026-update_866ee7f4-en/full-report.html',
    },
    annexA: {
        name: 'States of Fragility 2025, Annex A',
        url: 'https://www.oecd.org/en/publications/states-of-fragility-2025_81982370-en.html',
    },
} as const satisfies Record<string, Source>;

/** The sources list, in the order the page names them. */
export const SOURCES: readonly Source[] = Object.values(SOURCE);

export const LABELS = {
    oda: 'ODA, all providers',
    oof: 'Other official flows',
    remittances: 'Remittances',
    fdi: 'FDI',
    debtService: 'Debt service',
    odaReceived: 'ODA received',
    development: 'Development',
    humanitarian: 'Humanitarian',
    peace: 'Peace',
    adaptation: 'Adaptation',
    mitigation: 'Mitigation',
    crossCutting: 'Cross-cutting',
    noData: 'No data',
    scheduled: 'Scheduled on debt held at the end of 2025',
    search: 'Find a context',
    donorChange: "Donor's total ODA, 2024 to 2025",
} as const;

export const SECTION_TITLES = {
    money: 'Money in, money out',
    debt: 'Debt service',
    aid: 'What aid is for, and who gives it',
    climate: 'Climate finance',
    living: 'Living conditions',
} as const;

export type SectionKey = keyof typeof SECTION_TITLES;

/** A line under a section title, only where the title and chart do not say it. */
export const SECTION_LEDES: Partial<Record<SectionKey, string>> = {
    debt: 'Paid to 2025, then scheduled to 2033 on debt already held.',
};

/** The climate card's title; the bars below it carry the scope. */
export const CLIMATE_TITLE = `Climate finance received in ${FLOW_YEAR}, US dollars`;

export const CLIMATE_METHOD: Words = [
    SOURCE.climate,
    " counts the climate share of each project's disbursements: the coefficient its provider " +
        'reports to the UNFCCC, else the climate share implied by its Biennial Transparency ' +
        'Report, else 40% of projects marked significant and 100% of those marked principal, ' +
        'and the share development banks report. A project marked for both objectives ' +
        'counts once, under the higher marker, or as cross-cutting if the markers are equal.',
];

/**
 * DAC members' ODA to fragile contexts in 2024, from OECD, States of Fragility 2026 update
 * (SOURCE.fragility).
 */
export const OECD_DAC_ODA_2024 = '$44.5bn';

/** The note that ODA here counts every provider, with the 62's 2024 total from the data. */
export const odaNote = (contexts: readonly Context[]): Words => {
    const total = scopeFlows(contexts, { kind: 'group', key: 'all' }).oda.values.at(-1) ?? 0;

    return [
        'ODA is gross disbursements from every provider reporting to the ',
        SOURCE.crs,
        `, multilaterals included, and came to ${formatMoney(total)} in ${FLOW_YEAR}. `,
        "The OECD's ",
        { ...SOURCE.fragility, name: 'States of Fragility 2026 update' },
        ` counts ${OECD_DAC_ODA_2024}, from DAC members only.`,
    ];
};

/**
 * The figures the prose outside the island prints, each from the contexts the island shows,
 * so the lede and notes follow the island's figures (Counts.tsx).
 */
export const PROSE_FIGURES = {
    /** How many contexts paid more in debt service than they received in ODA in 2024. */
    debtAboveOda: (contexts) => String(debtAboveOdaCount(contexts, FLOW_YEAR)),
    contextCount: (contexts) => String(contexts.length),
    /** The contexts outside the World Bank's International Debt Statistics, in prose. */
    withoutIds: (contexts) =>
        listOf(contexts.filter((context) => !inIds(context)).map((context) => context.name)),
} as const satisfies Record<string, (contexts: readonly Context[]) => string>;

export const ARREARS_NOTE =
    'The group debt chart leaves out Sudan, Yemen, and Syria, whose arrears are largest. Others ' +
    'in default or restructuring, such as Ethiopia and Lebanon, stay in, and their schedules ' +
    'exceed what they pay.';

export const DONOR_FOOT = 'DAC1 holds 2025 totals for DAC members only.';

/** The in-plot line on the debt chart for a context outside IDS. */
export const outsideIdsLine = (name: string): string =>
    `${name} is outside the World Bank's debt statistics`;

/** The in-plot line on a chart with no aid recorded for the year. */
export const noOdaLine = (name: string, year = FLOW_YEAR): string =>
    `The CRS records no ODA to ${name} in ${year}`;

/** What a card shows: "All 62 contexts", "20 contexts in extreme fragility", "Mozambique". */
export const scopeName = (contexts: readonly Context[], scope: Scope): string => {
    if (scope.kind === 'context') {
        return findContext(contexts, scope.iso3)?.name ?? scope.iso3;
    }

    const count = groupContexts(contexts, scope.key).length;

    return scope.key === 'all'
        ? `All ${count} contexts`
        : `${count} contexts in ${scope.key} fragility`;
};

/** A chart card's title: "All 62 contexts, 2015 to 2024, US dollars". */
export const cardTitle = (name: string, years: { first: number; last: number }): string =>
    `${name}, ${years.first} to ${years.last}, US dollars`;

/**
 * The debt card's title; for a group it names the set: "54 of the 62 contexts" or "18 of the 20
 * contexts in extreme fragility".
 */
export const debtTitle = (
    contexts: readonly Context[],
    scope: Scope,
    view: DebtView,
    years: { first: number; last: number },
): string =>
    cardTitle(
        scope.kind === 'group'
            ? `${view.iso3s.length} of ${groupNoun(contexts, scope.key)}`
            : scopeName(contexts, scope),
        years,
    );

/** How many of a group a figure covers: "51 of 62". */
export const coverageText = (count: number, total: number): string => `${count} of ${total}`;

/**
 * A debt key row's label: the series name, with the year when the hovered year is after
 * the series ends ("ODA received, 2024").
 */
export const readingLabel = (label: string, reading: Reading): string =>
    reading.kind === 'latest' ? `${label}, ${reading.year}` : label;

/** A dot's label on a strip: "37%, 2022", or "under 1 cent, 2024" where it is off the axis. */
export const dotLabel = (spec: StripSpec, dot: StripDot): string => {
    const { min, max } = spec.scale;
    const value = !dot.clipped
        ? spec.format(dot.value)
        : dot.value < min
          ? `under ${spec.format(min)}`
          : `over ${spec.format(max)}`;

    return `${value}, ${dot.year}`;
};

/** A strip's median label: "Median 31%", or "High fragility median 31%" for a tier. */
export const medianLabel = (spec: StripSpec, value: number, group: GroupKey): string =>
    `${group === 'all' ? 'Median' : `${group === 'extreme' ? 'Extreme' : 'High'} fragility median`} ${spec.format(value)}`;

/**
 * A strip's accessible summary: what it measures, the median of the scope's group, and the
 * chosen context's value.
 */
export const stripSummary = ({
    spec,
    count,
    median,
    group,
    chosen,
}: {
    spec: StripSpec;
    /** How many contexts hold a value. */
    count: number;
    median: number | null;
    group: GroupKey;
    chosen: { name: string; dot: StripDot | null } | null;
}): string => {
    const parts = [`${spec.label}, ${count} contexts.`];

    if (median !== null) {
        parts.push(`${medianLabel(spec, median, group)}.`);
    }

    if (chosen !== null) {
        parts.push(
            chosen.dot === null
                ? `${chosen.name}: ${LABELS.noData.toLowerCase()}.`
                : `${chosen.name}: ${dotLabel(spec, chosen.dot)}.`,
        );
    }

    return parts.join(' ');
};

type Amounts = Partial<Record<FlowKey, number | null>>;

/** What a summed figure covers, where that is fewer contexts than the group: "48 of the 62". */
type Covers = Partial<Record<FlowKey, string>>;

/** "received A, B, C, and D, and paid E", from the figures held; a zero inflow is left out. */
const moneyClauses = (amounts: Amounts, long: boolean, covers: Covers = {}): string | null => {
    const fdiName = long ? 'foreign direct investment' : 'FDI';
    const oofName = long ? 'other official flows' : 'OOF';
    const debtName = long ? 'public external debt service' : 'debt service';
    const of = (key: FlowKey) => (covers[key] === undefined ? '' : ` (${covers[key]})`);
    const received = [
        amounts.oda != null && amounts.oda > 0
            ? `${formatMoney(amounts.oda)} in ODA${of('oda')}`
            : null,
        amounts.oof != null && amounts.oof > 0
            ? `${formatMoney(amounts.oof)} in ${oofName}${of('oof')}`
            : null,
        amounts.remittances != null
            ? `${formatMoney(amounts.remittances)} in remittances${of('remittances')}`
            : null,
        amounts.fdi != null && amounts.fdi > 0
            ? `${formatMoney(amounts.fdi)} in ${fdiName}${of('fdi')}`
            : null,
    ].filter((part) => part !== null);
    const clauses = [
        received.length > 0 ? `received ${listOf(received)}` : null,
        amounts.fdi != null && amounts.fdi < 0
            ? `recorded a net ${fdiName} outflow of ${formatMoney(-amounts.fdi)}${of('fdi')}`
            : null,
        amounts.debtService != null
            ? `paid ${formatMoney(amounts.debtService)} in ${debtName}${of('debtService')}`
            : null,
    ].filter((part) => part !== null);

    if (clauses.length === 0) {
        return null;
    }

    return clauses.length === 1
        ? (clauses[0] ?? null)
        : `${clauses.slice(0, -1).join(', ')}, and ${clauses.at(-1) ?? ''}`;
};

/**
 * The headline for a group: "In 2024 the 62 contexts, home to 2.05bn people, received
 * $106bn in ODA, $183bn in remittances, and $51bn in foreign direct investment, and paid
 * $64bn in public external debt service." Each figure is the 2024 value of the summed
 * series the money chart's key shows. A figure over fewer contexts than the group says so:
 * "$183bn in remittances (48 of the 62)".
 */
export const groupHeadline = (contexts: readonly Context[], key: GroupKey): string => {
    const members = groupContexts(contexts, key);
    const flows = scopeFlows(contexts, { kind: 'group', key });
    const at = flows.oda.years.indexOf(FLOW_YEAR);
    const people = totalPopulation(members, FLOW_YEAR).value;
    const home = people === null ? '' : `, home to ${formatPeople(people)} people,`;
    const money = moneyClauses(
        Object.fromEntries(
            Object.entries(flows).map(([flow, series]) => [flow, series.values[at] ?? null]),
        ) as Amounts,
        true,
        Object.fromEntries(
            Object.entries(flows).flatMap(([flow, series]) => {
                const count = series.counts[at] ?? 0;

                return count > 0 && count < members.length
                    ? [[flow, `${count} of the ${members.length}`]]
                    : [];
            }),
        ),
    );
    const subject = `${groupNoun(contexts, key)}${home}`;

    return money === null
        ? `The CRS records no ODA to ${groupNoun(contexts, key)} in ${FLOW_YEAR}.`
        : `In ${FLOW_YEAR} ${subject} ${money}.`;
};

const dimensionWord = (key: string): string =>
    (DIMENSIONS.find((dimension) => dimension.key === key)?.label ?? key).toLowerCase();

/** "most fragile on the human and societal dimensions", or the like for wider ties. */
const dimensionClause = (context: Context): string => {
    const keys = mostFragileDimensions(context);

    if (keys.length === DIMENSIONS.length) {
        return 'equally fragile on all six dimensions';
    }

    if (keys.length >= 4) {
        const rest = DIMENSIONS.filter(({ key }) => !keys.includes(key)).map(({ key }) =>
            dimensionWord(key),
        );

        return `most fragile on every dimension except ${listOf(rest)}`;
    }

    const noun = keys.length === 1 ? 'dimension' : 'dimensions';

    return `most fragile on the ${listOf(keys.map(dimensionWord))} ${noun}`;
};

/**
 * The headline for a context: "Mozambique is the 19th most fragile of 62, in extreme
 * fragility since the 2026 update, and most fragile on the human and societal dimensions.
 * In 2024 it received $3.0bn in ODA, $267m in remittances, and $3.6bn in FDI, and paid
 * $917m in debt service."
 */
export const contextHeadline = (context: Context, total: number): string => {
    const move = MOVES_2026[context.iso3];
    const tier =
        move === undefined
            ? `in ${context.tier} fragility`
            : `in ${context.tier} fragility since the 2026 update`;
    const place =
        context.rank === 1
            ? `the most fragile of the ${total}`
            : `the ${ordinal(context.rank)} most fragile of ${total}`;
    const first = `${context.name} is ${place}, ${tier}, and ${dimensionClause(context)}.`;
    const flow = flowAt(context, FLOW_YEAR);
    const money = flow === undefined ? null : moneyClauses(flow, false);
    const second = money === null ? `${noOdaLine(context.name)}.` : `In ${FLOW_YEAR} it ${money}.`;

    return `${first} ${second}`;
};
