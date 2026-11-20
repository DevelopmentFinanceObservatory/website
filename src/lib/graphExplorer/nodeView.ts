/**
 * The model for one centred term the DFO document does not declare, built
 * from the node view GET /api/graph/schema/node/{dcid} answers and the full
 * model.
 *
 * Nodes merge only here, into a model scoped to one centre. The centre comes
 * from the view. Every other ref takes the DFO document's node when the
 * document holds it, else the view's node, so a view's neighbour never
 * replaces a node the document holds. Whether a ref is held is a fact of the
 * full model (`full.node(id) !== undefined`), since the centre's model
 * holds the view's neighbours too.
 */
import { ORIGIN_SWITCHES, type OriginSwitch } from './explore.ts';
import { openEntries, type Centre, type FocusBox } from './focus.ts';
import {
    settled,
    type Loadable,
    type NodeViewState,
    type Refusal,
    type Servable,
    type Waiting,
} from './load.ts';
import { ROLES, withNodes, type Model } from './model.ts';
import type { CappedListing, SchemaNode, SchemaNodeView } from './wire.ts';

/**
 * The full model's nodes, the view's centre in place of any node of the
 * same ref, and the view's neighbours the full model lacks. A centre whose
 * members listing stopped at its cap (`members` among cutsOf) lists its
 * instances as incomplete, so every members list and its CSV say so.
 */
export function centreNodes(full: Model, view: SchemaNodeView): readonly SchemaNode[] {
    const centre = view.centre.ref;
    const nodes = full.nodes.filter((node) => node.ref !== centre);
    const { instances } = view.centre;
    const membersCut = view.capped.some((cap) =>
        cutsOf(cap, centre).some((listing) => listing.kind === 'members'),
    );
    nodes.push(
        membersCut && instances !== null
            ? { ...view.centre, instances: { ...instances, complete: false } }
            : view.centre,
    );
    for (const node of view.nodes) {
        if (node.ref !== centre && full.node(node.ref) === undefined) nodes.push(node);
    }
    return nodes;
}

const centreModels = new WeakMap<Model, WeakMap<SchemaNodeView, Model>>();

/**
 * The model for the view's centre: centreNodes with the full model's usage
 * index and generation. It indexes the nodes again and none of the usage,
 * so a centre costs what the schema costs. Each pair of full model and view
 * builds once, so the boxes cached per model stay cached.
 */
export function centreModel(full: Model, view: SchemaNodeView): Model {
    let byView = centreModels.get(full);
    if (byView === undefined) {
        byView = new WeakMap();
        centreModels.set(full, byView);
    }
    const cached = byView.get(view);
    if (cached !== undefined) return cached;
    const model = withNodes(full, {
        generation: full.generation,
        nodes: [...centreNodes(full, view)],
    });
    byView.set(view, model);
    return model;
}

/**
 * How completely a centre's model holds the centre's links, which the
 * notice over the picture, the panel's full lists and the scoped list say
 * beside what they show:
 * - `complete`: the DFO document declares the centre, or its node view
 *   left nothing out.
 * - `partial`: the node view stopped the `capped` listings at their cap.
 *   cutsOf maps each to the listings drawn from the model that it cuts.
 * - `unresolved`: the node view has not landed, so the links shown are the
 *   DFO document's and the usage documents' alone. `loading` is true while
 *   it loads, and false once it failed or was refused.
 */
export type Completeness =
    | { readonly state: 'complete' }
    | { readonly state: 'partial'; readonly capped: readonly CappedListing[] }
    | { readonly state: 'unresolved'; readonly loading: boolean };

export const COMPLETE: Completeness = Object.freeze({ state: 'complete' });
export const LINKS_LOADING: Completeness = Object.freeze({ state: 'unresolved', loading: true });
export const LINKS_MISSING: Completeness = Object.freeze({ state: 'unresolved', loading: false });

/** The capped listing a node view sends when its walk down the centre's class tree stopped. */
export const DESCENDANTS = 'subClassOf+';

/** What a node view leaves out of its centre's links. */
export const viewCompleteness = (view: SchemaNodeView): Completeness =>
    view.capped.length === 0 ? COMPLETE : Object.freeze({ state: 'partial', capped: view.capped });

