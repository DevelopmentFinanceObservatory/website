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
import type { Centre, FocusBox } from './focus.ts';
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
 * same ref, and the view's neighbours the full model lacks.
 */
export function centreNodes(full: Model, view: SchemaNodeView): readonly SchemaNode[] {
    const centre = view.centre.ref;
    const nodes = full.nodes.filter((node) => node.ref !== centre);
    nodes.push(view.centre);
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
 *   `subClassOf+` on the centre means its walk down the class tree stopped
 *   (DESCENDANTS), so a count over kinds of the centre leaves some out.
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

/** True when the listing of `ref` by `property` stopped at its cap. */
export const isCapped = (completeness: Completeness, ref: string, property: string): boolean =>
    completeness.state === 'partial' &&
    completeness.capped.some((listing) => listing.ref === ref && listing.property === property);

/**
 * The gaps in one box of the picture around `id`. An arc box listed by its
 * links into the centre is capped when one of its arcs is, and a value's
 * "Set with" box when its list's `rangeIncludes` is. A class's role box
 * reads as the class's scoped list does (classListGaps).
 */
export function boxGaps(box: FocusBox, id: string, completeness: Completeness): readonly ListGap[] {
    if (completeness.state === 'complete') return [];
    if (completeness.state === 'unresolved') return ['unresolved'];
    const { via } = box;
    if (via.kind === 'arc') {
        const cut =
            via.direction === 'in' && via.properties.some((arc) => isCapped(completeness, id, arc));
        return cut ? ['capped'] : [];
    }
    if (via.kind === 'valueList') {
        return isCapped(completeness, via.list, 'rangeIncludes') ? ['capped'] : [];
    }
    const role = (ROLES as readonly string[]).includes(box.key);
    return role ? classListGaps(id, completeness) : [];
}

/**
 * The gaps in the scoped list of the class `id`, which lists the properties
 * declared for it (`domainIncludes`, capped) and those that StatVars about
 * it or a narrower class use (DESCENDANTS, whose cut leaves some kinds out).
 */
export function classListGaps(id: string, completeness: Completeness): readonly ListGap[] {
    if (completeness.state === 'complete') return [];
    if (completeness.state === 'unresolved') return ['unresolved'];
    const gaps: ListGap[] = [];
    if (isCapped(completeness, id, 'domainIncludes')) gaps.push('capped');
    if (isCapped(completeness, id, DESCENDANTS)) gaps.push('descendants');
    return gaps;
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
