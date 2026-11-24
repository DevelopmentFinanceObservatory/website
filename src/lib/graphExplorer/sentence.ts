/**
 * A dataset's patterns grouped by split combination, and each group read as
 * one sentence. The parts are text and term references, so a screen can
 * render each term as a link.
 */
import { count } from './counts.ts';
import { textFilter } from './lists.ts';
import type { Model } from './model.ts';
import type { SchemaPattern } from './wire.ts';

export type SentencePart =
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'term'; readonly id: string; readonly label: string };

/**
 * The patterns of a dataset that share a measurement qualifier, a set of
 * observation properties and a set of constraint properties: one split
 * combination.
 */
export type PatternGroup = {
    /** The qualifier and the two property sets, as a React key. */
    readonly key: string;
    readonly qualifier: string | null;
    /** In the order the group's largest pattern lists them. */
    readonly between: readonly string[];
    readonly split: readonly string[];
    readonly statVarCount: number;
    /** Most StatVars first. */
    readonly patterns: readonly SchemaPattern[];
    /** Each distinct term once, most StatVars first. */
    readonly measured: readonly string[];
    readonly populationTypes: readonly string[];
};

/** Ids most StatVars first, ties in the order first met. */
const byWeight = (weights: ReadonlyMap<string, number>): readonly string[] =>
    [...weights].sort((a, b) => b[1] - a[1]).map(([id]) => id);

/**
 * `patterns` grouped by measurement qualifier and the sets of observation
 * and constraint properties, most StatVars first, ties in the order first
 * met.
 */
export function patternGroups(patterns: readonly SchemaPattern[]): readonly PatternGroup[] {
    const grouped = new Map<string, [SchemaPattern, ...SchemaPattern[]]>();
    for (const pattern of patterns) {
        const key = JSON.stringify([
            pattern.measurement_qualifier,
            [...pattern.observation_properties].sort(),
            [...pattern.constraint_properties].sort(),
        ]);
        const members = grouped.get(key);
        if (members === undefined) grouped.set(key, [pattern]);
        else members.push(pattern);
    }
    const groups = [...grouped].map(([key, members]): PatternGroup => {
        const sorted = members.toSorted((a, b) => b.stat_var_count - a.stat_var_count);
        const measured = new Map<string, number>();
        const populations = new Map<string, number>();
        for (const pattern of sorted) {
            const n = pattern.stat_var_count;
            measured.set(
                pattern.measured_property,
                (measured.get(pattern.measured_property) ?? 0) + n,
            );
            if (pattern.population_type !== null) {
                const id = pattern.population_type;
                populations.set(id, (populations.get(id) ?? 0) + n);
            }
        }
        const largest = members.reduce((held, pattern) =>
            pattern.stat_var_count > held.stat_var_count ? pattern : held,
        );
        return Object.freeze({
            key,
            qualifier: largest.measurement_qualifier,
            between: largest.observation_properties,
            split: largest.constraint_properties,
            statVarCount: sorted.reduce((sum, pattern) => sum + pattern.stat_var_count, 0),
            patterns: sorted,
            measured: byWeight(measured),
            populationTypes: byWeight(populations),
        });
    });
    return Object.freeze(groups.toSorted((a, b) => b.statVarCount - a.statVarCount));
}

/** Terms joined with commas and a final `joiner`: `a`, `a and b`, `a, b and c`. */
const series = (model: Model, ids: readonly string[], joiner = 'and'): SentencePart[] =>
    ids.flatMap((id, index): SentencePart[] => {
        const term: SentencePart = { kind: 'term', id, label: model.label(id) };
        if (index === 0) return [term];
        return [{ kind: 'text', text: index === ids.length - 1 ? ` ${joiner} ` : ', ' }, term];
    });

/** How many distinct terms a slot names before it gives their count instead. */
const SLOT_NAMES = 3;

/** True when the model holds the term as a Class, from the schema or a usage document's terms. */
const isClass = (model: Model, id: string): boolean => {
    const kind = model.kind(id);
    if (kind !== undefined) return kind === 'class' || kind === 'valueList';
    return model.term(id)?.types.includes('Class') ?? false;
};

/**
 * "The <measured property> of a <population type>, measured as <qualifier>,
 * reported by <role> | between <a> and <b>, split by <a>, <b> and <c>."
 * The measured property and population type slots name up to three terms
 * joined with "or", and past that give their count: "of 15 kinds of
 * thing", and "One of 2,734 measures" in place of "The <measured
 * property>". "of a" goes before Classes only. A clause with nothing to
 * say is left out.
 */
