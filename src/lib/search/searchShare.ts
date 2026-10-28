import { getShare, makeShare } from '@/lib/chat/shareStore';
import type { Assumption, EntityGroup, Operation } from '@/lib/search/types';
import { searchApiBase } from '@/lib/searchApi';
import { registerDefinitions } from './registerDefinitions.ts';
import { searchShareOf, searchSharePayload, type Captured } from './searchSharePayload.ts';
import type { SearchShareMode, SearchSharePart } from './searchShareRequest.ts';
import { captureSnapshot } from './snapshot.ts';

/**
 * Search shares (server only), held in dfo-apis as `kind: search` with the
 * website's payload (searchSharePayload.ts). A link to a search result
 * stores no numbers: each part holds the dataset it resolved to, and the
 * data comes back from the Datasets API when the link opens.
 *
 *   live     — each part's definition is registered, one
 *              `POST /api/datasets/register` call per definition, and the
 *              link replays them through `dataset_resubmit`, so it
 *              always shows today's data.
 *   snapshot — each part is minted with the default options, a CSV bundle
 *              (`POST /api/datasets`), and that artifact pinned
 *              (`POST /api/datasets/{id}/{cv}/pin`) and stored by its digest,
 *              so the link serves the exact bytes captured here. A pin that
 *              fails fails the share: an unpinned snapshot would expire with
 *              the working tier. See `captureSnapshot` in snapshot.ts.
 */

export type SearchShareRef = {
    partIndex: number;
    variableText: string | null;
    specId: string;
    identity: unknown;
    entityGroups: Record<string, EntityGroup> | null;
    operations: Operation[];
    // Null for a share stored without assumptions.
    assumptions: Assumption[] | null;
    contentVersion: string | null;
    // The file a snapshot captured and pinned. Null for a live share, and
    // for a snapshot stored before digests were kept.
    artifactDigest: string | null;
};

export type SearchShare = {
    id: string;
    mode: SearchShareMode;
    query: string;
    createdAt: string;
    refs: SearchShareRef[];
};

// A capture runs inside a server request, so its poll gets a short
// deadline; a capture still running past it throws like any other capture
// failure, and POST /api/share answers 502 `platform_refused` without
// storing a link that cannot open.
const CAPTURE_POLL_DEADLINE_MS = 50_000;

const capture = (part: SearchSharePart) =>
    captureSnapshot({
        base: searchApiBase(),
        specId: part.specId,
        definition: part.definition,
        principal: process.env.DFO_PRINCIPAL,
        pollDeadlineMs: CAPTURE_POLL_DEADLINE_MS,
    });

export const createSearchShare = async (
    incoming: Headers,
    userId: string | null,
    mode: SearchShareMode,
    query: string,
    parts: SearchSharePart[],
): Promise<{ id: string }> => {
    const ordered = [...parts].sort((a, b) => a.partIndex - b.partIndex);
    // Two parts can fold onto one dataset: register / capture each once.
    const distinct = [...new Map(ordered.map((part) => [part.specId, part])).values()];
    const capturedBySpec = new Map<string, Captured>();

    if (mode === 'snapshot') {
        const results = await Promise.all(distinct.map(capture));

        distinct.forEach((part, index) => capturedBySpec.set(part.specId, results[index]!));
    } else {
        await registerDefinitions({
            base: searchApiBase(),
            definitions: distinct.map((part) => part.definition),
        });
    }

    return makeShare(incoming, userId, {
        kind: 'search',
        latest: mode === 'live',
        title: query,
        cards: [],
        payload: searchSharePayload(
            query,
            ordered.map((part) => ({ part, captured: capturedBySpec.get(part.specId) ?? null })),
        ),
    });
};

/** A search share by id, or null for no share or a share of another kind. */
export const getSearchShare = async (id: string): Promise<SearchShare | null> => {
    const record = await getShare(id);

    return record && searchShareOf(record);
};
