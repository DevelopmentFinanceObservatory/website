// The figures _data/fetch.py has DFO compute, read again in the browser on DFO's newest stored
// data: each pillar's total and the total ODA and OOF per context and year, the six largest
// providers per context and per tier, climate finance per context, and each DAC member's
// change in 2025. `recipes` builds the step's recipes from refs.json and live.json, and
// `figuresFromRows` repeats the step's small arithmetic on their rows. Every other figure on
// the page stays as profiles.json holds it.
import { DatasetRef, recipe } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

import type { ClimateSplit, Context, DonorShare, Groups, PillarYear } from '../_data/types.ts';

import type { Recipe } from '#lib/liveRead.ts';

/** What _data/live.json holds: the recipients of each CRS read, the labels of each pillar's
 *  purpose codes, and each CRS provider's label by code. */
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
const PURPOSE_FILTER = 'stat_var_crsPurpose';
const TIERS = ['extreme', 'high'] as const;
const PILLARS = ['humanitarian', 'peace'] as const;
const CLIMATE_READS = ['climate-total', 'climate-adaptation', 'climate-mitigation'] as const;
const CHANGE_READS = ['donors2025', 'donors2025-eu'] as const;

/** A value by year. */
type Yearly = Map<number, number>;

/**
 * The step's recipes, keyed as fetch.py's `figures` keys them, such as `aid-1/humanitarian`,
 * in the same order: each CRS aid read's total, pillars, ranking per recipient and sums by
 * provider per tier, each OOF read's total, the DAC1 change and the climate totals.
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
    const found: Record<string, Recipe> = {};

    for (const [key, places] of Object.entries(live.groups)) {
        found[`${key}/total`] = start(key).aggregate({ by: 'destination' });

        for (const pillar of PILLARS) {
            found[`${key}/${pillar}`] = start(key)
                .filter({ keep: { [PURPOSE_FILTER]: live.purposes[pillar] } })
                .aggregate({ by: 'destination' });
        }

        found[`${key}/donors`] = start(key).rank({
            by: 'origin',
            per: 'destination',
            window: [DONOR_YEAR, DONOR_YEAR],
            how: 'sum',
            limit: TOP_DONORS,
        });
        const held = [...new Set(places.map((place) => tierOf(tiers, place)))].toSorted();

        for (const tier of held) {
            const of = places.filter((place) => tierOf(tiers, place) === tier);
            const chain =
                held.length > 1 ? start(key).filter({ keep: { destination: of } }) : start(key);

            found[`${key}/${tier}`] = chain.aggregate({ by: 'origin' });
        }
    }

    for (const key of Object.keys(live.groups)) {
        const oof = key.replace(/^aid-/, 'oof-');

        found[`${oof}/total`] = start(oof).aggregate({ by: 'destination' });
    }

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

const tierOf = (tiers: ReadonlyMap<string, string>, place: string) => {
    const tier = tiers.get(place);

    if (tier === undefined) {
        throw new Error(`${place} has no tier`);
    }

    return tier;
};

/** Python's `round`, which takes a half to the even neighbour, so the page's dollars match the
 *  step's. */
export const money = (value: number): number => {
    const floor = Math.floor(value);
    const fraction = value - floor;

    if (fraction === 0.5) {
        return floor % 2 === 0 ? floor : floor + 1;
    }

    return Math.round(value);
};

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
                change2025: moved === undefined ? null : Number(moved.toFixed(4)),
            };
        });

/**
 * The page's figures from the rows of `recipes`: `committed` with each context's pillars,
 * ODA, OOF, donors and climate split, and each group's donors, replaced by what the rows give.
 *
 * @throws When a humanitarian or peace pillar comes back empty for a context and year that
 *   profiles.json holds above zero, which a purpose label that no longer names a code would
 *   cause, or when a provider has no label in live.json, so the page keeps its committed
 *   figures.
 */
export const figuresFromRows = (
    rows: Record<string, Row[]>,
    committed: Figures,
    live: LiveInputs,
): Figures => {
    const reads = Object.keys(live.groups);
    const summed = (figure: string, read = (key: string) => key) =>
        joined(reads.map((key) => byPlace(rowsOf(rows, `${read(key)}/${figure}`), RECIPIENT)));
    const totals = summed('total');
    const pillars = {
        humanitarian: summed('humanitarian'),
        peace: summed('peace'),
    };
    const official = summed('total', (key) => key.replace(/^aid-/, 'oof-'));
    const climate = CLIMATE_READS.map((key) => byPlace(rowsOf(rows, `${key}/total`), RECIPIENT));
    const change = new Map<string, number>();

    for (const key of CHANGE_READS) {
        for (const row of rowsOf(rows, `${key}/change`)) {
            const value = numberOf(row);

            if (value !== null) {
                change.set(String(row[PROVIDER]), value);
            }
        }
    }

    const ranked = new Map<string, Map<string, number>>();

    for (const key of reads) {
        for (const row of rowsOf(rows, `${key}/donors`)) {
            const value = numberOf(row);

            if (value !== null) {
                const iso3 = String(row[RECIPIENT]).replace(/^country\//, '');
                const values = ranked.get(iso3) ?? new Map<string, number>();

                values.set(String(row[PROVIDER]), value);
                ranked.set(iso3, values);
            }
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

    return { contexts, groups: groupDonors(rows, reads, live.providers, change) };
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

/** Each group's six largest providers in 2024, summed over each read's sums by provider for
 *  a tier, in fetch.py's order so the sums match to the dollar. */
const groupDonors = (
    rows: Record<string, Row[]>,
    reads: readonly string[],
    providers: Record<string, string>,
    change: ReadonlyMap<string, number>,
): Groups => {
    const byTier = new Map<string, Map<string, number>>(TIERS.map((tier) => [tier, new Map()]));

    for (const key of reads) {
        for (const tier of TIERS) {
            for (const row of rows[`${key}/${tier}`] ?? []) {
                const value = numberOf(row);

                if (value !== null && Number(row.time_period) === DONOR_YEAR) {
                    const totals = byTier.get(tier)!;
                    const provider = String(row[PROVIDER]);

                    totals.set(provider, (totals.get(provider) ?? 0) + value);
                }
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
