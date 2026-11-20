/**
 * Search over the model: terms, values and datasets by label, dcid,
 * alternate name, classification code, and the names and values of each
 * node's open properties. With the base or UN System terms lists it also
 * reaches classes and properties the model does not hold.
 */
import { kindOfTerm, openNames, type Kind, type Model } from './model.ts';
import type { SchemaTerm } from './wire.ts';

/**
 * How a query matched a hit's best field: the whole field, whole words in it,
 * its start, or anywhere.
 */
export type MatchRank = 'exact' | 'word' | 'prefix' | 'substring';

export type SearchHit = {
    readonly id: string;
    readonly kind: Kind | 'dataset';
    readonly label: string;
    readonly match: MatchRank;
    /**
     * The origin declaring the hit, as a node's `declared_by`: `dfo`,
     * `base`, `un_system`, another origin, or null when the graph names
     * none. Null for a dataset.
     */
    readonly declaredBy: string | null;
    /** False for a term found only in the terms list. */
    readonly inModel: boolean;
};

export type SearchResult = {
    /** The best `limit` hits. */
    readonly hits: readonly SearchHit[];
    /** How many hits there are in all. */
    readonly total: number;
};

export type SearchOptions = {
    /** The loaded terms lists merged by `outsideTermList`. Terms outside the model are searched in it. */
    readonly outside?: readonly SchemaTerm[];
    readonly limit?: number;
};

const RANKS: readonly MatchRank[] = ['exact', 'word', 'prefix', 'substring'];

/**
 * A text's words, lower-cased: split at every run of characters other than
 * letters and digits, and where a lower-case letter or digit meets an upper-case
 * one, so `undataHouseholdComposition` reads as undata, household, composition.
 */
const words = (text: string): string[] =>
    text
        .replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, '$1 $2')
        .toLowerCase()
        .split(/[^\p{L}\p{Nd}]+/u)
        .filter((word) => word !== '');

/** Whether `query`'s words run, in order and whole, somewhere in `field`'s words. */
const holdsWords = (field: readonly string[], query: readonly string[]): boolean => {
    if (query.length === 0 || query.length > field.length) return false;
    for (let start = 0; start + query.length <= field.length; start++) {
        if (query.every((word, offset) => field[start + offset] === word)) return true;
    }
    return false;
};

/**
 * How one field matches a lower-cased query, as an index into RANKS. Whole
 * words match across punctuation and case, so `household composition` finds
 * `undataHouseholdComposition`.
 */
const rankOf = (
    field: string,
    query: string,
    queryWords: readonly string[],
): number | undefined => {
    const text = field.toLowerCase();
    if (text === query) return 0;
    if (holdsWords(words(field), queryWords)) return 1;
    if (text.startsWith(query)) return 2;
    return text.includes(query) ? 3 : undefined;
};

/** The best rank any field reaches for a lower-cased query, or undefined. */
const bestMatch = (query: string, fields: readonly (string | null)[]): MatchRank | undefined => {
    const queryWords = words(query);
    let best: number | undefined;
    for (const field of fields) {
        if (field === null) continue;
        const rank = rankOf(field, query, queryWords);
        if (rank !== undefined && (best === undefined || rank < best)) best = rank;
    }
    return best === undefined ? undefined : RANKS[best];
};

/** A hit's place within its match rank, as `search` orders them. */
const tier = (hit: SearchHit): number => {
    if (!hit.inModel) return 2;
    return hit.declaredBy === 'base' || hit.declaredBy === 'un_system' ? 1 : 0;
};

/**
 * Hits for `query`, case-insensitive, ranked by match first: exact, then
 * whole words, then prefix, then substring. Within a match rank, DFO terms and datasets come
 * first, with any model term base Data Commons or the UN System does not
 * declare; then the model's base and UN System terms; then terms outside the
 * model; then the shorter label. An exact base hit therefore lists above a
 * DFO prefix hit.
 */
export function search(model: Model, query: string, options: SearchOptions = {}): SearchResult {
    const { outside = [], limit = 12 } = options;
    const needle = query.trim().toLowerCase();
    if (needle === '') return { hits: [], total: 0 };

    const hits: SearchHit[] = [];
    for (const node of model.nodes) {
        const match = bestMatch(needle, [
            node.label,
            node.ref,
            ...node.alternate_name,
            ...node.classification_code,
            ...openNames(node),
        ]);
        if (match === undefined) continue;
        hits.push({
            id: node.ref,
            kind: model.kind(node.ref) ?? 'value',
            label: model.label(node.ref),
            match,
            declaredBy: node.declared_by,
            inModel: true,
        });
    }
    for (const dataset of model.datasets) {
        const match = bestMatch(needle, [dataset.label, dataset.ref]);
        if (match === undefined) continue;
        hits.push({
            id: dataset.ref,
            kind: 'dataset',
            label: model.label(dataset.ref),
            match,
            declaredBy: null,
            inModel: true,
        });
    }
    for (const term of outside) {
        if (term.declared_by === 'dfo' || model.node(term.ref)) continue;
        const match = bestMatch(needle, [term.label, term.ref]);
        if (match === undefined) continue;
        hits.push({
            id: term.ref,
            kind: kindOfTerm(term),
            label: term.label ?? term.ref,
            match,
            declaredBy: term.declared_by,
            inModel: false,
        });
    }

    hits.sort(
        (a, b) =>
            RANKS.indexOf(a.match) - RANKS.indexOf(b.match) ||
            tier(a) - tier(b) ||
            a.label.length - b.label.length ||
            a.label.localeCompare(b.label, 'en') ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return { hits: hits.slice(0, limit), total: hits.length };
}

/**
 * The hit an arrow key moves to among `count` hits, wrapping at both ends.
 * With none active (`current` is -1), down moves to the first and up to the last.
 */
export const stepActive = (current: number, step: 1 | -1, count: number): number => {
    if (count === 0) return -1;
    if (current < 0) return step === 1 ? 0 : count - 1;
    return (current + step + count) % count;
};

/**
 * The hit Enter opens among `count` hits: the active one, else the first.
 * Null while the list is hidden or empty, when Enter does nothing.
 */
export const enterChoice = (active: number, count: number, shown: boolean): number | null => {
    if (!shown || count === 0) return null;
    return active >= 0 && active < count ? active : 0;
};

/** What Escape does. It closes the list while the list is shown, else clears the query. */
export const escapeAction = (shown: boolean): 'close' | 'clear' => (shown ? 'close' : 'clear');

/** The search box's placeholder: what it searches, or why it is off while the model is missing. */
export const searchPlaceholder = (model: 'loading' | 'ready' | 'failed'): string =>
    model === 'ready'
        ? 'Search names, codes and dcids'
        : model === 'loading'
          ? 'Loading the model'
          : 'Search is off until the model loads';
