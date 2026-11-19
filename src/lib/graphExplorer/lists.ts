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

/**
 * The most rows a list puts on screen at once, once open or filtered. A
 * longer list shows its first rows and a note saying how many it holds.
 */
export const LIST_CEILING = 60;

/** The first matches of a list on show, and how many entries match in all. */
export type Matches<TItem> = { readonly hits: readonly TItem[]; readonly total: number };

/**
 * The first `limit` entries of `items` that `matches` keeps, in list order,
 * and how many it keeps in all. With no `matches`, every entry is kept.
 */
export function firstMatches<TItem>(
    items: readonly TItem[],
    matches: ((item: TItem) => boolean) | null = null,
    limit = LIST_CEILING,
): Matches<TItem> {
    if (matches === null) return { hits: items.slice(0, limit), total: items.length };
    const hits: TItem[] = [];
    let total = 0;
    for (const item of items) {
        if (!matches(item)) continue;
        total += 1;
        if (hits.length < limit) hits.push(item);
    }
    return { hits, total };
}

/**
 * A filter over terms by label or dcid, ignoring case and surrounding
 * space, or null for blank text, which keeps every term.
 */
export const termFilter = (
    model: Pick<Model, 'label'>,
    text: string,
): ((id: string) => boolean) | null => {
    const needle = text.trim().toLowerCase();
    if (needle === '') return null;
    return (id) =>
        id.toLowerCase().includes(needle) || model.label(id).toLowerCase().includes(needle);
};

/**
 * The head of a list of datasets' entries, as listHead gives it, keeping
 * the entry of the filtered dataset (`dataset`, null for none) past the
 * head, so the bars show the dataset the reader chose.
 */
export const datasetHead = <TItem extends { readonly dataset: string }>(
    items: readonly TItem[],
    { open, dataset }: { open: boolean; dataset: string | null },
): ListHead<TItem> =>
    listHead(items, {
        open,
        keep: dataset === null ? undefined : (item) => item.dataset === dataset,
    });

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

/** A scoped list's count column: its dataset and the column's index in the list's `columns`. */
export type ListColumn = { readonly dataset: ProvenanceUsage; readonly index: number };

/**
 * A scoped list's count columns, most StatVars first as datasetsByUse
 * orders them, so the table and its CSV file share one order.
 */
export const columnsByUse = (model: Model, columns: readonly string[]): readonly ListColumn[] => {
    const columnAt = new Map(columns.map((dataset, index) => [dataset, index]));
    return datasetsByUse(model).flatMap((dataset) => {
        const index = columnAt.get(dataset.ref);
        return index === undefined ? [] : [{ dataset, index }];
    });
};

/**
 * The model's datasets for the start screen: the DFO's first, then those
 * from outside, each group as datasetsByUse orders it. The switches add the
 * outside datasets to the list without pushing the DFO's past its head.
 */
export const datasetsDfoFirst = (
    model: Model,
    outside: OutsideUsage,
): readonly ProvenanceUsage[] => {
    const byUse = datasetsByUse(model);
    const dfo = byUse.filter((dataset) => datasetOrigin(dataset, outside) === null);
    return dfo.length === byUse.length
        ? byUse
        : [...dfo, ...byUse.filter((dataset) => datasetOrigin(dataset, outside) !== null)];
};

/** True for an origin outside the DFO that a list tags: base Data Commons or the UN System. */
const isOutsideOrigin = (origin: string | null): boolean =>
    origin === 'base' || origin === 'un_system';

/**
 * The kinds of thing for the start screen, as datasetsDfoFirst orders the
 * datasets: those with no outside origin tag first, then the tagged ones,
 * each group in the order given. `origin` reads a term's origin as
 * termOrigin does.
 */
export const kindsDfoFirst = <TKind extends { readonly classId: string }>(
    kinds: readonly TKind[],
    origin: (id: string) => string | null,
): readonly TKind[] => {
    const outside = kinds.filter((kind) => isOutsideOrigin(origin(kind.classId)));
    if (outside.length === 0) return kinds;
    return [...kinds.filter((kind) => !outside.includes(kind)), ...outside];
};

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

const termRefs = new WeakMap<SchemaUsage, ReadonlySet<string>>();

/** The refs a usage document's `terms` name, gathered once per document. */
const usageTermRefs = (document: SchemaUsage): ReadonlySet<string> => {
    let refs = termRefs.get(document);
    if (refs === undefined) {
        refs = new Set((document.terms ?? []).map((term) => term.ref));
        termRefs.set(document, refs);
    }
    return refs;
};

const termIndexes = new WeakMap<readonly SchemaTerm[], ReadonlyMap<string, SchemaTerm>>();

const termIndex = (outside: readonly SchemaTerm[]): ReadonlyMap<string, SchemaTerm> => {
    const held = termIndexes.get(outside);
    if (held !== undefined) return held;
    const index = new Map(outside.map((term) => [term.ref, term]));
    termIndexes.set(outside, index);
    return index;
};

/** The row the loaded terms lists hold for a ref, or undefined. */
export const outsideTerm = (outside: readonly SchemaTerm[], id: string): SchemaTerm | undefined =>
    termIndex(outside).get(id);

/** What a term's origin is read from beside the schema: the outside usage documents and terms lists loaded. */
export type TermSources = {
    readonly usage: OutsideUsage;
    readonly terms: readonly SchemaTerm[];
};

/**
 * The origin declaring a term, as a node's `declared_by`: the schema
 * node's, else the loaded terms lists' row's, else, for a ref no loaded
 * terms list holds, that of the outside usage document whose `terms` name
 * it (base before UN, as the terms lists rank them), else null. A usage
 * document's `terms` say which datasets use a term, and a UN dataset may
 * use a base property, so a terms list's row outranks them. The usage
 * documents load on every visit and name the UN series StatVars are
 * about, which no terms list holds, so a series carries its tag whatever
 * the switches say.
 */
export const termOrigin = (
    model: Pick<Model, 'node'>,
    { usage, terms }: TermSources,
    id: string,
): string | null => {
    const declared = model.node(id)?.declared_by;
    if (declared !== undefined && declared !== null) return declared;
    const row = outsideTerm(terms, id);
    if (row !== undefined) return row.declared_by;
    if (usage.base !== undefined && usageTermRefs(usage.base).has(id)) return 'base';
    if (usage.un !== undefined && usageTermRefs(usage.un).has(id)) return 'un_system';
    return null;
};
