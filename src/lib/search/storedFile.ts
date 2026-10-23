import 'server-only';

import type { NextRequest } from 'next/server';

import { clientIp } from '@/lib/proxy/forward';
import { rateHeaders } from '@/lib/proxy/rateHeaders';
import { hit } from '@/lib/proxy/rateLimit';
import { datasetsFetch } from '@/lib/search/datasetsFetch';
import { artifactHref } from '@/lib/search/searchClient';
import { storedDownload, type VersionLinkDocument } from '@/lib/search/versionLink';
import { searchApiBase } from '@/lib/searchApi';

/**
 * The server half of the site's download redirects (server only):
 * `/api/version-download/<spec>/<cv>` and `/s/<id>/download`. Each reads a
 * Datasets API manifest at click time and redirects to the stable link of
 * the file it lists, which the API answers with a freshly signed URL.
 */

// A manifest read, bounded as lib/search/snapshot bounds its door reads.
const VERSION_READ_TIMEOUT_MS = 20_000;

/**
 * Counts the call against the proxy's `api` allowance, the one every
 * Datasets API call through the site shares. The X-RateLimit-* headers go
 * on the response whenever the call was counted, with `Retry-After` added
 * when the call is over it.
 */
export const downloadAllowance = async (
    req: NextRequest,
): Promise<{ allowed: boolean; headers: Record<string, string> }> => {
    const verdict = await hit('api', clientIp(req));

    return {
        allowed: verdict.allowed,
        headers: verdict.allowed
            ? rateHeaders(verdict)
            : { ...rateHeaders(verdict), 'Retry-After': String(verdict.reset) },
    };
};

/**
 * A stored version's file, read from the version door
 * (`GET /api/datasets/{spec}/{cv}`) and chosen by `pick`, which defaults to
 * `storedDownload`. 404 when the API serves no such version (404, or 410
 * for an expired or revoked one) or `pick` finds no file. 502 when the read
 * fails otherwise, times out after VERSION_READ_TIMEOUT_MS, or answers with
 * a body that is not JSON.
 */
export const readVersionFile = async ({
    specId,
    contentVersion,
    pick = storedDownload,
}: {
    specId: string;
    contentVersion: string;
    pick?: (manifest: VersionLinkDocument) => { url: string } | null;
}): Promise<{ url: string } | { status: 404 | 502; message: string }> => {
    const res = await datasetsFetch(`${searchApiBase()}/api/datasets/${specId}/${contentVersion}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(VERSION_READ_TIMEOUT_MS),
    }).catch(() => null);

    if (res?.status === 404 || res?.status === 410) {
        return { status: 404, message: 'No such version' };
    }

    const manifest = res?.ok
        ? ((await res.json().catch(() => null)) as VersionLinkDocument | null)
        : null;

    if (!manifest) {
        console.error('stored-file: the manifest read failed', {
            spec: specId,
            cv: contentVersion,
            status: res?.status ?? 'unreachable',
        });

        return { status: 502, message: 'The version could not be read' };
    }

    const file = pick(manifest);

    return file
        ? { url: artifactHref(file.url) }
        : { status: 404, message: 'No stored file for this version' };
};
