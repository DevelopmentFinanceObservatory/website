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
