/**
 * Names for the Graph API bodies the site reads, from the client package's types generated from
 * the served OpenAPI document.
 */

import type { NodesResponse } from '@developmentfinance/client/wire';

export type { GraphNode } from '@developmentfinance/client';
export type {
    DatasetEntry,
    DocumentErrorEntry,
    NodesRequest,
    SourceCatalogue,
    SourceCatalogueEntry,
    SourceDocumentation,
    VersionHistoryEntry,
} from '@developmentfinance/client/wire';

/** One entry of the `POST /api/graph/nodes` response, which holds one per requested dcid, in
 *  order: a node's body, or a `not_held` entry. */
export type NodeEntry = NodesResponse['nodes'][number];