/**
 * Why a list drawn from a centre's model may hold less than the graph:
 * - `capped`: a listing it is read from stopped at its cap.
 * - `descendants`: its counts over kinds of the centre stop where the
 *   view's walk down the class tree stopped.
 * - `unresolved`: the centre's node view has not landed.
 */
export type ListGap = 'capped' | 'descendants' | 'unresolved';

/**
 * A listing the page draws from a centre's model, which a capped listing of
 * the centre's node view can cut:
 * - `arc`: the box of the picture listed by the arc `property` into the
 *   centre (`in`) or out of it (`out`).
 * - `declared`: the properties declared for the centre class, which its
 *   scoped list and role boxes read.
 * - `descendants`: the walk down the centre's class tree, which counts over
 *   kinds of the centre read.
 * - `members`: the members of the centre value list.
 * - `setWith`: the properties whose range is `list`, which a value in that
 *   list shows as "Set with".
 * - `open`: the panel's line for the centre's open property `property`.
 */
export type DrawnListing =
    | { readonly kind: 'arc'; readonly property: string; readonly direction: 'in' | 'out' }
    | { readonly kind: 'declared' }
    | { readonly kind: 'descendants' }
    | { readonly kind: 'members' }
    | { readonly kind: 'setWith'; readonly list: string }
    | { readonly kind: 'open'; readonly property: string };

const DECLARED: DrawnListing = Object.freeze({ kind: 'declared' });
const WALK: DrawnListing = Object.freeze({ kind: 'descendants' });
const MEMBERS: DrawnListing = Object.freeze({ kind: 'members' });

/**
 * What a capped listing on the centre cuts, by the listing's property. A
 * property the table lacks is one of the centre's arcs or open properties,
 * so it cuts the box listed by that arc into the centre and the panel's
 * line of that open property.
 */
const CENTRE_CUTS: ReadonlyMap<string, readonly DrawnListing[]> = new Map([
    [DESCENDANTS, [WALK]],
    // The walk below starts from the direct children, so cutting them cuts it too.
    ['subClassOf', [{ kind: 'arc', property: 'subClassOf', direction: 'in' }, WALK]],
    ['domainIncludes', [DECLARED]],
    ['typeOf', [MEMBERS]],
    // A cap on a Property centre's range classes (past the first few) cuts "Takes its value from".
    ['rangeIncludes/subClassOf+', [{ kind: 'arc', property: 'rangeIncludes', direction: 'out' }]],
    // A cap on a value centre's type classes (past the first few) cuts "Value list".
    ['typeOf/rangeIncludes', [{ kind: 'arc', property: 'typeOf', direction: 'out' }]],
]);

/** What a capped listing on a node other than the centre cuts, by the listing's property. A property the table lacks cuts nothing drawn. */
const NEIGHBOUR_CUTS: ReadonlyMap<string, (ref: string) => readonly DrawnListing[]> = new Map([
    ['rangeIncludes', (ref: string) => [{ kind: 'setWith', list: ref } as const]],
]);

/** The listings drawn around `centre` that the capped listing `cap` cuts. */
export const cutsOf = (cap: CappedListing, centre: string): readonly DrawnListing[] => {
    if (cap.ref !== centre) return NEIGHBOUR_CUTS.get(cap.property)?.(cap.ref) ?? [];
    return (
        CENTRE_CUTS.get(cap.property) ?? [
            { kind: 'arc', property: cap.property, direction: 'in' },
            { kind: 'open', property: cap.property },
        ]
    );
};

/** True when a capped listing of a partial view cuts a listing drawn around `centre` that `match` accepts. */
const isCut = (
    completeness: Completeness,
    centre: string,
    match: (listing: DrawnListing) => boolean,
): boolean =>
    completeness.state === 'partial' &&
    completeness.capped.some((cap) => cutsOf(cap, centre).some(match));

/**
 * The gaps in one box of the picture around `id`: `capped` when a capped
 * listing cuts the arc it is listed by (cutsOf), or for a value's "Set
 * with" box the properties whose range is its list. A class's role box
 * reads as the class's scoped list does (classListGaps).
 */
