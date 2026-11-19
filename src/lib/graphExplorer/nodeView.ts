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
import type { Centre } from './focus.ts';
import {
    settled,
    type Loadable,
    type NodeViewState,
    type Refusal,
    type Servable,
    type Waiting,
} from './load.ts';
import { withNodes, type Model } from './model.ts';
import type { SchemaNode, SchemaNodeView } from './wire.ts';

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
 * a line when its node view failed or was refused, a wait for a term the
 * DFO document lacks, or the refusal that ended its view.
 */
export type CentreRoute =
    | { readonly kind: 'draw'; readonly model: Model; readonly line: CentreLine | null }
    | { readonly kind: 'loading'; readonly waiting: Waiting | null }
    | { readonly kind: 'refused'; readonly refusal: RefusalKind };

/** True for a centred term the DFO document does not declare, which reads its node view. */
export const needsNodeView = (full: Model, centre: Centre): boolean =>
    centre.kind === 'node' && full.node(centre.id)?.declared_by !== 'dfo';

/**
 * The route for a centre, from the full model, the state of its node view
 * (null before the view's load starts, and for a centre that reads none),
 * and the view's last failure while a retry loads it (else null). A dataset
 * or a term the DFO document declares draws from the full model. Any other
 * term draws from its centre's model once the view lands. Until then, and
 * after a refusal or failure, a term the DFO document holds draws from the
 * full model. A term it lacks waits, or draws from the full model beside
 * the failure, which stays on show while a retry loads. A refused term
 * that the usage documents name draws from the full model beside the
 * refusal. Any other shows the refusal alone.
 */
export function routeCentre(
    full: Model,
    centre: Centre,
    state: NodeViewState | null,
    lastFailure: NodeViewFailure | null = null,
): CentreRoute {
    const fromFull = (line: CentreLine | null = null) =>
        ({ kind: 'draw', model: full, line }) as const;
    if (!needsNodeView(full, centre)) return fromFull();
    if (state?.status === 'ready') {
        return { kind: 'draw', model: centreModel(full, state.value), line: null };
    }
    if (state?.status === 'failed') {
        return fromFull({ kind: 'failed', failure: state, retrying: false });
    }
    if (state?.status === 'loading' && lastFailure !== null) {
        return fromFull({ kind: 'failed', failure: lastFailure, retrying: true });
    }
    if (full.node(centre.id) !== undefined) return fromFull();
    if (state === null) return { kind: 'loading', waiting: null };
    if (state.status === 'loading') return { kind: 'loading', waiting: state.waiting };
    if (full.term(centre.id) !== undefined) {
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
