// The page's figures, which the build reads from DFO (_data/build.ts) and derives here from the
// rows: each context's ODA by pillar, OOF, remittances, FDI, debt service, donors, climate
// split, population and living-conditions indicators, and each group's donors. The contexts,
// their tiers and their ranks come from the OECD's classification (./classification.ts).
//
// `sources` reads each CRS aid read through two recipes: a sum by recipient and purpose, which
// gives the total and, by purpose code, each pillar, and 2024 by provider and recipient, from
// which the page ranks each context's donors and sums each tier's. Neither filters by purpose,
// so neither takes DFO's slower path for a sum of selected purposes. It also reads each aid
// read's rows, whose `financingProvider_label` column names each provider, since a recipe's
// rows carry no labels. Climate finance takes three recipes, since its values hold cents and
// the page's sums must round as DFO's do. Every other read comes as rows, summed here; CRS,
// DAC1 and OOF values are whole dollars, so those sums do not depend on the order they run in.
// The recipients of each CRS read come from its ref's definition in refs.json.
//
// `figuresFromRows` refuses figures that break a structural check (`FiguresCheck`), so a
// broken read fails the build. The checks hold coverage and closed-year values, not totals,
// which move with every revision of the sources.
import { DatasetRef, recipe } from '@developmentfinance/client';
import { isDerived, type Row } from '@developmentfinance/client/types';

import type {
    ClimateSplit,
    Context,
    DebtYear,
    DonorShare,
    FlowYear,
    Groups,
    IndicatorKey,
    PillarYear,
    Reading,
} from '../_data/types.ts';

import type { Profile } from './classification.ts';
import { FLOW_YEARS, LAST_PAID_YEAR, yearsFrom } from './profile.ts';

import type { LiveSource } from '#lib/liveRead.ts';
import { recordOf } from '#lib/record.ts';
import { pythonRound } from '#lib/round.ts';

export type Figures = { contexts: Context[]; groups: Groups };

/** refs.json's `data`: each read's ref by key. */
export type Refs = Record<string, { ref: unknown }>;

const DONOR_YEAR = 2024;
const CLIMATE_YEAR = 2024;
const TOP_DONORS = 6;
const RECIPIENT = 'financingRecipient';
const PROVIDER = 'financingProvider';
const PLACE = 'observationAbout';
/** The column a sum by purpose holds a CRS read's purpose codes in. */
const PURPOSE_COLUMN = 'stat_var_crsPurpose';
const PURPOSE_CODE = 'CRSPurposeCode';
const TIERS = ['extreme', 'high'] as const;
const PILLARS = ['humanitarian', 'peace'] as const;
/** The OECD's pillars by purpose code (States of Fragility 2025, Annex A, Tables A.1 and
 *  A.2). Every other code is development. */
const PILLAR_CODES: Record<(typeof PILLARS)[number], ReadonlySet<number>> = {
    humanitarian: new Set([72010, 72040, 72050, 73010, 74020]),
    peace: new Set([
        15210, 15220, 15230, 15240, 15250, 15261, 15110, 15111, 15112, 15113, 15130, 15150, 15152,
        15153, 15160, 15170, 15180, 15190,
    ]),
};
const CLIMATE_READS = ['climate-total', 'climate-adaptation', 'climate-mitigation'] as const;
const CHANGE_READS = ['donors2025', 'donors2025-eu'] as const;
/** The reads keyed by place in `observationAbout`. */
const FLOW_READS = ['remittances', 'fdi'] as const;
const INDICATORS: readonly IndicatorKey[] = ['stunting', 'water', 'dtp3'];
const POPULATION = 'population';
/** Public external debt service, keyed by recipient. */
const DEBT = 'debtService';
/** The CRS aid reads in refs.json, each with an OOF read of the same recipients. */
const AID_READ = /^aid-\d+$/;

/** The structural checks: how many of the 62 contexts must have aid, debt service and
 *  population, and the range of OOF in `DONOR_YEAR` and how many contexts must receive some. */
const MIN_CONTEXTS_WITH_AID = 60;
const MIN_CONTEXTS_WITH_DEBT = 45;
const MIN_CONTEXTS_WITH_POPULATION = 60;
const OOF_RANGE = [15e9, 20e9] as const;
const MIN_CONTEXTS_WITH_OOF = 50;
/** Debt service paid in closed years, as DFO gave it. A read that moves one by more than
 *  `KNOWN_TOLERANCE` fails the build, so a change in the source is seen before it reaches the
 *  page. Each year is at most `LAST_PAID_YEAR`; later years are projections, which move. */
