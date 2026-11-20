/**
 * The search box's second source: GET /api/graph/schema/search, which finds
 * nodes the model and the terms lists do not hold, such as StatVars by what
 * they measure, places by name, and any node by its whole dcid.
 */
import type { OriginSwitch } from './explore.ts';
import { declarerPlace, kindWords, type Model } from './model.ts';
import type { SearchHit } from './search.ts';
import type { GraphSearchHit, GraphSearchSource } from './wire.ts';

/** The fewest characters a query needs before the graph is asked. */
export const GRAPH_SEARCH_MIN_LENGTH = 3;

/** How long typing pauses before the graph is asked, in milliseconds. */
export const GRAPH_SEARCH_PAUSE_MS = 350;

/**
 * How long the box waits for an answer, in milliseconds. The route gives its
 * reads 8 s, so this cap sits above it.
 */
export const GRAPH_SEARCH_TIMEOUT_MS = 12_000;

/** The route caps a query at 256 characters. */
const GRAPH_SEARCH_MAX_LENGTH = 256;

/**
 * The graph search URL for a query under the origin switches, or null when
 * the query is too short or too long to send.
 */
export const graphSearchUrl = (
    query: string,
    switches: Readonly<Record<OriginSwitch, boolean>>,
): string | null => {
    const text = query.trim();
    if (text.length < GRAPH_SEARCH_MIN_LENGTH || text.length > GRAPH_SEARCH_MAX_LENGTH) return null;
    const params = new URLSearchParams({
        q: text,
        base: switches.base ? '1' : '0',
        un: switches.un ? '1' : '0',
    });
    return `/api/graph/schema/search?${params.toString()}`;
};

/** The graph's hits the model's own results do not already list, in the graph's order. */
export const newGraphHits = (
    graph: readonly GraphSearchHit[],
    local: readonly SearchHit[],
): readonly GraphSearchHit[] => {
    const listed = new Set(local.map((hit) => hit.id));
    return graph.filter((hit) => !listed.has(hit.ref));
};

/** What a graph hit is, in a few words: its kind or types, and the Data Commons that declares it. */
export const describeGraphHit = (model: Model, hit: GraphSearchHit): string => {
    const kind = hit.types.includes('Class')
        ? kindWords(model, 'class', [])
        : hit.types.includes('Property')
          ? kindWords(model, 'property', [])
          : hit.types.length === 0
            ? 'Node'
            : kindWords(model, 'value', hit.types);
    return `${kind} ${declarerPlace(hit.declared_by)}`;
};

const SOURCE_WORDS: Readonly<Record<GraphSearchSource, string>> = {
    dcid: 'the dcid check',
    names: 'the name search',
    dfo: 'DFO StatVars',
    base: 'base Data Commons StatVars',
    un_system: 'UN System StatVars',
    labels: 'the read of names and types',
};

/** The line naming the parts of the graph search that did not answer, or null when all did. */
export const unavailableLine = (sources: readonly GraphSearchSource[]): string | null => {
    if (sources.length === 0) return null;
    const words = sources.map((source) => SOURCE_WORDS[source]);
    const named =
        words.length === 1
            ? words[0]
            : `${words.slice(0, -1).join(', ')}${words.length > 2 ? ',' : ''} and ${words.at(-1)}`;
    return `No answer from ${named}.`;
};
