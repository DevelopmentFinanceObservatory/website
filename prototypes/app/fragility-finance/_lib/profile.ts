// Years, fixed context facts, and the measures read from one context's own figures. Every
// _lib module has only type imports from _data, which keeps it loadable by `node --test`.
import type { Context, DimensionKey, FlowYear, PillarYear, Tier } from '../_data/types.ts';

/** The latest year of aid, OOF, remittances, FDI and debt service paid that every series holds. */
export const FLOW_YEAR = 2024;
/** IDS holds debt service paid to this year; later years are scheduled. */
export const LAST_PAID_YEAR = 2025;
export const FLOW_YEARS = { first: 2015, last: 2024 } as const;
export const PILLAR_YEARS = { first: 2015, last: 2024 } as const;
export const DEBT_YEARS = { first: 2015, last: 2033 } as const;
/** The year the debt key opens on: the last year both ODA and debt service hold. */
export const DEBT_KEY_YEAR = FLOW_YEAR;

export const yearsFrom = (first: number, last: number): number[] =>
    Array.from({ length: last - first + 1 }, (_, index) => first + index);

export const DIMENSIONS: readonly { key: DimensionKey; label: string }[] = [
    { key: 'eco', label: 'Economic' },
    { key: 'env', label: 'Environmental' },
    { key: 'hum', label: 'Human' },
    { key: 'pol', label: 'Political' },
    { key: 'sec', label: 'Security' },
    { key: 'soc', label: 'Societal' },
];

type Level = 'medium' | Tier;

/**
 * The contexts whose fragility level changed between the OECD's 2025 list and its 2026
 * update (OECD, States of Fragility 2026 update), by ISO3 code.
 */
export const MOVES_2026: Record<string, { from: Level; to: Level }> = {
    AGO: { from: 'high', to: 'extreme' },
    PNG: { from: 'high', to: 'extreme' },
    MOZ: { from: 'high', to: 'extreme' },
    MMR: { from: 'high', to: 'extreme' },
    IRQ: { from: 'extreme', to: 'high' },
    LBY: { from: 'extreme', to: 'high' },
    HND: { from: 'medium', to: 'high' },
};

/**
 * Contexts in arrears to external creditors: their scheduled payments are far larger than
 * what they pay, so the group debt view leaves them out.
 */
export const IN_ARREARS: ReadonlySet<string> = new Set(['SDN', 'YEM', 'SYR']);

/**
 * The dimensions in the context's most fragile category, most fragile score first; every
 * dimension in that category is named, so a tie names them all.
 */
export const mostFragileDimensions = (context: Context): DimensionKey[] => {
    const lowest = Math.min(...DIMENSIONS.map(({ key }) => context.dimensions[key].category));

    return DIMENSIONS.filter(({ key }) => context.dimensions[key].category === lowest)
        .toSorted((a, b) => context.dimensions[a.key].score - context.dimensions[b.key].score)
        .map(({ key }) => key);
};

export const flowAt = (context: Context, year: number): FlowYear | undefined =>
    context.flows.find((flow) => flow.year === year);

export const pillarAt = (context: Context, year: number): PillarYear | undefined =>
    context.pillars.find((pillar) => pillar.year === year);

export const pillarTotal = (pillar: PillarYear): number =>
    pillar.development + pillar.humanitarian + pillar.peace;

/** Whether the World Bank's International Debt Statistics cover the context. */
export const inIds = (context: Context): boolean => context.debtService.length > 0;

/** The parts of an inflow share, or null unless ODA, OOF, remittances and FDI are all held. */
export const inflowParts = (
    flow: FlowYear | undefined,
): { oda: number; inflows: number } | null => {
    if (
        flow === undefined ||
        flow.oda === null ||
        flow.oof === null ||
        flow.remittances === null ||
        flow.fdi === null
    ) {
        return null;
    }

    // A net FDI outflow counts as zero: it flows out.
    const inflows = flow.oda + flow.oof + flow.remittances + Math.max(0, flow.fdi);

    return inflows > 0 ? { oda: flow.oda, inflows } : null;
};

/**
 * ODA's share of the money flowing in: ODA over ODA, OOF, remittances and FDI, with a net
 * FDI outflow counted as zero. Null unless all four are held, so every share has the same
 * denominator.
 */
export const inflowShare = (flow: FlowYear | undefined): number | null => {
    const parts = inflowParts(flow);

    return parts === null ? null : parts.oda / parts.inflows;
};

/** Debt service paid per dollar of ODA received, or null where either is not held. */
export const debtPerOda = (flow: FlowYear | undefined): number | null =>
    flow === undefined || flow.oda === null || flow.oda <= 0 || flow.debtService === null
        ? null
        : flow.debtService / flow.oda;

/** The humanitarian share of a context's ODA in `year`, or null without aid that year. */
export const humanitarianShare = (context: Context, year: number): number | null => {
    const pillar = pillarAt(context, year);
    const total = pillar === undefined ? 0 : pillarTotal(pillar);

    return pillar === undefined || total <= 0 ? null : pillar.humanitarian / total;
};

/**
 * How many contexts paid more in debt service than they received in ODA from all
 * providers in `year`: the lede's live figure.
 */
export const debtAboveOdaCount = (contexts: readonly Context[], year = FLOW_YEAR): number =>
    contexts.filter((context) => {
        const ratio = debtPerOda(flowAt(context, year));

        return ratio !== null && ratio > 1;
    }).length;