export const KNOWN: readonly { iso3: string; year: number; value: number }[] = [
    { iso3: 'MOZ', year: 2024, value: 916_663_899.7 },
];
const KNOWN_TOLERANCE = 0.01;

/** A value by year. */
type Yearly = Map<number, number>;

const refOf = (refs: Refs, key: string): unknown => {
    const source = refs[key];

    if (source === undefined) {
        throw new Error(`refs.json holds no ${key}`);
    }

    return source.ref;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** The places a read's single member binds to `role`, from its spec's definition.
 *  @throws When the ref holds other than one member or the definition binds no places. */
const placesOf = (refs: Refs, key: string, role: string): string[] => {
    const { members } = DatasetRef.fromJSON(refOf(refs, key));
    const [member] = members;
    const identity =
        member === undefined || isDerived(member) ? undefined : member.spec.definition.identity;
    const entities = isRecord(identity) ? identity.entities : undefined;
    const places = isRecord(entities) ? entities[role] : undefined;

    if (
        members.length !== 1 ||
        !Array.isArray(places) ||
        places.length === 0 ||
        !places.every((place) => typeof place === 'string')
    ) {
        throw new Error(`refs.json: ${key} binds no ${role} in one member's definition`);
    }

    return places;
};

/**
 * The recipients of each CRS aid read, as its ref's definition binds them, keyed by the read.
 *
 * @throws When a context of `profiles` is in no aid read or in two, an aid read holds a
 *   recipient outside `profiles`, or an OOF read's recipients differ from its aid read's.
 */
export const recipientGroups = (
    refs: Refs,
    profiles: readonly Profile[],
): Record<string, string[]> => {
    const reads = Object.keys(refs).filter((key) => AID_READ.test(key));
    const groups = recordOf(reads, (key) => placesOf(refs, key, 'destination'));
    const held = Object.values(groups).flat();
    const expected = new Set(profiles.map(({ iso3 }) => `country/${iso3}`));

    if (
        held.length !== expected.size ||
        new Set(held).size !== held.length ||
        !held.every((place) => expected.has(place))
    ) {
        throw new Error(
            'refs.json: the CRS aid reads do not hold each fragile context exactly once',
        );
    }

    for (const key of reads) {
        const oof = placesOf(refs, oofOf(key), 'destination');

        if (oof.toSorted().join() !== groups[key]!.toSorted().join()) {
            throw new Error(`refs.json: ${oofOf(key)} holds other recipients than ${key}`);
        }
    }

    return groups;
};

/**
 * What the build reads, by key: per CRS aid read `aid-N`, the recipes `aid-N/purposes` and
 * `aid-N/providers` and its rows as `aid-N`, for the providers' labels; the climate recipes,
 * keyed as `climate-total/total`; and every other read as rows under its key in refs.json, such
 * as `oof-1` or `population`.
 */
export const sources = (
    refs: Refs,
    groups: Record<string, readonly string[]>,
): Record<string, LiveSource> => {
    const start = (key: string) => recipe(DatasetRef.fromJSON(refOf(refs, key)));
    const reads = Object.keys(groups);
    const found: Record<string, LiveSource> = {};

    for (const key of reads) {
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

    const rowReads = [
        ...reads,
        ...reads.map(oofOf),
        ...CHANGE_READS,
        ...FLOW_READS,
        DEBT,
        POPULATION,
        ...INDICATORS,
    ];

    for (const key of rowReads) {
        found[key] = { ref: refOf(refs, key) };
    }

    return found;
};

/** The OOF read of the same recipients as the CRS aid read `key`. */
const oofOf = (key: string) => key.replace(/^aid-/, 'oof-');

/** Python's `round` to the dollar, which takes a half to the even neighbour and gives no
 *  negative zero. */
export const money = (value: number): number => pythonRound(value) + 0;

const numberOf = (row: Row): number | null => {
    const value = row.value;

    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
};

/** Each place's value in each year, keyed by ISO3 code, summed over any other columns. A year
 *  whose values are all null is left out. */
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
 *  that is not finite, which a zero base gives, is left out. */
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

/**
 * Each provider's label by code, from the `financingProvider_label` column of the aid reads'
 * rows.
 *
 * @throws When the rows give a provider two labels.
 */
export const providerLabels = (rows: readonly Row[]): Map<string, string> => {
    const labels = new Map<string, string>();
    const column = `${PROVIDER}_label`;

    for (const row of rows) {
        const code = String(row[PROVIDER]);
        const label = row[column];

        if (typeof label !== 'string' || label === '') {
            continue;
        }

        const held = labels.get(code);

        if (held !== undefined && held !== label) {
            throw new Error(`provider ${code} has the labels ${held} and ${label}`);
        }

        labels.set(code, label);
    }

    return labels;
};

const rowsOf = (rows: Record<string, Row[]>, key: string): Row[] => {
    const found = rows[key];

    if (found === undefined) {
        throw new Error(`no rows for ${key}`);
    }

    return found;
};

/** The `TOP_DONORS` largest providers of `totals`, those above zero, largest first.
 *  @throws When one of them has no label in `labels`. */
const largest = (
    totals: ReadonlyMap<string, number>,
    labels: ReadonlyMap<string, string>,
    change: ReadonlyMap<string, number>,
): DonorShare[] =>
    [...totals]
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, TOP_DONORS)
        .filter(([, value]) => value > 0)
        .map(([provider, value]) => {
            const name = labels.get(provider);

            if (name === undefined) {
                throw new Error(`the aid reads give no label for the provider ${provider}`);
            }

            const moved = change.get(provider);

            return {
                name,
                value: money(value),
                change2025: moved === undefined ? null : pythonRound(moved, 4),
            };
        });

/** A value in money, or null where none is held. */
const moneyOrNull = (value: number | undefined): number | null =>
    value === undefined ? null : money(value);

/** The latest year's value, rounded to two places, or null where none is held. */
const latest = (values: Yearly | undefined): Reading | null => {
    if (values === undefined || values.size === 0) {
        return null;
    }

    const year = Math.max(...values.keys());

    return { year, value: pythonRound(values.get(year)!, 2) };
};

/**
 * A structural check the figures break: fewer than `MIN_CONTEXTS_WITH_AID` contexts with aid,
 * `MIN_CONTEXTS_WITH_DEBT` with debt service or `MIN_CONTEXTS_WITH_POPULATION` with
 * population, a value of `KNOWN` that moved, a group without `TOP_DONORS` donors, the six
 * largest donors to all contexts giving more than all ODA in `DONOR_YEAR`, or OOF in
 * `DONOR_YEAR` outside `OOF_RANGE` or above zero in fewer than `MIN_CONTEXTS_WITH_OOF`
 * contexts.
 */
export type FiguresCheck =
    | 'contexts_without_aid'
    | 'contexts_without_debt_service'
    | 'contexts_without_population'
    | 'known_value_moved'
    | 'group_short_of_donors'
    | 'donors_above_oda'
    | 'oof_out_of_range';

/** The figures break a structural check, so the build stops. */
export class FiguresCheckError extends Error {
    readonly checks: readonly FiguresCheck[];

    constructor(checks: readonly FiguresCheck[]) {
        super(`The figures break the build's checks: ${checks.join(', ')}`);
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
    const moved = KNOWN.some(({ iso3, year, value }) => {
        const found = contexts
            .find((context) => context.iso3 === iso3)
            ?.debtService.find((each) => each.year === year)?.value;

        return found === undefined || Math.abs(found - value) > KNOWN_TOLERANCE * value;
    });
    const problems: [FiguresCheck, boolean][] = [
        [
            'contexts_without_aid',
            contexts.filter(({ pillars }) => pillars.length > 0).length < MIN_CONTEXTS_WITH_AID,
        ],
        [
            'contexts_without_debt_service',
            contexts.filter(({ debtService }) => debtService.length > 0).length <
                MIN_CONTEXTS_WITH_DEBT,
        ],
        [
            'contexts_without_population',
            contexts.filter(({ population }) => Object.keys(population).length > 0).length <
                MIN_CONTEXTS_WITH_POPULATION,
        ],
        ['known_value_moved', moved],
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
 * The page's figures from the rows of `sources`, for the contexts of `profiles`, once they
 * pass the structural checks (`FiguresCheck`).
 *
 * @throws {FiguresCheckError} When the figures break a check.
 * @throws As `deriveFigures`.
 */
export const figuresFromRows = (
    rows: Record<string, Row[]>,
    profiles: readonly Profile[],
    groups: Record<string, readonly string[]>,
): Figures => {
    const figures = deriveFigures(rows, profiles, groups);
    const broken = figureProblems(figures);

    if (broken.length > 0) {
        throw new FiguresCheckError(broken);
    }

    return figures;
};

/**
 * `figuresFromRows` without the structural checks, whose thresholds hold only for all 62
 * contexts, so a test can derive figures from a few.
 *
 * @throws When rows are missing for a source, a purpose is not a CRS purpose code, a recipient
 *   is in two CRS reads, a climate part is negative, a provider among the largest has no
 *   label, or a provider has two.
 */
export const deriveFigures = (
    rows: Record<string, Row[]>,
    profiles: readonly Profile[],
    groups: Record<string, readonly string[]>,
): Figures => {
    const reads = Object.keys(groups);
    const purposes = reads.map((key) => rowsOf(rows, `${key}/purposes`));
    const totals = joined(purposes.map((part) => byPlace(part, RECIPIENT)));
    const pillars = byPillar(purposes);
    const official = joined(reads.map((key) => byPlace(rowsOf(rows, oofOf(key)), RECIPIENT)));
    const climate = CLIMATE_READS.map((key) => byPlace(rowsOf(rows, `${key}/total`), RECIPIENT));
    const change = changes(CHANGE_READS.flatMap((key) => rowsOf(rows, key)));
    const given = providersByPlace(reads.flatMap((key) => rowsOf(rows, `${key}/providers`)));
    const labels = providerLabels(reads.flatMap((key) => rowsOf(rows, key)));
    const [remittances, fdi] = FLOW_READS.map((key) => byPlace(rowsOf(rows, key), PLACE));
    const debt = byPlace(rowsOf(rows, DEBT), RECIPIENT);
    const population = byPlace(rowsOf(rows, POPULATION), PLACE);
    const indicators = recordOf(INDICATORS, (key) => byPlace(rowsOf(rows, key), PLACE));
    const none = new Map<number, number>();

    const contexts = profiles.map((profile): Context => {
        const { iso3 } = profile;
        const oda = totals.get(iso3) ?? none;
        const humanitarian = pillars.humanitarian.get(iso3) ?? none;
        const peace = pillars.peace.get(iso3) ?? none;
        const flows = official.get(iso3) ?? none;
        const remitted = remittances!.get(iso3) ?? none;
        const invested = fdi!.get(iso3) ?? none;
        const serviced = debt.get(iso3) ?? none;
        const [total, adaptation, mitigation] = climate.map((each) => each.get(iso3) ?? none);

        return {
            ...profile,
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
            flows: yearsFrom(FLOW_YEARS.first, FLOW_YEARS.last).map((year): FlowYear => ({
                year,
                oda: moneyOrNull(oda.get(year)),
                oof: money(flows.get(year) ?? 0),
                remittances: moneyOrNull(remitted.get(year)),
                fdi: moneyOrNull(invested.get(year)),
                debtService: moneyOrNull(serviced.get(year)),
            })),
            debtService: [...serviced]
                .toSorted(([a], [b]) => a - b)
                .map(([year, value]): DebtYear => ({
                    year,
                    value: money(value),
                    projected: year > LAST_PAID_YEAR,
                })),
            donors: largest(given.get(iso3) ?? new Map(), labels, change),
            climate: climateSplit(iso3, total!, adaptation!, mitigation!),
            population: Object.fromEntries(
                [...(population.get(iso3) ?? none)]
                    .toSorted(([a], [b]) => a - b)
                    .map(([year, value]) => [String(year), money(value)]),
            ),
            indicators: recordOf(INDICATORS, (key) => latest(indicators[key].get(iso3))),
        };
    });

    const tiers = new Map(profiles.map(({ iso3, tier }) => [iso3, tier]));

    return { contexts, groups: groupDonors(given, tiers, labels, change) };
};

/** Climate finance in 2024 split into adaptation only, mitigation only and both, both being
 *  the total less the other two.
 *  @throws When a part is negative, which would mean the series overlap or pass the total. */
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
 *  added up per group. The sums are whole dollars, so the order does not change them. */
const groupDonors = (
    given: ReadonlyMap<string, ReadonlyMap<string, number>>,
    tiers: ReadonlyMap<string, string>,
    labels: ReadonlyMap<string, string>,
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

        return { donors: largest(totals, labels, change) };
    };

    return { all: sum(TIERS), extreme: sum(['extreme']), high: sum(['high']) };
};
