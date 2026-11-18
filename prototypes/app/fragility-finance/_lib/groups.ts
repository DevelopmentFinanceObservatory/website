// Sums over a scope's contexts, each with the number of contexts it covers. A share or
// ratio counts only the contexts that hold both its numerator and its denominator.
import type { Context, DonorShare, GroupKey, Groups } from '../_data/types.ts';

import {
    DEBT_YEARS,
    FLOW_YEARS,
    flowAt,
    IN_ARREARS,
    inIds,
    LAST_PAID_YEAR,
    PILLAR_YEARS,
    pillarAt,
    yearsFrom,
} from './profile.ts';
import { findContext, groupContexts, groupLabel, scopeContexts, type Scope } from './scope.ts';

/** A figure summed over a set of contexts, and how many of them hold it. */
export type Covered = { value: number | null; count: number };

/**
 * How a group's time series is summed. `balanced`: only the contexts that hold every year
 * of the window, so the line moves only with money. `held`: every figure held, so the
 * count can change from year to year.
 */
export type Coverage = 'balanced' | 'held';

/** A balanced panel is used when it leaves out less than this share of the latest year. */
export const BALANCED_PANEL_MAX_LOSS = 0.05;

/** A time series for a scope. A year that no context holds is null. */
export type SummedSeries = {
    years: number[];
    values: (number | null)[];
    /** The contexts summed in each year. */
    counts: number[];
    coverage: Coverage;
    /**
     * The share of the last year's total, over the contexts holding that year, that the
     * balanced panel leaves out. 0 for a single context.
     */
    balancedLoss: number;
};

type Panel<K extends string> = Omit<SummedSeries, 'values'> & {
    values: Record<K, (number | null)[]>;
};

const sumOf = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0);

/**
 * Sums `keys` over `contexts` by year. With `allowBalanced`, the coverage is chosen from the
 * data: the balanced panel when it loses under BALANCED_PANEL_MAX_LOSS of the last year's
 * total, otherwise every figure held. The keys share one panel, so they stay a partition.
 */
const panelSum = <K extends string>(
    contexts: readonly Context[],
    years: readonly number[],
    keys: readonly K[],
    pick: (context: Context, year: number) => Record<K, number> | null,
    allowBalanced: boolean,
): Panel<K> => {
    const rows = contexts.map((context) => years.map((year) => pick(context, year)));
    const total = (row: Record<K, number>) => sumOf(keys.map((key) => row[key]));
    const lastIndex = years.length - 1;
    const balanced = rows.filter((row) => row.every((cell) => cell !== null));
    const heldLast = sumOf(rows.flatMap((row) => (row[lastIndex] ? [total(row[lastIndex])] : [])));
    const balancedLast = sumOf(balanced.map((row) => (row[lastIndex] ? total(row[lastIndex]) : 0)));
    let balancedLoss = 0;

    if (allowBalanced) {
        balancedLoss =
            balanced.length === 0
                ? 1
                : heldLast === 0
                  ? 0
                  : Math.abs(heldLast - balancedLast) / Math.abs(heldLast);
    }

    const coverage: Coverage =
        allowBalanced && balancedLoss < BALANCED_PANEL_MAX_LOSS ? 'balanced' : 'held';
    const members = coverage === 'balanced' ? balanced : rows;
    const counts = years.map((_, index) => members.filter((row) => row[index] !== null).length);
    const values = Object.fromEntries(
        keys.map((key) => [
            key,
            years.map((_, index) =>
                counts[index] === 0 ? null : sumOf(members.map((row) => row[index]?.[key] ?? 0)),
            ),
        ]),
    ) as Record<K, (number | null)[]>;

    return { years: [...years], values, counts, coverage, balancedLoss };
};

export type FlowKey = 'oda' | 'oof' | 'remittances' | 'fdi' | 'debtService';

export const FLOW_KEYS: readonly FlowKey[] = ['oda', 'oof', 'remittances', 'fdi', 'debtService'];

/**
 * ODA, OOF, remittances, net FDI and debt service, 2015 to 2024, for a scope: a context's own
 * figures, or a group's sums with the coverage chosen per series.
 */
export const scopeFlows = (
    contexts: readonly Context[],
    scope: Scope,
): Record<FlowKey, SummedSeries> => {
    const members = scopeContexts(contexts, scope);
    const years = yearsFrom(FLOW_YEARS.first, FLOW_YEARS.last);

    return Object.fromEntries(
        FLOW_KEYS.map((key) => {
            const panel = panelSum(
                members,
                years,
                ['value'] as const,
                (context, year) => {
                    const value = flowAt(context, year)?.[key] ?? null;

                    return value === null ? null : { value };
                },
                scope.kind === 'group',
            );

            return [key, { ...panel, values: panel.values.value }];
        }),
    ) as Record<FlowKey, SummedSeries>;
};

export type PillarKey = 'development' | 'humanitarian' | 'peace';

export const PILLAR_KEYS: readonly PillarKey[] = ['development', 'humanitarian', 'peace'];

/** Gross ODA by pillar, 2015 to 2024; one coverage for the three, chosen on their total. */
export type SummedPillars = Panel<PillarKey>;