export function groupSentence(model: Model, group: PatternGroup): SentencePart[] {
    const text = (value: string): SentencePart => ({ kind: 'text', text: value });
    const term = (id: string): SentencePart => ({ kind: 'term', id, label: model.label(id) });

    const { measured, populationTypes } = group;
    const parts: SentencePart[] =
        measured.length > SLOT_NAMES
            ? [text(`One of ${count(measured.length)} measures`)]
            : [text('The '), ...series(model, measured, 'or')];
    if (populationTypes.length > SLOT_NAMES) {
        parts.push(text(` of ${count(populationTypes.length)} kinds of thing`));
    } else if (populationTypes.length > 0) {
        const article = populationTypes.every((id) => isClass(model, id)) ? 'a ' : '';
        parts.push(text(` of ${article}`), ...series(model, populationTypes, 'or'));
    }
    if (group.qualifier !== null) {
        parts.push(text(', measured as '), term(group.qualifier));
    }
    const { between, split } = group;
    if (between.length === 1) {
        parts.push(text(', reported by '), ...series(model, between));
    } else if (between.length > 1) {
        parts.push(text(', between '), ...series(model, between));
    }
    if (split.length > 0) parts.push(text(', split by '), ...series(model, split));
    parts.push(text('.'));
    return parts;
}

/** One pattern read as a sentence: groupSentence over a group of that pattern alone. */
export function patternSentence(model: Model, pattern: SchemaPattern): SentencePart[] {
    const [group] = patternGroups([pattern]);
    return group === undefined ? [] : groupSentence(model, group);
}

/**
 * The fields a pattern's line inside its group shows: the population type
 * always, and each other identity field where it tells the group's patterns
 * apart. The measured property and stat type appear when they vary in the
 * group, and the denominator whenever the pattern has one.
 */
export type PatternLine = {
    readonly populationType: string | null;
    readonly measured: string | null;
    readonly denominator: string | null;
    /** True when the StatVars' denominator names no value or only provisional nodes. */
    readonly unresolved: boolean;
    readonly statType: string | null;
    readonly statVarCount: number;
    readonly example: string | null;
};

/** A pattern's line inside its group (PatternLine). */
export function patternLine(group: PatternGroup, pattern: SchemaPattern): PatternLine {
    const statTypes = new Set(group.patterns.map((member) => member.stat_type));
    return {
        populationType: pattern.population_type,
        measured: group.measured.length > 1 ? pattern.measured_property : null,
        denominator: pattern.measurement_denominator,
        unresolved: pattern.measurement_denominator_unresolved ?? false,
        statType: statTypes.size > 1 ? pattern.stat_type : null,
        statVarCount: pattern.stat_var_count,
        example: pattern.examples[0] ?? null,
    };
}

/** Each term a group's sentence can name, as dcids: measured, population, qualifier, between and split. */
const groupTerms = (group: PatternGroup): readonly string[] => [
    ...group.measured,
    ...group.populationTypes,
    ...(group.qualifier === null ? [] : [group.qualifier]),
    ...group.between,
    ...group.split,
];

/** Dcids with their labels, for a filter to match on either. */
const withLabels = (model: Pick<Model, 'label'>, ids: readonly string[]): readonly string[] =>
    ids.flatMap((id) => [id, model.label(id)]);

/**
 * A filter over split combinations: a group matches when the label or
 * dcid of any term its sentence names holds `text` (textFilter). Null for
 * blank text.
 */
export const groupFilter = (
    model: Pick<Model, 'label'>,
    text: string,
): ((group: PatternGroup) => boolean) | null =>
    textFilter(text, (group: PatternGroup) => withLabels(model, groupTerms(group)));

/**
 * A filter over a group's patterns on the label or dcid of the population
 * type, measured property or denominator (textFilter). Null for blank text.
 */
export const patternFilter = (
    model: Pick<Model, 'label'>,
    text: string,
): ((pattern: SchemaPattern) => boolean) | null =>
    textFilter(text, (pattern: SchemaPattern) =>
        withLabels(
            model,
            [
                pattern.population_type,
                pattern.measured_property,
                pattern.measurement_denominator,
            ].filter((id) => id !== null),
        ),
    );
