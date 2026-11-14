/**
 * Search over the model: terms, values and datasets by label, dcid,
 * alternate name and classification code. With the terms list it also
 * reaches base classes and properties the model does not hold.
 */
import { kindOfTerm, type Kind, type Model } from './model.ts';
import type { OntologyTerms } from './wire.ts';

/** How a query matched a hit's best field. */
export type MatchRank = 'exact' | 'prefix' | 'substring';

export type SearchHit = {
    readonly id: string;
    readonly kind: Kind | 'dataset';
    readonly label: string;
    readonly match: MatchRank;
    /** Declared by base Data Commons. */
    readonly base: boolean;
    /** False for a base term found only in the terms list. */
    readonly inModel: boolean;
};

export type SearchResult = {
    /** The best `limit` hits. */
    readonly hits: readonly SearchHit[];
    /** How many hits there are in all. */
    readonly total: number;
};

export type SearchOptions = {
    /** The terms list. When given, base terms outside the model are searched too. */
    readonly baseTerms?: OntologyTerms;
    readonly limit?: number;
};

const RANKS: readonly MatchRank[] = ['exact', 'prefix', 'substring'];

/** The best rank any field reaches for a lower-cased query, or undefined. */
const bestMatch = (query: string, fields: readonly (string | null)[]): MatchRank | undefined => {
    let best: number | undefined;
    for (const field of fields) {
        if (field === null) continue;
        const text = field.toLowerCase();
        const rank =
            text === query ? 0 : text.startsWith(query) ? 1 : text.includes(query) ? 2 : undefined;
        if (rank !== undefined && (best === undefined || rank < best)) best = rank;
    }
    return best === undefined ? undefined : RANKS[best];
};

/** Instance terms and datasets, then base terms in the model, then terms outside it. */
const tier = (hit: SearchHit): number => (!hit.inModel ? 2 : hit.base ? 1 : 0);

/**
 * Hits for `query`, case-insensitive, ranked exact, then prefix, then
 * substring. Within a rank, instance terms come before base terms, then by label.
 */
export function search(model: Model, query: string, options: SearchOptions = {}): SearchResult {
    const { baseTerms, limit = 12 } = options;
    const needle = query.trim().toLowerCase();
    if (needle === '') return { hits: [], total: 0 };

    const hits: SearchHit[] = [];
    for (const node of model.nodes) {
        const match = bestMatch(needle, [
            node.name,
            node.dcid,
            ...node.alternate_name,
            ...node.classification_code,
        ]);
        if (match === undefined) continue;
        hits.push({
            id: node.dcid,
            kind: model.kind(node.dcid) ?? 'value',
            label: model.label(node.dcid),
            match,
            base: node.declared_by === 'base',
            inModel: true,
        });
    }
    for (const dataset of model.datasets) {
        const match = bestMatch(needle, [dataset.label, dataset.dcid]);
        if (match === undefined) continue;
        hits.push({
            id: dataset.dcid,
            kind: 'dataset',
            label: model.label(dataset.dcid),
            match,
            base: false,
            inModel: true,
        });
    }
    for (const term of baseTerms?.terms ?? []) {
        if (term.declared_by !== 'base' || model.node(term.dcid)) continue;
        const match = bestMatch(needle, [term.name, term.dcid]);
        if (match === undefined) continue;
        hits.push({
            id: term.dcid,
            kind: kindOfTerm(term),
            label: term.name ?? term.dcid,
            match,
            base: true,
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