export const scopePillars = (contexts: readonly Context[], scope: Scope): SummedPillars =>
    panelSum(
        scopeContexts(contexts, scope),
        yearsFrom(PILLAR_YEARS.first, PILLAR_YEARS.last),
        PILLAR_KEYS,
        (context, year) => pillarAt(context, year) ?? null,
        scope.kind === 'group',
    );

/** Sums `pick` over the contexts that hold it. */
const covered = (
    contexts: readonly Context[],
    pick: (context: Context) => number | null | undefined,
): Covered => {
    const held = contexts.map(pick).filter((value) => value !== null && value !== undefined);

    return { value: held.length === 0 ? null : sumOf(held), count: held.length };
};

/** Population in `year`, summed over the contexts that hold it. */
export const totalPopulation = (contexts: readonly Context[], year: number): Covered =>
    covered(contexts, (context) => context.population[String(year)]);

/** One year of the debt chart: ODA to 2024, debt service paid to 2025, then scheduled. */
export type DebtPoint = {
    year: number;
    oda: number | null;
    debt: number | null;
    scheduled: boolean;
};

export type DebtView = {
    points: DebtPoint[];
    /** The contexts both lines are summed over: those IDS covers, less those in arrears. */
    iso3s: string[];
    /** False for a context outside IDS: the chart draws ODA alone. */
    covered: boolean;
};

/** A group's contexts that IDS covers, without those in arrears. */
export const debtContexts = (contexts: readonly Context[], key: GroupKey): Context[] =>
    groupContexts(contexts, key).filter(
        (context) => inIds(context) && !IN_ARREARS.has(context.iso3),
    );

/** True where `context` holds debt service in every year of the debt chart. */
const holdsEveryDebtYear = (context: Context): boolean =>
    yearsFrom(DEBT_YEARS.first, DEBT_YEARS.last).every((year) =>
        context.debtService.some((point) => point.year === year),
    );

/**
 * The debt chart for a scope, 2015 to 2033. A group sums ODA and debt service over a balanced
 * panel: the debtContexts that hold debt service in every year, so the lines move only with
 * money. A context shows its own figures, arrears included.
 */
export const scopeDebt = (contexts: readonly Context[], scope: Scope): DebtView => {
    const context = scope.kind === 'context' ? findContext(contexts, scope.iso3) : undefined;
    const members =
        scope.kind === 'group'
            ? debtContexts(contexts, scope.key).filter(holdsEveryDebtYear)
            : context === undefined
              ? []
              : [context];
    const points = yearsFrom(DEBT_YEARS.first, DEBT_YEARS.last).map((year) => {
        const debt = covered(
            members,
            (member) => member.debtService.find((point) => point.year === year)?.value,
        );
        const oda = covered(members, (member) => flowAt(member, year)?.oda);

        return {
            year,
            oda: oda.value,
            debt: debt.value,
            scheduled: year > LAST_PAID_YEAR,
        };
    });

    return {
        points,
        iso3s: members.map((member) => member.iso3),
        covered: context === undefined ? members.length > 0 : inIds(context),
    };
};

/** Climate finance in 2024 by objective, summed over the contexts with any recorded. */
export type ClimateTotals = {
    adaptation: number;
    mitigation: number;
    crossCutting: number;
    total: number;
    count: number;
};

export const climateTotals = (contexts: readonly Context[]): ClimateTotals => {
    const held = contexts.flatMap((context) => (context.climate === null ? [] : [context.climate]));
    const adaptation = sumOf(held.map((split) => split.adaptation));
    const mitigation = sumOf(held.map((split) => split.mitigation));
    const crossCutting = sumOf(held.map((split) => split.both));

    return {
        adaptation,
        mitigation,
        crossCutting,
        total: adaptation + mitigation + crossCutting,
        count: held.length,
    };
};

export type ClimateBar = { label: string; totals: ClimateTotals };

/**
 * The climate chart's two bars: the scope against all 62, or the two tiers when all 62 is
 * the scope.
 */
export const climateBars = (contexts: readonly Context[], scope: Scope): ClimateBar[] => {
    const bar = (key: GroupKey): ClimateBar => ({
        label: groupLabel(contexts, key),
        totals: climateTotals(groupContexts(contexts, key)),
    });

    if (scope.kind === 'group' && scope.key === 'all') {
        return [bar('extreme'), bar('high')];
    }

    const first =
        scope.kind === 'group'
            ? bar(scope.key)
            : {
                  label: findContext(contexts, scope.iso3)?.name ?? scope.iso3,
                  totals: climateTotals(scopeContexts(contexts, scope)),
              };

    return [first, bar('all')];
};

/** The donor list keeps six row slots, so the cards below never move. */
export const DONOR_SLOTS = 6;

/**
 * The six largest providers of ODA to the scope in 2024, largest first, from groups.json for
 * a group and from the context's own donors otherwise. Empty slots are null.
 */
export const scopeDonors = (
    contexts: readonly Context[],
    groups: Groups,
    scope: Scope,
): (DonorShare | null)[] => {
    const donors =
        scope.kind === 'group'
            ? groups[scope.key].donors
            : (findContext(contexts, scope.iso3)?.donors ?? []);

    return Array.from({ length: DONOR_SLOTS }, (_, index) => donors[index] ?? null);
};
