/**
 * What the Explore screen shows, read from and written to the URL query so a
 * view can be shared and the browser's history steps between views.
 *
 * - nothing set: the start screen
 * - `?list=all`: every property the instance declares; `?list=<class dcid>`: one class's properties
 * - `?node=<dcid>`: one term at the centre
 * - `?dataset=<provenance dcid>`: one dataset at the centre
 * - `?show=<provenance dcid>` or `?show=all`: the dataset filter, kept while the reader moves
 *
 * When several view parameters are set, `node` wins, then `dataset`, then `list`.
 */
import type { DatasetFilter, ListScope } from './model.ts';

export type ExploreView =
    | { readonly kind: 'start' }
    | { readonly kind: 'list'; readonly scope: ListScope }
    | { readonly kind: 'node'; readonly id: string }
    | { readonly kind: 'dataset'; readonly id: string };

export type ExploreState = { readonly view: ExploreView; readonly show: DatasetFilter };

/** The path the Explore screen answers on. */
export const EXPLORE_PATH = '/graph-explorer';

/** The `list` and `show` value that means every instance property or every dataset. */
export const ALL = 'all';

export const START_VIEW: ExploreView = Object.freeze({ kind: 'start' });
export const NO_FILTER: DatasetFilter = Object.freeze({ kind: 'none' });

/** The query parameters Explore reads; an empty value counts as unset. */
type QueryReader = { get(name: string): string | null };

const value = (params: QueryReader, name: string): string | null => {
    const raw = params.get(name);
    return raw === null || raw === '' ? null : raw;
};

const readView = (params: QueryReader): ExploreView => {
    const node = value(params, 'node');
    if (node !== null) return { kind: 'node', id: node };
    const dataset = value(params, 'dataset');
    if (dataset !== null) return { kind: 'dataset', id: dataset };
    const list = value(params, 'list');
    if (list !== null) {
        return {
            kind: 'list',
            scope: list === ALL ? { kind: 'instance' } : { kind: 'class', id: list },
        };
    }
    return START_VIEW;
};

const readShow = (params: QueryReader): DatasetFilter => {
    const show = value(params, 'show');
    if (show === null) return NO_FILTER;
    return show === ALL ? { kind: 'all' } : { kind: 'dataset', id: show };
};

/** The Explore state a query string describes. */
export const readExplore = (params: QueryReader): ExploreState => ({
    view: readView(params),
    show: readShow(params),
});

/** The query string for a state, `?` included, or '' for the start screen with no filter. */
export const exploreQuery = (state: ExploreState): string => {
    const params = new URLSearchParams();
    const { view, show } = state;
    if (view.kind === 'node') params.set('node', view.id);
    else if (view.kind === 'dataset') params.set('dataset', view.id);
    else if (view.kind === 'list') {
        params.set('list', view.scope.kind === 'instance' ? ALL : view.scope.id);
    }
    if (show.kind === 'all') params.set('show', ALL);
    else if (show.kind === 'dataset') params.set('show', show.id);
    const query = params.toString();
    return query === '' ? '' : `?${query}`;
};

/** The path and query for a state. */
export const exploreHref = (state: ExploreState): string => `${EXPLORE_PATH}${exploreQuery(state)}`;

/** Whether two views show the same thing. */
export const sameView = (a: ExploreView, b: ExploreView): boolean =>
    exploreQuery({ view: a, show: NO_FILTER }) === exploreQuery({ view: b, show: NO_FILTER });
