import type { NextRequest } from 'next/server';

import { getSearchShare } from '@/lib/search/searchShare';
import {
    acceptsHtml,
    createWaitGate,
    MAX_UPSTREAM_WAITS,
    selectShareDownload,
    serveLiveDownload,
    shareDownloadText,
    sharedSnapshotFile,
    type DownloadAnswer,
    type PinServed,
} from '@/lib/search/shareDownload';
import { pinArtifact } from '@/lib/search/snapshot';
import { downloadAllowance, readVersionFile } from '@/lib/search/storedFile';
import { pinVersionOnce } from '@/lib/search/versionPin';
import { searchApiBase } from '@/lib/searchApi';

const EVERY_RESPONSE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
const NOT_PREPARED = 'The dataset could not be prepared. Open the share to download it.';

// This instance's requests held open on the Datasets API.
const upstreamWaits = createWaitGate(MAX_UPSTREAM_WAITS);

type Reply = (status: number, text: string, headers?: Record<string, string>) => Response;
type Redirect = (status: 302 | 303, location: string) => Response;

// GET /s/<id>/download[?part=&format=&bundle=] → 302 to the file of one
// dataset behind a search share, at a freshly signed URL; selectShareDownload
// (lib/search/shareDownload) says which part and which door. A live share
// reads the definition door and gets the latest data, pinned like a download
// from the search page (pinVersionOnce). serveLiveDownload decides the
// answer, including the wait for a definition too large for the door's sync
// budget. A snapshot share serves the file its capture pinned
// (sharedSnapshotFile). 404 for a missing or non-search share or an unknown
// part, 400 for a bad query, 429 past the `api` allowance, 503 with
// `Retry-After` when busy, and the door's own 400 or 422 passed on; 502 when
// the door, or the share store, fails otherwise. Every body is plain text
// that links back to the share, and every link is a path, because on Cloud
// Run the request's origin is the container's bind address.
export const GET = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const allowance = await downloadAllowance(req);

    const reply: Reply = (status, text, headers = {}) =>
        new Response(shareDownloadText(id, text), {
            status,
            headers: {
                ...allowance.headers,
                ...EVERY_RESPONSE,
                'Content-Type': 'text/plain; charset=utf-8',
                ...headers,
            },
        });
    const redirect: Redirect = (status, location) =>
        new Response(null, {
            status,
            headers: { ...allowance.headers, ...EVERY_RESPONSE, Location: location },
        });

    if (!allowance.allowed) {
        return reply(429, 'Too many requests from this address. Try again in a minute.');
    }

    try {
        const answer = await serve({
            id,
            query: req.nextUrl.searchParams,
            html: acceptsHtml(req.headers.get('accept')),
            signal: req.signal,
        });

        return answer.kind === 'redirect'
            ? redirect(answer.status, answer.location)
            : reply(
                  answer.status,
                  answer.text,
                  answer.retryAfter ? { 'Retry-After': answer.retryAfter } : {},
              );
    } catch (error) {
        console.error('share-download: the download failed', {
            share: id,
            error: error instanceof Error ? error.message : String(error),
        });

        return reply(502, NOT_PREPARED);
    }
};

const serve = async ({
    id,
    query,
    html,
    signal,
}: {
    id: string;
    query: URLSearchParams;
    html: boolean;
    signal: AbortSignal;
}): Promise<DownloadAnswer> => {
    const share = await getSearchShare(id);

    if (!share) {
        return { kind: 'reply', status: 404, text: 'No dataset is shared at this link.' };
    }

    const target = selectShareDownload({ share, query });

    if (target.kind === 'refused') {
        return { kind: 'reply', status: target.status, text: target.message };
    }

    if (target.kind === 'snapshot') {
        const file = await readVersionFile({
            ...target,
            pick: (manifest) => sharedSnapshotFile(manifest, target.artifactDigest),
        });

        return 'status' in file
            ? { kind: 'reply', status: file.status, text: `${file.message}.` }
            : { kind: 'redirect', status: 302, location: file.url };
    }

    return serveLiveDownload({
        shareId: share.id,
        target,
        html,
        base: searchApiBase(),
        gate: upstreamWaits,
        pin: pinServed,
        signal,
    });
};

// Pins the served version, as the search page pins its own downloads
// (/api/download-pin), so the version link printed in the bundle keeps
// opening. Awaited before the redirect, because CPU is throttled once the
// response is sent. A failure is logged and the download goes ahead.
const pinServed: PinServed = async ({ manifest, specId, digest }) => {
    const contentVersion = manifest.content_version;
    const servedSpecId = manifest.definition?.spec_id ?? specId;

    if (!contentVersion || !digest) {
        return;
    }

    await pinVersionOnce({ specId: servedSpecId, contentVersion }, (principal) =>
        pinArtifact({
            base: searchApiBase(),
            specId: servedSpecId,
            contentVersion,
            artifactDigest: digest,
            principal,
        }),
    ).catch((error: unknown) => {
        const { message, cause } = error as Error;

        console.error('share-download: the served version is not pinned', {
            spec: servedSpecId,
            cv: contentVersion,
            error: message,
            cause: cause instanceof Error ? cause.message : undefined,
        });
    });
};
