/**
 * What the Explore screen shows, read from and written to the URL query so a
 * view can be shared and the browser's history steps between views.
 *
 * - nothing set: the start screen
 * - `?list=dfo`: every property the DFO declares
 * - `?list=<class dcid>`: one class's properties
 * - `?node=<dcid>`: one term at the centre
 * - `?dataset=<provenance dcid>`: one dataset at the centre
 * - `?show=<provenance dcid>` or `?show=all`: the dataset filter, carried while the reader moves
 * - `?base=1`: search reaches base Data Commons terms, carried while the reader moves
 * - `?un=1`: search reaches UN System Data Commons terms, carried while the reader moves
 *
 * When several view parameters are set, `node` wins, then `dataset`, then `list`.
 * `show`, `base` and `un` are the carried parameters: every link in the
 * section, the sheet screens' included, keeps them.
 */
import type { DatasetFilter, ListScope, Model } from './model.ts';
import { EXPLORE_PATH } from './paths.ts';
import type { SchemaTerm } from './wire.ts';

export type ExploreView =
    | { readonly kind: 'start' }
    | { readonly kind: 'list'; readonly scope: ListScope }
    | { readonly kind: 'node'; readonly id: string }
    | { readonly kind: 'dataset'; readonly id: string };

/**
 * The switches that each add one terms list outside the model to search, by
 * their query parameter: `base` for base Data Commons, `un` for the UN
 * System Data Commons.
 */
export const ORIGIN_SWITCHES = ['base', 'un'] as const;

export type OriginSwitch = (typeof ORIGIN_SWITCHES)[number];

/** The parameters every Graph Explorer link keeps: the dataset filter and the origin switches. */
export type Carried = {
    readonly show: DatasetFilter;
    /** Whether search reaches base Data Commons terms outside the model. */
    readonly base: boolean;
    /** Whether search reaches UN System Data Commons terms outside the model. */
    readonly un: boolean;
};

export type ExploreState = Carried & { readonly view: ExploreView };

/** The `show` value that means every dataset. */
export const ALL = 'all';

/** The `list` value that means every property the DFO declares. */
export const DFO = 'dfo';

export const START_VIEW: ExploreView = Object.freeze({ kind: 'start' });
export const NO_FILTER: DatasetFilter = Object.freeze({ kind: 'none' });

export const NO_CARRIED: Carried = Object.freeze({ show: NO_FILTER, base: false, un: false });

/** The query parameters a Graph Explorer screen reads. */
export type QueryReader = { get(name: string): string | null };

/** A query parameter's value, or null when it is missing or empty, which counts as unset. */
export const queryValue = (params: QueryReader, name: string): string | null => {
    const raw = params.get(name);
    return raw === null || raw === '' ? null : raw;
};

const readView = (params: QueryReader): ExploreView => {
    const node = queryValue(params, 'node');
    if (node !== null) return { kind: 'node', id: node };
    const dataset = queryValue(params, 'dataset');
    if (dataset !== null) return { kind: 'dataset', id: dataset };
    const list = queryValue(params, 'list');
    if (list !== null) {
        return {
            kind: 'list',
            scope: list === DFO ? { kind: 'dfo' } : { kind: 'class', id: list },
        };
    }
    return START_VIEW;
};

const readShow = (params: QueryReader): DatasetFilter => {
    const show = queryValue(params, 'show');
    if (show === null) return NO_FILTER;
    return show === ALL ? { kind: 'all' } : { kind: 'dataset', id: show };
};

/** The carried parameters a query string holds. */
export const readCarried = (params: QueryReader): Carried => ({
    show: readShow(params),
    base: queryValue(params, 'base') === '1',
    un: queryValue(params, 'un') === '1',
});

/** Adds the carried parameters to `params`, leaving out each one at its default. */
export const writeCarried = (params: URLSearchParams, carried: Carried): void => {
    const { show } = carried;
    if (show.kind === 'all') params.set('show', ALL);
    else if (show.kind === 'dataset') params.set('show', show.id);
    for (const name of ORIGIN_SWITCHES) {
        if (carried[name]) params.set(name, '1');
    }
};

