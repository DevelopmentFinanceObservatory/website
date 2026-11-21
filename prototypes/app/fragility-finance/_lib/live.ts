// The figures _data/fetch.py has DFO compute, read again in the browser on DFO's newest stored
// data: each pillar's total and the total ODA and OOF per context and year, the six largest
// providers per context and per tier, climate finance per context, and each DAC member's
// change in 2025. `recipes` builds the step's recipes from refs.json and live.json, and
// `figuresFromRows` repeats the step's small arithmetic on their rows and refuses figures that
// fail the step's `check`. Every other figure on the page, such as remittances, FDI, debt
// service, population and the indicators, stays as profiles.json holds it. live.test.mts checks
// both against the trees and rows the step writes to _data/live-fixture.json.
//
// The pillar guard refuses a pillar that comes back empty for a context and year. If one of a
// pillar's labels stops matching in a newer stored version while the others match, as a
// relabelled purpose code would, that code's money moves to development and the guard passes.
// The step's `pillar_purposes` reads the labels afresh, so its next run catches the relabel.
import { DatasetRef, recipe } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

import type { ClimateSplit, Context, DonorShare, Groups, PillarYear } from '../_data/types.ts';

import type { Recipe } from '#lib/liveRead.ts';
import { pythonRound } from '#lib/round.ts';

/** What _data/live.json holds: the labels of each pillar's purpose codes, and each CRS
 *  provider's label by code. */
export type LiveInputs = {
    purposes: { humanitarian: string[]; peace: string[] };
    providers: Record<string, string>;
};

export type Figures = { contexts: Context[]; groups: Groups };

const DONOR_YEAR = 2024;
const CLIMATE_YEAR = 2024;
const TOP_DONORS = 6;
const RECIPIENT = 'financingRecipient';
const PROVIDER = 'financingProvider';
const PURPOSE_FILTER = 'stat_var_crsPurpose';
const TIERS = ['extreme', 'high'] as const;
const PILLARS = ['humanitarian', 'peace'] as const;
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
 * The step's recipes, keyed as fetch.py's `figures` keys them, such as `aid/humanitarian`, in
 * the same order: the CRS aid read's total, pillars, ranking per recipient and sums by provider
 * per tier, the OOF read's total, the DAC1 change and the climate totals. `tiers` gives each
 * recipient's tier, in the order each tier's filter lists them.
 */
export const recipes = (
    refs: Record<string, { ref: unknown }>,
    live: LiveInputs,
    tiers: ReadonlyMap<string, string>,
): Record<string, Recipe> => {
    const start = (key: string) => {
        const source = refs[key];

        if (source === undefined) {
            throw new Error(`refs.json holds no ${key}`);
        }

        return recipe(DatasetRef.fromJSON(source.ref));
    };
    const found: Record<string, Recipe> = {
        'aid/total': start('aid').aggregate({ by: 'destination' }),
    };

    for (const pillar of PILLARS) {
        found[`aid/${pillar}`] = start('aid')
            .filter({ keep: { [PURPOSE_FILTER]: live.purposes[pillar] } })
            .aggregate({ by: 'destination' });
    }

    found['aid/donors'] = start('aid').rank({
        by: 'origin',
        per: 'destination',
        window: [DONOR_YEAR, DONOR_YEAR],
        how: 'sum',
        limit: TOP_DONORS,
    });

    for (const tier of [...new Set(tiers.values())].toSorted()) {
        const places = [...tiers].filter(([, held]) => held === tier).map(([place]) => place);

        found[`aid/${tier}`] = start('aid')
            .filter({ keep: { destination: places } })
            .aggregate({ by: 'origin' });
    }

    found['oof/total'] = start('oof').aggregate({ by: 'destination' });

    for (const key of CHANGE_READS) {
        found[`${key}/change`] = start(key).growth({
            by: 'origin',
            window: [DONOR_YEAR, DONOR_YEAR + 1],
        });
    }

    for (const key of CLIMATE_READS) {
        found[`${key}/total`] = start(key).aggregate({ by: 'destination' });
    }

    return found;
};

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
 * The page's figures from the rows of `recipes`: `committed` with each context's pillars,
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
    const summed = (key: string) => byPlace(rowsOf(rows, key), RECIPIENT);
    const totals = summed('aid/total');
    const pillars = {
        humanitarian: summed('aid/humanitarian'),
        peace: summed('aid/peace'),
    };
    const official = summed('oof/total');
    const climate = CLIMATE_READS.map((key) => byPlace(rowsOf(rows, `${key}/total`), RECIPIENT));
    const change = new Map<string, number>();

    for (const key of CHANGE_READS) {
        for (const row of rowsOf(rows, `${key}/change`)) {
            const value = numberOf(row);

            // A change from a zero base is infinite or NaN, and the step leaves it out.
            if (value !== null && Number.isFinite(value)) {
                change.set(String(row[PROVIDER]), value);
            }
        }
    }

    const ranked = new Map<string, Map<string, number>>();

    for (const row of rowsOf(rows, 'aid/donors')) {
        const value = numberOf(row);

        if (value !== null) {
            const iso3 = String(row[RECIPIENT]).replace(/^country\//, '');
            const values = ranked.get(iso3) ?? new Map<string, number>();

            values.set(String(row[PROVIDER]), value);
            ranked.set(iso3, values);
        }
    }

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
            donors: largest(ranked.get(iso3) ?? new Map(), live.providers, change),
            climate: split,
        };
    });

    return { contexts, groups: groupDonors(rows, live.providers, change) };
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

/** Each group's six largest providers in 2024, from the sums by provider for each tier, added
 *  in fetch.py's order so the sums match to the dollar. */
const groupDonors = (
    rows: Record<string, Row[]>,
    providers: Record<string, string>,
    change: ReadonlyMap<string, number>,
): Groups => {
    const byTier = new Map<string, Map<string, number>>(TIERS.map((tier) => [tier, new Map()]));

    for (const tier of TIERS) {
        for (const row of rows[`aid/${tier}`] ?? []) {
            const value = numberOf(row);

            if (value !== null && Number(row.time_period) === DONOR_YEAR) {
                const totals = byTier.get(tier)!;
                const provider = String(row[PROVIDER]);

                totals.set(provider, (totals.get(provider) ?? 0) + value);
            }
        }
    }

    const sum = (tiers: readonly string[]) => {
        const totals = new Map<string, number>();

        for (const tier of tiers) {
            for (const [provider, value] of byTier.get(tier)!) {
                totals.set(provider, (totals.get(provider) ?? 0) + value);
            }
        }

        return { donors: largest(totals, providers, change) };
    };

    return { all: sum(TIERS), extreme: sum(['extreme']), high: sum(['high']) };
};
