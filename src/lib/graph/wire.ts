/**
 * Names for the Graph API bodies the site reads, taken from the types
 * generated from the served schema (`schema.d.ts`, `pnpm graph:types`).
 */

import type { components } from './schema.d.ts';

type Schemas = components['schemas'];

/** `POST /api/graph/nodes` request body. */
export type NodesRequest = Schemas['nodes_request'];
/** One entry of the `POST /api/graph/nodes` response, which holds one per
 *  requested dcid, in order: a node's body, or a `not_held` entry. */
export type NodeEntry = Schemas['nodes_response']['nodes'][number];
/** `GET /api/graph/node/{dcid}` response body, discriminated by `kind`. */
export type GraphNode = Schemas['node_response'];

/** `GET /api/graph/sources` response body. */
export type SourceCatalogue = Schemas['source_catalogue_response'];
export type SourceCatalogueEntry = Schemas['SourceCatalogueEntry'];
export type DatasetEntry = Schemas['DatasetEntry'];
/** `GET /api/graph/documentation/{dcid}` response body. */
export type SourceDocumentation = Schemas['source_documentation_response'];
export type VersionHistoryEntry = Schemas['VersionHistoryEntry'];
export type DocumentErrorEntry = Schemas['DocumentErrorEntry'];