export function boxGaps(box: FocusBox, id: string, completeness: Completeness): readonly ListGap[] {
    if (completeness.state === 'complete') return [];
    if (completeness.state === 'unresolved') return ['unresolved'];
    const { via } = box;
    if (via.kind === 'arc') {
        const cut = isCut(
            completeness,
            id,
            (listing) =>
                listing.kind === 'arc' &&
                listing.direction === via.direction &&
                via.properties.some((arc) => arc === listing.property),
        );
        return cut ? ['capped'] : [];
    }
    if (via.kind === 'valueList') {
        const cut = isCut(
            completeness,
            id,
            (listing) => listing.kind === 'setWith' && listing.list === via.list,
        );
        return cut ? ['capped'] : [];
    }
    const role = (ROLES as readonly string[]).includes(box.key);
    return role ? classListGaps(id, completeness) : [];
}

/**
 * The gaps in the scoped list of the class `id`, which lists the properties
 * declared for it (`declared`, capped) and those that StatVars about it or
 * a narrower class use (`descendants`, whose cut leaves some kinds out).
 */
export function classListGaps(id: string, completeness: Completeness): readonly ListGap[] {
    if (completeness.state === 'complete') return [];
    if (completeness.state === 'unresolved') return ['unresolved'];
    const gaps: ListGap[] = [];
    if (isCut(completeness, id, (listing) => listing.kind === 'declared')) gaps.push('capped');
    if (isCut(completeness, id, (listing) => listing.kind === 'descendants')) {
        gaps.push('descendants');
    }
    return gaps;
}

/** True when a capped listing cuts the panel's line for the open property `property` of `id`. */
export const openLineCut = (completeness: Completeness, id: string, property: string): boolean =>
    isCut(completeness, id, (listing) => listing.kind === 'open' && listing.property === property);

/** The arcs whose listings into the centre a node view caps under the centre's own ref. */
const IN_ARC_LISTINGS: ReadonlySet<string> = new Set([
    'typeOf',
    'subClassOf',
    'subPropertyOf',
    'specializationOf',
    'rangeIncludes',
    'domainIncludes',
]);

/**
 * The properties a partial view left out of its centre `node`: each capped
 * listing on the centre that names none of the view's own listings
 * (CENTRE_CUTS and IN_ARC_LISTINGS) and no property the centre holds. The Graph API leaves
 * out a property whose values are all literals and total more than 32 KiB,
 * such as the eleven geoJson properties of `country/USA`, and caps it this
 * way. A capped property the centre holds is cut short (openLineCut).
 */
export const leftOutProperties = (
    completeness: Completeness,
    node: SchemaNode,
): readonly string[] =>
    completeness.state !== 'partial'
        ? []
        : completeness.capped.flatMap(({ ref, property }) =>
              ref === node.ref &&
              !CENTRE_CUTS.has(property) &&
              !IN_ARC_LISTINGS.has(property) &&
              !Object.hasOwn(node.other_properties, property)
                  ? [property]
                  : [],
          );

/** The panel's line naming the properties `names` its view left out, or null for none. */
export const leftOutLine = (names: readonly string[]): string | null => {
    if (names.length === 0) return null;
    if (names.length === 1) return `Left out because it is too large to load here: ${names[0]}.`;
    const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    return `Left out because they are too large to load here: ${list}.`;
};

/**
 * What the line over the picture around `id` says is cut: the titles of
 * the boxes a capped listing cuts, "Values" when it cuts the members of a
 * value list, and the label of each open property whose line it cuts, in
 * that order, with `walk` true when a box's counts over kinds of `id`
 * leave some out. A capped listing no drawn listing reads adds nothing.
 */
export function pictureCuts(
    model: Model,
    id: string,
    boxes: readonly FocusBox[],
    completeness: Completeness,
): { readonly lists: readonly string[]; readonly walk: boolean } {
    if (completeness.state !== 'partial') return { lists: [], walk: false };
    const gaps = boxes.map((box) => ({ box, gaps: boxGaps(box, id, completeness) }));
    const members =
        model.hasValueList(id) && isCut(completeness, id, (listing) => listing.kind === 'members');
    return {
        lists: [
            ...gaps.filter((entry) => entry.gaps.includes('capped')).map(({ box }) => box.title),
            ...(members ? ['Values'] : []),
            ...openEntries(model, id)
                .filter((entry) => openLineCut(completeness, id, entry.property))
                .map((entry) => entry.label),
        ],
        walk: gaps.some((entry) => entry.gaps.includes('descendants')),
    };
}

/** A node view's failure, for the line that offers to load it again. */
export type NodeViewFailure = Extract<Loadable<unknown>, { readonly status: 'failed' }>;

