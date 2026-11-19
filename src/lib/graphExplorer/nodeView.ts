/**
 * The model for one centred term the DFO document does not declare, built
 * from the node view GET /api/graph/schema/node/{dcid} answers and the full
 * model.
 *
 * Nodes merge only here, into a model scoped to one centre. The centre comes
 * from the view. Every other ref takes the DFO document's node when the
 * document holds it, else the view's node, so a view's neighbour never
 * replaces a node the document holds. Whether a ref is held is a fact of the
 * full model (`full.node(id) !== undefined`), never of the centre's model,
 * which holds the view's neighbours too.
 */
import type { Centre } from './focus.ts';
import type { Loadable, NodeViewState, Waiting } from './load.ts';
import { buildModel, type Model } from './model.ts';
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
 * The model for the view's centre: centreNodes over the full model's usage
 * documents, with the full model's generation. Each pair of full model and
 * view builds once, so the boxes cached per model stay cached.
 */
export function centreModel(full: Model, view: SchemaNodeView): Model {
    let byView = centreModels.get(full);
    if (byView === undefined) {
        byView = new WeakMap();
        centreModels.set(full, byView);
    }
    const cached = byView.get(view);
    if (cached !== undefined) return cached;
    const model = buildModel(
        { generation: full.generation, nodes: [...centreNodes(full, view)] },
        ...full.usageDocuments,
    );
    byView.set(view, model);
    return model;
}

/** A node view's failure, for the line that offers to load it again. */
export type NodeViewFailure = Extract<Loadable<unknown>, { readonly status: 'failed' }>;

/**
 * What a centred term or dataset shows: the centre drawn from `model`, with
 * the node view's failure when it failed; a wait for a term the DFO
 * document lacks; or the refusal that ended its view.
 */
export type CentreRoute =
    | { readonly kind: 'draw'; readonly model: Model; readonly failed: NodeViewFailure | null }
    | { readonly kind: 'loading'; readonly waiting: Waiting | null }
    | { readonly kind: 'notHeld' }
    | { readonly kind: 'notServed' };

/** True for a centred term the DFO document does not declare, which reads its node view. */
export const needsNodeView = (full: Model, centre: Centre): boolean =>
    centre.kind === 'node' && full.node(centre.id)?.declared_by !== 'dfo';

/**
 * The route for a centre, from the full model and the state of its node
 * view (null before the view's load starts, and for a centre that reads
 * none). A dataset or a term the DFO document declares draws from the full
 * model. Any other term draws from its centre's model once the view lands.
 * Until then, and after a refusal or failure, a term the DFO document holds
 * draws from the full model; a term it lacks waits, or shows the refusal,
 * or draws from the full model beside the failure.
 */
export function routeCentre(full: Model, centre: Centre, state: NodeViewState | null): CentreRoute {
    const fromFull = { kind: 'draw', model: full, failed: null } as const;
    if (!needsNodeView(full, centre)) return fromFull;
    if (state?.status === 'ready') {
        return { kind: 'draw', model: centreModel(full, state.value), failed: null };
    }
    if (state?.status === 'failed') return { kind: 'draw', model: full, failed: state };
    if (full.node(centre.id) !== undefined) return fromFull;
    if (state === null) return { kind: 'loading', waiting: null };
    if (state.status === 'loading') return { kind: 'loading', waiting: state.waiting };
    return { kind: state.status };
}
