// The figures _data/fetch.py has DFO compute, read again in the browser on DFO's newest stored
// data: each pillar's total and the total ODA and OOF per context and year, the six largest
// providers per context and per tier, climate finance per context, and each DAC member's
// change in 2025. Every other figure on the page, such as remittances, FDI, debt service,
// population and the indicators, stays as profiles.json holds it.
//
// `sources` reads fewer, larger results than the step's 30 recipes, so a load stays inside the
// gateway's allowance. Per CRS aid read it runs two recipes: a sum by recipient and purpose,
// which gives the total and, by purpose code, each pillar, and 2024 by provider and recipient,
// from which the page ranks each context's donors and sums each tier's. Neither filters by
// purpose, so neither takes DFO's slower path for a sum of selected purposes. It reads the OOF
// and DAC1 reads as rows and sums them here; their values are whole dollars, so those sums do
// not depend on the order they run in. Climate finance keeps the step's three recipes, since
// its values hold cents and the page's sums must round as DFO's do. `figuresFromRows` repeats
// the step's small arithmetic and refuses figures that fail the step's `check`. live.test.mts
// checks that the climate recipes are the step's (_data/live-fixture.json) and that the rows
// these sources gave at the pinned versions (_data/live-sources-fixture.json.gz, written by
// _data/live-sources.mts) derive profiles.json's and groups.json's figures exactly.
//
// Each pillar is its purpose codes, as fetch.py's `pillar` counts them, so a purpose relabelled
// in a newer stored version stays in its pillar. The pillar guard refuses a pillar that comes
// back empty for a context and year where profiles.json holds it above zero.
import { DatasetRef, recipe } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

import type { ClimateSplit, Context, DonorShare, Groups, PillarYear } from '../_data/types.ts';

import type { LiveSource } from '#lib/liveRead.ts';
import { pythonRound } from '#lib/round.ts';

/** What _data/live.json holds: the recipients of each CRS read, the labels of each pillar's
 *  purpose codes, and each CRS provider's label by code. The page counts pillars by purpose
 *  code, so it reads no label of `purposes`. */
export type LiveInputs = {
    groups: Record<string, string[]>;
    purposes: { humanitarian: string[]; peace: string[] };
    providers: Record<string, string>;
};

export type Figures = { contexts: Context[]; groups: Groups };

const DONOR_YEAR = 2024;
const CLIMATE_YEAR = 2024;
const TOP_DONORS = 6;
const RECIPIENT = 'financingRecipient';
const PROVIDER = 'financingProvider';
/** The column a sum by purpose holds a CRS read's purpose codes in. */
const PURPOSE_COLUMN = 'stat_var_crsPurpose';
const PURPOSE_CODE = 'CRSPurposeCode';
const TIERS = ['extreme', 'high'] as const;
const PILLARS = ['humanitarian', 'peace'] as const;
/** The OECD's pillars by purpose code, as fetch.py's `HUMANITARIAN` and `PEACE` hold them
 *  (States of Fragility 2025, Annex A, Tables A.1 and A.2). Every other code is
 *  development. */
const PILLAR_CODES: Record<(typeof PILLARS)[number], ReadonlySet<number>> = {
    humanitarian: new Set([72010, 72040, 72050, 73010, 74020]),
    peace: new Set([
        15210, 15220, 15230, 15240, 15250, 15261, 15110, 15111, 15112, 15113, 15130, 15150, 15152,
        15153, 15160, 15170, 15180, 15190,
    ]),
};
const CLIMATE_READS = ['climate-total', 'climate-adaptation', 'climate-mitigation'] as const;
const CHANGE_READS = ['donors2025', 'donors2025-eu'] as const;
/** The step's `check`: how many of the 62 contexts must have aid, and the range of OOF in
 *  `DONOR_YEAR` and how many contexts must receive some. */
const MIN_CONTEXTS_WITH_AID = 60;
const OOF_RANGE = [15e9, 20e9] as const;
const MIN_CONTEXTS_WITH_OOF = 50;

/** A value by year. */
type Yearly = Map<number, number>;

/**
 * What the page reads, by key: per CRS aid read `aid-N`, the recipes `aid-N/purposes` and
 * `aid-N/providers`; the climate recipes, keyed as the step keys them, such as
 * `climate-total/total`; and each OOF and DAC1 read as rows under its key in refs.json, such
 * as `oof-1`.
 */
