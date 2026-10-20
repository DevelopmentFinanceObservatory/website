import { asc, eq } from 'drizzle-orm';

import { searchShareMode } from '@/lib/chat/shareMode';
import { shortId } from '@/lib/chat/shareStore';
import { db } from '@/lib/db';
import type { Assumption, EntityGroup, Operation } from '@/lib/search/types';
import { searchApiBase } from '@/lib/searchApi';
import { share, shareRef } from '../../../db/schema';
import { registerDefinitions } from './registerDefinitions.ts';
import type { SearchShareMode, SearchSharePart } from './searchShareRequest.ts';
import { captureSnapshot } from './snapshot.ts';

/**
 * Search shares (server only). A link to a search result stores no numbers:
 * one `share_ref` row per part holds the dataset it resolved to, and the
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
    userId: string | null,
    mode: SearchShareMode,
    query: string,
    parts: SearchSharePart[],
): Promise<{ id: string }> => {
    const ordered = [...parts].sort((a, b) => a.partIndex - b.partIndex);
    // Two parts can fold onto one dataset: register / capture each once.
    const distinct = [...new Map(ordered.map((part) => [part.specId, part])).values()];
    const capturedBySpec = new Map<
        string,
        { specId: string; contentVersion: string; artifactDigest: string }
    >();

    if (mode === 'snapshot') {
        const results = await Promise.all(distinct.map(capture));

        distinct.forEach((part, index) => capturedBySpec.set(part.specId, results[index]!));
    } else {
        await registerDefinitions({
            base: searchApiBase(),
            definitions: distinct.map((part) => part.definition),
        });
    }

    const captured = ordered.map((part) => capturedBySpec.get(part.specId) ?? null);
    const id = shortId();

    await db.transaction(async (tx) => {
        await tx.insert(share).values({
            id,
            userId,
            kind: 'search',
            mode,
            title: query,
            data: { query },
        });
        await tx.insert(shareRef).values(
            ordered.map((part, index) => ({
                shareId: id,
                partIndex: part.partIndex,
                specId: captured?.[index]?.specId ?? part.specId,
                identity: part.identity,
                entityGroups: part.entityGroups ?? null,
                variableText: part.variableText,
                operations: part.operations,
                assumptions: part.assumptions ?? null,
                contentVersion: captured?.[index]?.contentVersion ?? null,
                artifactDigest: captured?.[index]?.artifactDigest ?? null,
            })),
        );
    });

    return { id };
};

export const getSearchShare = async (id: string): Promise<SearchShare | null> => {
    const [row] = await db.select().from(share).where(eq(share.id, id)).limit(1);

    if (!row || row.kind !== 'search') {
        return null;
    }

    const refs = await db
        .select()
        .from(shareRef)
        .where(eq(shareRef.shareId, id))
        .orderBy(asc(shareRef.partIndex));

    return {
        id: row.id,
        mode: searchShareMode(row.mode),
        query: (row.data as { query?: string })?.query ?? row.title,
        createdAt: row.createdAt.toISOString(),
        refs: refs.map((ref) => ({
            partIndex: ref.partIndex,
            variableText: ref.variableText,
            specId: ref.specId,
            identity: ref.identity,
            entityGroups: ref.entityGroups as Record<string, EntityGroup> | null,
            operations: ref.operations as Operation[],
            assumptions: ref.assumptions as Assumption[] | null,
            contentVersion: ref.contentVersion,
            artifactDigest: ref.artifactDigest,
        })),
    };
};
