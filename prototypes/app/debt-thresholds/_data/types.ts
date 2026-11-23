// The shape of the page's thresholds data, shared by the Python steps (which write each base
// year as a `ViewData`), the classification module and the page's components. The data step
// commits the 2024 view to thresholds-2024.json, the page's build makes the 2025 view from DFO
// (_lib/build.ts), and `thresholdsData` (_lib/views.ts) puts them together as `ThresholdsData`.
// Components import it with `import type`, so it never reaches the bundle.
//
// Money is in current US dollars. Ratios are computed from these amounts by
// `_lib/thresholds.ts`, never stored, so the page and the CSV cannot disagree.

/** IMF–World Bank debt-carrying capacity, which sets each threshold. */
export type Capacity = 'weak' | 'medium' | 'strong';

/**
 * Where a base year's capacity comes from: the latest IMF–World Bank LIC debt
 * sustainability analysis in force for that base year, or FDL's 2023 rule that
 * countries with no LIC DSA are treated as strong.
 */
export type CapacitySource = 'dsa' | 'assumed';

/** IMF–World Bank risk of external debt distress, from the same DSA. */
export type RiskRating = 'low' | 'moderate' | 'high' | 'in debt distress';

/** The creditor groups debt service is reported by. China counts official and private lenders. */
export type Creditor = 'multilateral' | 'imf' | 'bilateral' | 'china' | 'private';

/** FDL's own group for a country, from the March 2026 note (base year 2024). */
export type FdlGroup = 'insolvent' | 'illiquid' | 'lower risk';

/** One year of debt service and revenue, actual or projected. */
export type YearRow = {
    year: number;
    /**
     * True after the base year: the DFO's projection using FDL's 2023 method, which
     * adds new borrowing to the World Bank's schedule for debt already contracted.
     */
    projected: boolean;
    /** External public debt service (PPG plus IMF), by creditor group. Null when missing. */
    service: Record<Creditor, number> | null;
    /** General government revenue including grants, IMF WEO. Null when missing. */
    revenue: number | null;
};

/** Everything the tests need for one base year. */
export type BaseYear = {
    year: number;
    /** External public and publicly guaranteed debt (PPG, without IMF credit) at the end of the base year, face value. */
    debtFace: number | null;
    /**
     * The same debt at estimated present value: the concessional share of the stock
     * discounted by the grant element of commitments from 2015 to the base year, weighted
     * by the amount committed each year (IDS).
     */
    debtPV: number | null;
    /** GDP in the base year, IMF WEO. */
    gdp: number | null;
    /** Capacity in force for this base year. Null only while a rating is missing (no data). */
    capacity: Capacity | null;
    capacitySource: CapacitySource | null;
    /** Date of the DSA the capacity comes from, ISO 8601; null when assumed or missing. */
    dsaDate: string | null;
    riskRating: RiskRating | null;
    /** Base year minus 8 to base year plus 6: actual up to the base year, projected after it. */
    years: YearRow[];
};

export type Country = {
    iso3: string;
    name: string;
    /** FDL's published 2024 group. */
    fdl2024: FdlGroup | null;
    /** Keyed by base year as a string, e.g. "2024", "2025". */
    bases: Record<string, BaseYear>;
};

/** The data releases one base year was built on. */
export type Vintage = {
    /** World Bank IDS release used, e.g. "December 2025". */
    ids: string;
    /** IMF WEO release used, e.g. "October 2025". */
    weo: string;
    /** Capacities are the latest DSA published on or before this date, ISO 8601. */
    capacityAsOf: string;
    /**
     * True when the base year was built on the releases of its own time (for 2024, the
     * IDS December 2025 and WEO October 2025 FDL used); false when one could not be had
     * and the current release stood in. `ids` and `weo` name the releases used either way.
     */
    archived: boolean;
};

export type ThresholdsData = {
    /** Base years the page offers, oldest first: 2024 (FDL's year) and 2025. */
    baseYears: number[];
    /** The year the page opens on, set by the data step's coverage check. */
    defaultYear: number;
    /** The debt test uses estimated present value (`debtPV`). */
    measure: 'pv';
    /** Keyed by base year as a string. */
    vintages: Record<string, Vintage>;
    /** Countries whose 2024 rebuilt group equals FDL's published group, from the reproduction check. */
    fdlMatch?: { matched: number; total: number };
    countries: Country[];
};

/** One base year as a Python step writes it (`pipeline.build.view_data`): its releases and each
 *  country's record, in the order of FDL's annex. */
export type ViewData = {
    year: number;
    vintage: Vintage;
    countries: (Omit<Country, 'bases'> & { base: BaseYear })[];
};