export const sources = (
    refs: Record<string, { ref: unknown }>,
    live: LiveInputs,
): Record<string, LiveSource> => {
    const refOf = (key: string) => {
        const source = refs[key];

        if (source === undefined) {
            throw new Error(`refs.json holds no ${key}`);
        }

        return source.ref;
    };
    const start = (key: string) => recipe(DatasetRef.fromJSON(refOf(key)));
    const found: Record<string, LiveSource> = {};

    for (const key of Object.keys(live.groups)) {
        found[`${key}/purposes`] = {
            recipe: start(key).aggregate({ by: ['destination', 'crsPurpose'] }),
        };
        found[`${key}/providers`] = {
            recipe: start(key)
                .filter({ keep: { time_period: String(DONOR_YEAR) } })
                .aggregate({ by: ['origin', 'destination'] }),
        };
    }

    for (const key of CLIMATE_READS) {
        found[`${key}/total`] = { recipe: start(key).aggregate({ by: 'destination' }) };
    }

    for (const key of [...Object.keys(live.groups).map(oofOf), ...CHANGE_READS]) {
        found[key] = { ref: refOf(key) };
    }

    return found;
};

/** The OOF read of the same recipients as the CRS aid read `key`. */
const oofOf = (key: string) => key.replace(/^aid-/, 'oof-');

/** Python's `round` to the dollar, which takes a half to the even neighbour and gives no
 *  negative zero, so the page's dollars match the step's. */
export const money = (value: number): number => pythonRound(value) + 0;

const numberOf = (row: Row): number | null => {
    const value = row.value;

    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
};