/** Why a node view was refused for good, as its refusal's status. */
export type RefusalKind = Refusal['status'];

/**
 * The line over a picture drawn without its node view: the view's failure,
 * with `retrying` set while it loads again, or the refusal that ended it.
 */
export type CentreLine =
    | { readonly kind: 'failed'; readonly failure: NodeViewFailure; readonly retrying: boolean }
    | { readonly kind: 'refused'; readonly refusal: RefusalKind };

/**
 * What a centred term or dataset shows: the centre drawn from `model`, with
 * how completely `model` holds its links and a line when its node view
 * failed or was refused, a wait for a term the DFO document lacks, or the
 * refusal that ended its view.
 */
export type CentreRoute =
    | {
          readonly kind: 'draw';
          readonly model: Model;
          readonly completeness: Completeness;
          readonly line: CentreLine | null;
      }
    | { readonly kind: 'loading'; readonly waiting: Waiting | null }
    | { readonly kind: 'refused'; readonly refusal: RefusalKind };

/** True for a centred term the DFO document does not declare, which reads its node view. */
export const needsNodeView = (full: Model, centre: Centre): boolean =>
    centre.kind === 'node' && full.node(centre.id)?.declared_by !== 'dfo';

/**
 * The route for a centre, from the full model, the state of its node view
 * (null before the view's load starts, and for a centre that reads none),
 * the view's last failure while a retry loads it (`lastFailure`), and
 * whether a loaded terms list holds a row for it (`listed`). A dataset or a
 * term the DFO document declares draws from the full model, complete. Any
 * other term draws from its centre's model once the view lands, as
 * complete as the view (`viewCompleteness`). Until then, and after a
 * refusal or failure, a term the DFO document holds draws from the full
 * model, unresolved (`loading` while the view loads), beside its failure
 * or any refusal but `notHeld`. A term it lacks waits, or draws from the
 * full model beside the failure, which stays on show while a retry loads.
 * A refused term that the usage documents name or a terms list holds
 * draws from the full model beside the refusal. Any other shows the
 * refusal alone.
 */
export function routeCentre(
    full: Model,
    centre: Centre,
    state: NodeViewState | null,
    {
        lastFailure = null,
        listed = false,
    }: { lastFailure?: NodeViewFailure | null; listed?: boolean } = {},
): CentreRoute {
    const fromFull = (line: CentreLine | null = null, completeness = LINKS_MISSING) =>
        ({ kind: 'draw', model: full, completeness, line }) as const;
    if (!needsNodeView(full, centre)) return fromFull(null, COMPLETE);
    if (state?.status === 'ready') {
        return {
            kind: 'draw',
            model: centreModel(full, state.value),
            completeness: viewCompleteness(state.value),
            line: null,
        };
    }
    if (state?.status === 'failed') {
        return fromFull({ kind: 'failed', failure: state, retrying: false });
    }
    if (state?.status === 'loading' && lastFailure !== null) {
        return fromFull({ kind: 'failed', failure: lastFailure, retrying: true }, LINKS_LOADING);
    }
    if (full.node(centre.id) !== undefined) {
        if (state === null || state.status === 'loading') return fromFull(null, LINKS_LOADING);
        // The document holds the term, so "not on the graph" would contradict the picture.
        return fromFull(
            state.status === 'notHeld' ? null : { kind: 'refused', refusal: state.status },
        );
    }
    if (state === null) return { kind: 'loading', waiting: null };
    if (state.status === 'loading') return { kind: 'loading', waiting: state.waiting };
    if (listed || full.term(centre.id) !== undefined) {
        return fromFull({ kind: 'refused', refusal: state.status });
    }
    return { kind: 'refused', refusal: state.status };
}

/**
 * The first dataset `ids` names that the full model lacks while an outside
 * usage document has not settled, else null. Such a dataset may come with
 * the document still loading, so the view waits for it before it calls the
 * dataset missing. `ids` holds the centred dataset and the filtered one,
 * null where there is none.
 */
export function awaitedDataset(
    full: Model,
    ids: readonly (string | null)[],
    usage: Readonly<Record<OriginSwitch, Servable<unknown> | null>>,
): string | null {
    if (ORIGIN_SWITCHES.every((origin) => settled(usage[origin]))) return null;
    return ids.find((id): id is string => id !== null && full.dataset(id) === undefined) ?? null;
}
