/**
 * The rules the start screen, the Show pills, the scoped list's dataset
 * columns and the focus panel's bars share: datasets most used first, the
 * first entries of a long list with a way to see the rest, and the origin
 * tag on each entry.
 */
import type { OriginSwitch } from './explore.ts';
import type { Servable } from './load.ts';
import type { Model } from './model.ts';
import type { ProvenanceUsage, SchemaTerm, SchemaUsage } from './wire.ts';

/** How many entries a long list shows before its "All N" control. */
export const LIST_HEAD = 8;

/** The entries a list shows, and whether it holds more than its head. */
export type ListHead<TItem> = {
    readonly shown: readonly TItem[];
    readonly total: number;
    /** True when the list holds more than LIST_HEAD entries, so it offers "All N". */
    readonly long: boolean;
};

/**
 * The first `head` entries of `items`, or all of them when `open` or when
 * there are no more than `head`. An entry `keep` names past the head joins
 * the end, so a chosen dataset's pill stays on show.
 */
export function listHead<TItem>(
    items: readonly TItem[],
    {
        open,
        keep,
        head = LIST_HEAD,
    }: { open: boolean; keep?: (item: TItem) => boolean; head?: number },
): ListHead<TItem> {
    const long = items.length > head;
    if (open || !long) return { shown: items, total: items.length, long };
    const rest = keep === undefined ? [] : items.slice(head).filter(keep);
    return { shown: [...items.slice(0, head), ...rest], total: items.length, long };
}

const byUseCache = new WeakMap<Model, readonly ProvenanceUsage[]>();

/** The model's datasets, most StatVars first, then by label. Computed once per model. */
export function datasetsByUse(model: Model): readonly ProvenanceUsage[] {
    const held = byUseCache.get(model);
    if (held !== undefined) return held;
    const sorted = Object.freeze(
        [...model.datasets].sort(
            (a, b) =>
                b.stat_var_count - a.stat_var_count ||
                model.label(a.ref).localeCompare(model.label(b.ref), 'en') ||
                (a.ref < b.ref ? -1 : 1),
        ),
    );
    byUseCache.set(model, sorted);
    return sorted;
}

/** The outside usage documents loaded, by the origin each describes. */
export type OutsideUsage = { readonly base?: SchemaUsage; readonly un?: SchemaUsage };

/** The outside usage documents that have landed, from each one's load state. */
export const landedUsage = (
    states: Readonly<Record<OriginSwitch, Servable<SchemaUsage> | null>>,
): OutsideUsage => {
    const landed = (state: Servable<SchemaUsage> | null) =>
        state?.status === 'ready' ? state.value : undefined;
    return { base: landed(states.base), un: landed(states.un) };
};

const provenanceSets = new WeakMap<SchemaUsage, ReadonlySet<ProvenanceUsage>>();

const provenancesOf = (document: SchemaUsage): ReadonlySet<ProvenanceUsage> => {
    const held = provenanceSets.get(document);
    if (held !== undefined) return held;
    const set = new Set(document.provenances);
    provenanceSets.set(document, set);
    return set;
};

/**
 * The origin a dataset comes from, as a node's `declared_by`: `base` or
 * `un_system` for an entry of that outside usage document, null for a DFO
 * dataset. A model keeps each document's own entry objects, and the first
 * document listing a ref wins, so a ref the DFO document also lists reads as
 * DFO.
 */
export const datasetOrigin = (
    dataset: ProvenanceUsage,
    outside: OutsideUsage,
): 'base' | 'un_system' | null => {
    if (outside.base !== undefined && provenancesOf(outside.base).has(dataset)) return 'base';
    if (outside.un !== undefined && provenancesOf(outside.un).has(dataset)) return 'un_system';
    return null;
};

const baseTermRefs = new WeakMap<SchemaUsage, ReadonlySet<string>>();

/**
 * True when the base usage document's `terms` name the ref. Base datasets
 * use such a term, so the base Data Commons browser has a page for it.
 */
export const inBaseUsage = (id: string, outside: OutsideUsage): boolean => {
    const { base } = outside;
    if (base === undefined) return false;
    let refs = baseTermRefs.get(base);
    if (refs === undefined) {
        refs = new Set((base.terms ?? []).map((term) => term.ref));
        baseTermRefs.set(base, refs);
    }
    return refs.has(id);
};

const termIndexes = new WeakMap<readonly SchemaTerm[], ReadonlyMap<string, SchemaTerm>>();

const termIndex = (outside: readonly SchemaTerm[]): ReadonlyMap<string, SchemaTerm> => {
    const held = termIndexes.get(outside);
    if (held !== undefined) return held;
    const index = new Map(outside.map((term) => [term.ref, term]));
    termIndexes.set(outside, index);
    return index;
};

/**
 * The origin declaring a term, as a node's `declared_by`: the schema node's,
 * else the loaded terms list's, else null. A UN series that StatVars are
 * about is outside the schema, and the UN terms list loads whenever the UN
 * switch puts the series in the scoped model.
 */
export const termOrigin = (
    model: Pick<Model, 'node'>,
    outside: readonly SchemaTerm[],
    id: string,
): string | null => model.node(id)?.declared_by ?? termIndex(outside).get(id)?.declared_by ?? null;
