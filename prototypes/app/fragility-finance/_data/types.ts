// The shape of the page's figures, which the build derives from DFO's rows (_lib/figures.ts)
// and the page's components read with `import type`. Money is in current US dollars, rounded
// to the dollar.

/** The OECD's six dimensions of fragility. */
export type DimensionKey = 'eco' | 'env' | 'hum' | 'pol' | 'sec' | 'soc';

/** A context's place on one dimension: its score and its category, 1 (most fragile) to 5. */
export type Dimension = { score: number; category: number };

/** The OECD's two fragile tiers. */
export type Tier = 'extreme' | 'high';

/** One year of the money a context receives and pays out, null where no figure is held. */
export type FlowYear = {
    year: number;
    oda: number | null;
    /** Gross other official flows, 0 in a year the CRS records none. */
    oof: number | null;
    remittances: number | null;
    fdi: number | null;
    debtService: number | null;
};

/** One year of gross ODA split into the OECD's humanitarian, development and peace pillars. */
export type PillarYear = { year: number; development: number; humanitarian: number; peace: number };

/** One year of public external debt service, projected on signed loans after 2025. */
export type DebtYear = { year: number; value: number; projected: boolean };

/** A provider of ODA in 2024, with its total ODA's change in 2025 where DAC1 holds it. */
export type DonorShare = { name: string; value: number; change2025: number | null };

/** Climate finance received in 2024: adaptation only, mitigation only, and cross-cutting (both). */
export type ClimateSplit = { year: number; adaptation: number; mitigation: number; both: number };

/** The latest value of an indicator and its year. */
export type Reading = { year: number; value: number };

/** Living-conditions indicators, each a percentage. */
export type IndicatorKey = 'stunting' | 'water' | 'dtp3';

/** One of the OECD's 62 fragile contexts in 2026 and its finance. */
export type Context = {
    iso3: string;
    name: string;
    tier: Tier;
    /** The OECD's aggregate fragility score. Lower is more fragile. */
    score: number;
    /** 1 for the most fragile of the 62. */
    rank: number;
    dimensions: Record<DimensionKey, Dimension>;
    /** The years from 2015 to 2024 in which the CRS holds aid to the context. */
    pillars: PillarYear[];
    /** 2015 to 2024. */
    flows: FlowYear[];
    /** The years from 2015 to 2033 that IDS holds, empty for a context outside IDS. */
    debtService: DebtYear[];
    /** The largest providers in 2024, largest first. */
    donors: DonorShare[];
    /** The 2024 split, null where none is recorded in 2024. */
    climate: ClimateSplit | null;
    /** Population in 2024, keyed by the year as text, empty where UNICEF holds none. */
    population: Record<string, number>;
    indicators: Record<IndicatorKey, Reading | null>;
};

/** The groups the page can show: all 62 contexts, or one tier. */
export type GroupKey = 'all' | 'extreme' | 'high';

/** What the build derives per group. Every other group figure is summed in _lib. */
export type Group = {
    /** The six largest providers of ODA to the group's contexts in 2024, largest first. */
    donors: DonorShare[];
};

export type Groups = Record<GroupKey, Group>;