/** `?` and the query, or '' when `params` is empty. */
export const queryString = (params: URLSearchParams): string => {
    const query = params.toString();
    return query === '' ? '' : `?${query}`;
};

/** A screen's path with the carried parameters as its query. */
export const carriedHref = (path: string, carried: Carried): string => {
    const params = new URLSearchParams();
    writeCarried(params, carried);
    return `${path}${queryString(params)}`;
};

/**
 * A query string, `?` included, with one origin switch turned on or off and
 * every other parameter unchanged.
 */
export const switchOrigin = (search: string, name: OriginSwitch, on: boolean): string => {
    const params = new URLSearchParams(search);
    if (on) params.set(name, '1');
    else params.delete(name);
    return queryString(params);
};

/** The Explore state a query string describes. */
export const readExplore = (params: QueryReader): ExploreState => ({
    view: readView(params),
    ...readCarried(params),
});

/** The query string for a state, `?` included, or '' for the start screen with nothing carried. */
export const exploreQuery = (state: ExploreState): string => {
    const params = new URLSearchParams();
    const { view } = state;
    if (view.kind === 'node') params.set('node', view.id);
    else if (view.kind === 'dataset') params.set('dataset', view.id);
    else if (view.kind === 'list') {
        params.set('list', view.scope.kind === 'dfo' ? DFO : view.scope.id);
    }
    writeCarried(params, state);
    return queryString(params);
};

/** The path and query for a state. */
export const exploreHref = (state: ExploreState): string => `${EXPLORE_PATH}${exploreQuery(state)}`;

/** Whether two views show the same thing. */
export const sameView = (a: ExploreView, b: ExploreView): boolean =>
    exploreQuery({ view: a, ...NO_CARRIED }) === exploreQuery({ view: b, ...NO_CARRIED });

/**
 * The address to push for a move from `state` to `view`, keeping the
 * carried parameters, or null when `view` is already on show.
 */
export const moveHref = (state: ExploreState, view: ExploreView): string | null =>
    sameView(view, state.view) ? null : exploreHref({ ...state, view });

/**
 * The dataset filter the screens apply, and the dataset id the URL named
 * that the model lacks, or null. An unknown dataset applies no filter, and
 * the screen names it.
 */
export const checkFilter = (
    model: Pick<Model, 'dataset'>,
    show: DatasetFilter,
): { readonly show: DatasetFilter; readonly unknown: string | null } =>
    show.kind === 'dataset' && !model.dataset(show.id)
        ? { show: NO_FILTER, unknown: show.id }
        : { show, unknown: null };

/** Whether the model holds what a scoped list's scope names: every DFO property, or a class or value list. */
export const listScopeExists = (model: Pick<Model, 'kind'>, scope: ListScope): boolean => {
    if (scope.kind === 'dfo') return true;
    const kind = model.kind(scope.id);
    return kind === 'class' || kind === 'valueList';
};

/**
 * Whether a view waits on the terms lists before it can say what its centre
 * is. That holds for a term neither the model nor a loaded list (`outside`)
 * holds, while any switched-on list is not yet in (`settled` means loaded, or
 * not served here). Once every switched-on list is in, a term they all lack is
 * "Not in the DFO model".
 */
export const awaitsTerms = (
    model: Pick<Model, 'kind'>,
    view: ExploreView,
    switches: Pick<Carried, OriginSwitch>,
    settled: Readonly<Record<OriginSwitch, boolean>>,
    outside: readonly Pick<SchemaTerm, 'ref'>[],
): boolean =>
    view.kind === 'node' &&
    model.kind(view.id) === undefined &&
    !outside.some((term) => term.ref === view.id) &&
    ORIGIN_SWITCHES.some((name) => switches[name] && !settled[name]);
