/* eslint-disable @typescript-eslint/no-explicit-any -- the Datasets API bodies are read shallowly, like the rest of lib/search */
import { asc, eq } from 'drizzle-orm';

import { shortId } from '@/lib/chat/shareStore';
import { db } from '@/lib/db';
import type { Operation } from '@/lib/search/types';
import { searchApiBase } from '@/lib/searchApi';
import { share, shareRef } from '../../../db/schema';
import { captureSnapshot } from './snapshot.ts';

/**
 * Search shares (server only). A link to a search result stores no numbers:
 * one `share_ref` row per part holds the dataset it resolved to, and the
 * data comes back from the Datasets API when the link opens.
 *
 *   live     — the definitions are registered (`POST /api/datasets/register`)
 *              and the link replays them through `dataset_resubmit`, so it
 *              always shows today's data.
 *   snapshot — each part is minted with the default options, a CSV bundle
 *              (`POST /api/datasets`), and that artifact pinned
 *              (`POST /api/datasets/{id}/{cv}/pin`) and stored by its digest,
 *              so the link serves the exact bytes captured here. A pin that
 *              fails fails the share: an unpinned snapshot would expire with
 *              the working tier. See `captureSnapshot` in snapshot.ts.
 */

export type SearchShareMode = 'live' | 'snapshot';

/** One definite part of the result being shared, as the page holds it. */
export type SearchSharePart = {
    partIndex: number;
    variableText: string | null;
    specId: string;
    identity: unknown;
    resolvedStatVarDcids?: string[] | null;
    // What the question asked of the part beyond its data; the replay
    // carries them back.
    operations: Operation[];
    // The canonical definition from the resolve response — what register
    // and mint take. Not stored: the identity is enough to replay.
    definition: unknown;
};

export type SearchShareRef = {
    partIndex: number;
    variableText: string | null;
    specId: string;
    identity: unknown;
    resolvedStatVarDcids: string[] | null;
    operations: Operation[];
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

const SPEC_SHAPE = /^spec_[a-z0-9]+$/;

export const isSearchSharePart = (value: any): value is SearchSharePart =>
    !!value &&
    typeof value === 'object' &&
    Number.isInteger(value.partIndex) &&
    typeof value.specId === 'string' &&
    SPEC_SHAPE.test(value.specId) &&
    !!value.identity &&
    typeof value.identity === 'object' &&
    Array.isArray(value.operations) &&
    !!value.definition &&
    typeof value.definition === 'object';

const post = async (path: string, body: unknown) => {
    const res = await fetch(`${searchApiBase()}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    const json = await res.json().catch(() => null);

    return { ok: res.ok, status: res.status, body: json as any };
};

// Registers every part's definition in one call (a single definition when
// there's one part — the door takes exactly one of the two).
const register = async (parts: SearchSharePart[]): Promise<void> => {
    const { ok, status, body } = await post(
        '/api/datasets/register',
        parts.length === 1
            ? { schema_version: 1, definition: parts[0]!.definition }
            : { schema_version: 1, members: parts.map((part) => part.definition) },
    );

    if (!ok) {
        throw new Error(body?.code ?? `register ${status}`);
    }
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
        await register(distinct);
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
                variableText: part.variableText,
                resolvedStatVarDcids: part.resolvedStatVarDcids ?? null,
                operations: part.operations,
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
        mode: row.mode === 'snapshot' ? 'snapshot' : 'live',
        query: (row.data as { query?: string })?.query ?? row.title,
        createdAt: row.createdAt.toISOString(),
        refs: refs.map((ref) => ({
            partIndex: ref.partIndex,
            variableText: ref.variableText,
            specId: ref.specId,
            identity: ref.identity,
            resolvedStatVarDcids: (ref.resolvedStatVarDcids as string[] | null) ?? null,
            operations: ref.operations as Operation[],
            contentVersion: ref.contentVersion,
            artifactDigest: ref.artifactDigest,
        })),
    };
};