/** Each place's value in each year, keyed by ISO3 code, as fetch.py's `by_place` sums them. */
const byPlace = (rows: readonly Row[], column: string): Map<string, Yearly> => {
    const places = new Map<string, Yearly>();

    for (const row of rows) {
        const value = numberOf(row);

        if (value === null) {
            continue;
        }

        const iso3 = String(row[column]).replace(/^country\//, '');
        const year = Number(row.time_period);
        const values = places.get(iso3) ?? new Map<number, number>();

        values.set(year, (values.get(year) ?? 0) + value);
        places.set(iso3, values);
    }

    return places;
};

/** The results of the CRS reads in one map, refusing a recipient two reads hold. */
const joined = (parts: readonly Map<string, Yearly>[]): Map<string, Yearly> => {
    const found = new Map<string, Yearly>();

    for (const part of parts) {
        for (const [iso3, values] of part) {
            if (found.has(iso3)) {
                throw new Error(`${iso3} is in two CRS reads`);
            }

            found.set(iso3, values);
        }
    }

    return found;
};

/** Each pillar's value by place and year, from the rows of the sums by recipient and purpose,
 *  each purpose counted in its pillar by code. */
const byPillar = (
    parts: readonly (readonly Row[])[],
): Record<(typeof PILLARS)[number], Map<string, Yearly>> => {
    const split = (pillar: (typeof PILLARS)[number]) =>
        joined(
            parts.map((part) =>
                byPlace(
                    part.filter((row) => pillarOf(row) === pillar),
                    RECIPIENT,
                ),
            ),
        );

    return { humanitarian: split('humanitarian'), peace: split('peace') };
};

/** The pillar of a row's purpose code, or null for development.
 *  @throws When the row holds no purpose code. */
const pillarOf = (row: Row): (typeof PILLARS)[number] | null => {
    const purpose = String(row[PURPOSE_COLUMN]);
    const code = Number(purpose.slice(PURPOSE_CODE.length));

    if (!purpose.startsWith(PURPOSE_CODE) || !Number.isInteger(code)) {
        throw new Error(`${purpose} is not a CRS purpose code`);
    }

    return PILLARS.find((pillar) => PILLAR_CODES[pillar].has(code)) ?? null;
};

/** Each provider's change in total ODA from `DONOR_YEAR` to the next year, as a fraction, from
 *  the DAC1 rows, as DFO's `growth` gives it. A provider without both years, or with a change
 *  that is not finite, which a zero base gives, is left out, as the step leaves it out. */
const changes = (rows: readonly Row[]): Map<string, number> => {
    const values = new Map<string, Yearly>();

    for (const row of rows) {
        const value = numberOf(row);

        if (value !== null) {
            const provider = String(row[PROVIDER]);
            const years = values.get(provider) ?? new Map<number, number>();
            const year = Number(row.time_period);

            years.set(year, (years.get(year) ?? 0) + value);
            values.set(provider, years);
        }
    }

    const found = new Map<string, number>();

    for (const [provider, years] of values) {
        const first = years.get(DONOR_YEAR);
        const last = years.get(DONOR_YEAR + 1);
        const change = first === undefined || last === undefined ? NaN : (last - first) / first;

        if (Number.isFinite(change)) {
            found.set(provider, change);
        }
    }

    return found;
};

/** Each context's money from each provider in `DONOR_YEAR`, keyed by ISO3 code. */
const providersByPlace = (rows: readonly Row[]): Map<string, Map<string, number>> => {
    const found = new Map<string, Map<string, number>>();

    for (const row of rows) {
        const value = numberOf(row);

        if (value !== null && Number(row.time_period) === DONOR_YEAR) {
            const iso3 = String(row[RECIPIENT]).replace(/^country\//, '');
            const values = found.get(iso3) ?? new Map<string, number>();
            const provider = String(row[PROVIDER]);

            values.set(provider, (values.get(provider) ?? 0) + value);
            found.set(iso3, values);
        }
    }

    return found;
};

const rowsOf = (rows: Record<string, Row[]>, key: string): Row[] => {
    const found = rows[key];

    if (found === undefined) {
        throw new Error(`no rows for ${key}`);
    }

    return found;
};

/** The `TOP_DONORS` largest providers of `totals`, those above zero, largest first. */
const largest = (
    totals: ReadonlyMap<string, number>,
    providers: Record<string, string>,
    change: ReadonlyMap<string, number>,
): DonorShare[] =>
    [...totals]
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, TOP_DONORS)
        .filter(([, value]) => value > 0)
        .map(([provider, value]) => {
            const name = providers[provider];

            if (name === undefined) {
                throw new Error(`live.json names no provider ${provider}`);
            }

            const moved = change.get(provider);

            return {
                name,
                value: money(value),
                change2025: moved === undefined ? null : pythonRound(moved, 4),
            };
        });

/**
 * A rule of fetch.py's `check` that the figures break: fewer than `MIN_CONTEXTS_WITH_AID`
 * contexts with aid, a group without `TOP_DONORS` donors, the six largest donors to all
 * contexts giving more than all ODA in `DONOR_YEAR`, or OOF in `DONOR_YEAR` outside
 * `OOF_RANGE` or above zero in fewer than `MIN_CONTEXTS_WITH_OOF` contexts.
 */
export type FiguresCheck =
    'contexts_without_aid' | 'group_short_of_donors' | 'donors_above_oda' | 'oof_out_of_range';

/** The figures break the step's `check`, so the page keeps its committed figures. */
export class FiguresCheckError extends Error {
    readonly checks: readonly FiguresCheck[];

    constructor(checks: readonly FiguresCheck[]) {
        super(`The figures break the step's checks: ${checks.join(', ')}`);
        this.name = 'FiguresCheckError';
        this.checks = checks;
    }
}

/** Each rule of `FiguresCheck` that `figures` break; empty when all hold. */
const figureProblems = ({ contexts, groups }: Figures): FiguresCheck[] => {
    const inDonorYear = contexts.flatMap(({ flows }) =>
        flows.filter(({ year }) => year === DONOR_YEAR),
    );
    const oda = inDonorYear.reduce((sum, { oda: value }) => sum + (value ?? 0), 0);
    const oof = inDonorYear.map(({ oof: value }) => value ?? 0);
    const oofTotal = oof.reduce((sum, value) => sum + value, 0);
    const donated = groups.all.donors.reduce((sum, { value }) => sum + value, 0);
    const problems: [FiguresCheck, boolean][] = [
        [
            'contexts_without_aid',
            contexts.filter(({ pillars }) => pillars.length > 0).length < MIN_CONTEXTS_WITH_AID,
        ],
        [
            'group_short_of_donors',
            Object.values(groups).some(({ donors }) => donors.length !== TOP_DONORS),
        ],
        ['donors_above_oda', donated > oda],
        [
            'oof_out_of_range',
            !(OOF_RANGE[0] < oofTotal && oofTotal < OOF_RANGE[1]) ||
                oof.filter((value) => value > 0).length < MIN_CONTEXTS_WITH_OOF,
        ],
    ];

    return problems.filter(([, broken]) => broken).map(([check]) => check);
};

/**
 * The page's figures from the rows of `sources`: `committed` with each context's pillars,
 * ODA, OOF, donors and climate split, and each group's donors, replaced by what the rows give,
 * once they pass the step's `check` (`FiguresCheck`).
 *
 * @throws {FiguresCheckError} When the figures break a rule of the step's `check`.
 * @throws When a humanitarian or peace pillar comes back empty for a context and year that
 *   profiles.json holds above zero, as a purpose label that names no code in a newer version
 *   would cause, or when a provider has no label in live.json, so the page keeps its
 *   committed figures.
 */
export const figuresFromRows = (
    rows: Record<string, Row[]>,
    committed: Figures,
    live: LiveInputs,
): Figures => {
    const figures = deriveFigures(rows, committed, live);
    const broken = figureProblems(figures);

    if (broken.length > 0) {
        throw new FiguresCheckError(broken);
    }

    return figures;
};

/** `figuresFromRows` without the step's `check`, whose thresholds hold only for all 62
 *  contexts, so a test can derive figures from a few. */
export const deriveFigures = (
    rows: Record<string, Row[]>,
    committed: Figures,
    live: LiveInputs,
): Figures => {
    const reads = Object.keys(live.groups);
    const purposes = reads.map((key) => rowsOf(rows, `${key}/purposes`));
    const totals = joined(purposes.map((part) => byPlace(part, RECIPIENT)));
    const pillars = byPillar(purposes);
    const official = joined(reads.map((key) => byPlace(rowsOf(rows, oofOf(key)), RECIPIENT)));
    const climate = CLIMATE_READS.map((key) => byPlace(rowsOf(rows, `${key}/total`), RECIPIENT));
    const change = changes(CHANGE_READS.flatMap((key) => rowsOf(rows, key)));
    const given = providersByPlace(reads.flatMap((key) => rowsOf(rows, `${key}/providers`)));

    const contexts = committed.contexts.map((context): Context => {
        const { iso3 } = context;
        const oda = totals.get(iso3) ?? new Map<number, number>();
        const humanitarian = pillars.humanitarian.get(iso3) ?? new Map<number, number>();
        const peace = pillars.peace.get(iso3) ?? new Map<number, number>();

        for (const year of context.pillars) {
            for (const pillar of PILLARS) {
                const held = pillar === 'humanitarian' ? humanitarian : peace;

                if (year[pillar] !== 0 && !held.has(year.year)) {
                    throw new Error(
                        `${iso3} ${year.year}: no ${pillar} aid, where profiles.json holds ${year[pillar]}`,
                    );
                }
            }
        }

        const flows = official.get(iso3) ?? new Map<number, number>();
        const [total, adaptation, mitigation] = climate.map(
            (each) => each.get(iso3) ?? new Map<number, number>(),
        );
        const split = climateSplit(iso3, total!, adaptation!, mitigation!);

        return {
            ...context,
            pillars: [...oda.keys()]
                .toSorted((a, b) => a - b)
                .map((year): PillarYear => ({
                    year,
                    development: money(
                        oda.get(year)! - (humanitarian.get(year) ?? 0) - (peace.get(year) ?? 0),
                    ),
                    humanitarian: money(humanitarian.get(year) ?? 0),
                    peace: money(peace.get(year) ?? 0),
                })),
            flows: context.flows.map((flow) => {
                const value = oda.get(flow.year);

                return {
                    ...flow,
                    oda: value === undefined ? null : money(value),
                    oof: money(flows.get(flow.year) ?? 0),
                };
            }),
            donors: largest(given.get(iso3) ?? new Map(), live.providers, change),
            climate: split,
        };
    });

    const tiers = new Map(committed.contexts.map(({ iso3, tier }) => [iso3, tier]));

    return { contexts, groups: groupDonors(given, tiers, live.providers, change) };
};

/** Climate finance in 2024 split into adaptation only, mitigation only and both, as
 *  fetch.py's `climate_split` makes it. */
const climateSplit = (
    iso3: string,
    total: Yearly,
    adaptation: Yearly,
    mitigation: Yearly,
): ClimateSplit | null => {
    const all = total.get(CLIMATE_YEAR) ?? 0;

    if (all <= 0) {
        return null;
    }

    const onlyAdaptation = adaptation.get(CLIMATE_YEAR) ?? 0;
    const onlyMitigation = mitigation.get(CLIMATE_YEAR) ?? 0;
    const split = {
        adaptation: money(onlyAdaptation),
        mitigation: money(onlyMitigation),
        both: money(all - onlyAdaptation - onlyMitigation),
    };

    if (Object.values(split).some((value) => value < 0)) {
        throw new Error(`climate finance ${iso3} ${CLIMATE_YEAR}: a part is negative`);
    }

    return { year: CLIMATE_YEAR, ...split };
};

/** Each group's six largest providers in 2024: each provider's sums to the contexts of a tier,
 *  added up per group, as fetch.py's `group_donors` adds DFO's sums by provider per read and
 *  tier. The sums are whole dollars, so the order does not change them. */
const groupDonors = (
    given: ReadonlyMap<string, ReadonlyMap<string, number>>,
    tiers: ReadonlyMap<string, string>,
    providers: Record<string, string>,
    change: ReadonlyMap<string, number>,
): Groups => {
    const byTier = new Map<string, Map<string, number>>(TIERS.map((tier) => [tier, new Map()]));

    for (const [iso3, values] of given) {
        const tier = tiers.get(iso3);
        const totals = tier === undefined ? undefined : byTier.get(tier);

        if (totals === undefined) {
            throw new Error(`${iso3} has no tier`);
        }

        for (const [provider, value] of values) {
            totals.set(provider, (totals.get(provider) ?? 0) + value);
        }
    }

    const sum = (of: readonly string[]) => {
        const totals = new Map<string, number>();

        for (const tier of of) {
            for (const [provider, value] of byTier.get(tier)!) {
                totals.set(provider, (totals.get(provider) ?? 0) + value);
            }
        }

        return { donors: largest(totals, providers, change) };
    };

    return { all: sum(TIERS), extreme: sum(['extreme']), high: sum(['high']) };
};
