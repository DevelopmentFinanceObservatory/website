/**
 * Share download links: `/s/<id>/download` sends the browser to the file of
 * one dataset behind a search share. This module picks the share's part and
 * the Datasets API door that serves its file, reads a live share's door
 * (serveLiveDownload), and picks the file a manifest lists. The route
 * (src/app/s/[id]/download/route.ts) answers with what it decides.
 *
 *   live     = the definition door, `GET /api/datasets/{spec}?format=&bundle=`,
 *              which serves the latest data. `format` is one of
 *              DATASET_FORMATS and `bundle` is `true` or `false`. Either
 *              left out takes DEFAULT_DOWNLOAD_CHOICES (a CSV bundle). A
 *              definition too large for the door's sync budget answers 202
 *              with an operation. A browser waits on the preparing page, and
 *              any other client is held while the route polls it.
 *   snapshot = the version door, `GET /api/datasets/{spec}/{cv}`, which
 *              lists every file stored for the version. The link serves the
 *              one its capture pinned (sharedSnapshotFile) and takes neither
 *              `format` nor `bundle`.
 *
 * `part` is a stored `partIndex`. It may be left out when every part of the
 * share resolves to one dataset. Otherwise its absence is refused with the
 * links that name each part (shareDownloadLinks, which the share panel
 * prints too).
 *
 * Every link here is a path on the site. A Cloud Run request carries the
 * container's bind address as its origin, so a host read from the request
 * would send the reader nowhere.
 *
 * This module has no DOM, database, or path-alias dependency, so
 * `node --test` imports it directly.
 */

import type { OperationResource, ProblemDetails } from '@developmentfinance/client/wire';

import { datasetsFetch } from './datasetsFetch.ts';
import { DEFAULT_DOWNLOAD_CHOICES } from './downloadOptions.ts';
import { OPERATION_DEADLINE, pollOperation } from './operationPoll.ts';
import { artifactHref, DATASET_FORMATS } from './searchClient.ts';
import type { SearchShare } from './searchShare';
import { MINT_DEFAULT_RENDERING, renderingArtifact, type FileRendering } from './snapshot.ts';
import {
    SPEC_SHAPE,
    storedDownload,
    VERSION_SHAPE,
    type VersionLinkDocument,
} from './versionLink.ts';

export type ShareDownload =
    | { kind: 'live'; specId: string; rendering: FileRendering; path: string }
    | {
          kind: 'snapshot';
          specId: string;
          contentVersion: string;
          artifactDigest: string | null;
          path: string;
      }
    | { kind: 'refused'; status: 400 | 404; message: string };

type Query = { get(name: string): string | null; has(name: string): boolean };

const FORMAT_IDS: readonly string[] = DATASET_FORMATS.map((format) => format.id);
const PART_SHAPE = /^\d+$/;
export const OPERATION_SHAPE = /^op_[a-f0-9]+$/;

const refused = (status: 400 | 404, message: string): ShareDownload => ({
    kind: 'refused',
    status,
    message,
});

const sharePath = (id: string): string => `/s/${encodeURIComponent(id)}`;

/**
 * The download links of share `id`, each with the part it names: one bare
 * link, with a null part, when every part resolves to one dataset (parts that
 * fold onto one spec share a file), and one `?part=` link per part otherwise.
 */
export const shareDownloadLinks = <TRef extends { partIndex: number; specId: string }>(
    id: string,
    refs: readonly TRef[],
): { path: string; ref: TRef | null }[] => {
    const path = `${sharePath(id)}/download`;

    if (new Set(refs.map((ref) => ref.specId)).size <= 1) {
        return [{ path, ref: null }];
    }

    return refs.map((ref) => ({ path: `${path}?part=${ref.partIndex}`, ref }));
};

/** A plain-text answer of the download route, ending with the share's link. */
export const shareDownloadText = (id: string, text: string): string =>
    `${text}\n\nThe share: ${sharePath(id)}\n`;

/**
 * The page that waits on the Datasets API operation building a share's
 * file. It carries the rendering asked for, because the finished
 * operation's manifest lists every file stored for the version.
 */
export const preparingDownloadPath = (
    id: string,
    operationId: string,
    { format, bundle }: FileRendering,
): string =>
    `${sharePath(id)}/download/preparing?${new URLSearchParams({ op: operationId, format, bundle: String(bundle) })}`;

/**
 * A live link's `format` and `bundle`, each defaulting to
 * DEFAULT_DOWNLOAD_CHOICES, or the message refusing a value the door does
 * not take.
 */
const parseRendering = (query: Query): FileRendering | string => {
    const format = query.get('format') ?? DEFAULT_DOWNLOAD_CHOICES.format;
    const bundle = query.get('bundle') ?? String(DEFAULT_DOWNLOAD_CHOICES.bundle);

    if (!FORMAT_IDS.includes(format)) {
        return `?format= takes ${FORMAT_IDS.join(', ')}. It got "${format}".`;
    }

    if (bundle !== 'true' && bundle !== 'false') {
        return `?bundle= takes true or false. It got "${bundle}".`;
    }

    return { format, bundle: bundle === 'true' };
};

/** The preparing page's operation and rendering, or null when either is malformed. */
export const parsePreparingQuery = (
    query: Query,
): { operationId: string; rendering: FileRendering } | null => {
    const operationId = query.get('op');
    const rendering = parseRendering(query);

    return operationId && OPERATION_SHAPE.test(operationId) && typeof rendering !== 'string'
        ? { operationId, rendering }
        : null;
};

/** The door that serves the requested part of `share`, or the refusal to answer. */
export const selectShareDownload = ({
    share,
    query,
}: {
    share: Pick<SearchShare, 'id' | 'mode' | 'refs'>;
    query: Query;
}): ShareDownload => {
    const part = query.get('part');

    const links = part === null ? shareDownloadLinks(share.id, share.refs) : [];

    if (links.length > 1) {
        return refused(
            400,
            [
                'This share holds more than one dataset. Name one with ?part=:',
                '',
                ...links.flatMap(({ path, ref }) =>
                    ref ? [`${path}  ${ref.variableText ?? `Dataset ${ref.partIndex + 1}`}`] : [],
                ),
            ].join('\n'),
        );
    }

    if (part !== null && !PART_SHAPE.test(part)) {
        return refused(400, `?part= takes a part number, such as ?part=0. It got "${part}".`);
    }

    const ref =
        part === null
            ? share.refs[0]
            : share.refs.find((candidate) => candidate.partIndex === Number(part));

    if (!ref || !SPEC_SHAPE.test(ref.specId)) {
        return refused(404, part === null ? 'This share holds no dataset.' : `No part ${part}.`);
    }

    if (share.mode === 'snapshot') {
        if (query.has('format') || query.has('bundle')) {
            return refused(
                400,
                'A snapshot link serves the file stored when it was shared, so it takes no format or bundle.',
            );
        }

        if (!ref.contentVersion || !VERSION_SHAPE.test(ref.contentVersion)) {
            return refused(404, 'This share stored no version of the dataset.');
        }

        return {
            kind: 'snapshot',
            specId: ref.specId,
            contentVersion: ref.contentVersion,
            artifactDigest: ref.artifactDigest,
            path: `/api/datasets/${ref.specId}/${ref.contentVersion}`,
        };
    }

    const rendering = parseRendering(query);

    if (typeof rendering === 'string') {
        return refused(400, rendering);
    }

    const params = new URLSearchParams({
        format: rendering.format,
        bundle: String(rendering.bundle),
    });

    return {
        kind: 'live',
        specId: ref.specId,
        rendering,
        path: `/api/datasets/${ref.specId}?${params}`,
    };
};

type ListedFile = NonNullable<VersionLinkDocument['artifacts']>[number];

const withUrl = (manifest: { artifacts?: ListedFile[] } | null) =>
    (manifest?.artifacts ?? []).filter((artifact) => !!artifact.url);

/**
 * The listed file made with exactly `rendering` and no reshape, by its
 * stable link and digest, or null. A version manifest, and the manifest of a
 * finished operation, list every rendering stored for the version, so the
 * first bundle they list can be an xlsx or a column-enriched one.
 */
export const renderedFile = (
    manifest: { artifacts?: ListedFile[] } | null,
    rendering: FileRendering,
): { url: string; digest: string } | null => {
    const file = renderingArtifact(withUrl(manifest), rendering);

    return file?.url && file.artifact_digest
        ? { url: file.url, digest: file.artifact_digest }
        : null;
};

/**
 * The file a snapshot share serves from its version manifest: the one its
 * capture pinned, by digest, or null when the version lists no such file. A
 * share stored before digests were kept serves the rendering its capture
 * minted (MINT_DEFAULT_RENDERING), or null when the version lists none.
 */
export const sharedSnapshotFile = (
    manifest: { artifacts?: ListedFile[] },
    artifactDigest: string | null,
): { url: string; digest: string } | null => {
    if (!artifactDigest) {
        return renderedFile(manifest, MINT_DEFAULT_RENDERING);
    }

    const file = withUrl(manifest).find((artifact) => artifact.artifact_digest === artifactDigest);

    return file?.url ? { url: file.url, digest: artifactDigest } : null;
};

/** Whether the request's `Accept` lists `text/html`, as a browser's does. A
 *  browser can wait on the preparing page. */
export const acceptsHtml = (accept: string | null): boolean =>
    (accept ?? '').split(',').some((entry) => {
        const [type, ...params] = entry.split(';').map((part) => part.trim().toLowerCase());

        return type === 'text/html' && !params.some((param) => /^q=0(\.0*)?$/.test(param));
    });

/**
 * A per-instance cap on requests held open on the Datasets API: a live
 * door read (held up to DEFINITION_TIMEOUT_MS) or a server-side operation
 * poll (up to OPERATION_WAIT_MS). Cloud Run serves 80 requests per
 * instance, so a full cap leaves the rest free for other visitors.
 * `tryEnter` takes a slot and returns its release, or null when the cap is
 * reached.
 */
export const MAX_UPSTREAM_WAITS = 8;

export type WaitGate = { tryEnter(): (() => void) | null };

export const createWaitGate = (limit: number): WaitGate => {
    let held = 0;

    return {
        tryEnter: () => {
            if (held >= limit) {
                return null;
            }

            held += 1;
            let released = false;

            return () => {
                if (!released) {
                    released = true;
                    held -= 1;
                }
            };
        },
    };
};

// The definition door holds a request for up to its own 120 s before it
// answers; past that it would have answered 202.
const DEFINITION_TIMEOUT_MS = 130_000;
/** How long a code client is held while its file is prepared. */
export const OPERATION_WAIT_MS = 240_000;
// Each operations poll answers in milliseconds.
const POLL_TIMEOUT_MS = 20_000;
// When the door is busy and names no wait of its own, or the cap is full.
const BUSY_RETRY_AFTER_S = '30';
// When the file is still being prepared after OPERATION_WAIT_MS.
const PREPARING_RETRY_AFTER_S = '60';

const NOT_PREPARED = 'The dataset could not be prepared. Open the share to download it.';

/** What the route answers: a redirect, or a plain-text reply. */
export type DownloadAnswer =
    | { kind: 'redirect'; status: 302 | 303; location: string }
    | { kind: 'reply'; status: number; text: string; retryAfter?: string };

const reply = (status: number, text: string, retryAfter?: string): DownloadAnswer => ({
    kind: 'reply',
    status,
    text,
    ...(retryAfter ? { retryAfter } : {}),
});

/** The answer once the client has gone, 499 (nginx's "client closed
 *  request"), which only the server's own log sees. */
export const CANCELLED: DownloadAnswer = reply(499, 'The request was cancelled.');

/** `signal`, if any, combined with a timeout of `ms`. */
const withTimeout = (signal: AbortSignal | undefined, ms: number): AbortSignal =>
    signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

const busy = (retryAfter: string | null = null): DownloadAnswer =>
    reply(503, 'The Datasets API is busy. Try again shortly.', retryAfter ?? BUSY_RETRY_AFTER_S);

/** Pins the version a live link served, given its manifest and the digest
 *  of the file served. The route awaits it and logs a failure. */
export type PinServed = (served: {
    manifest: VersionLinkDocument;
    specId: string;
    digest: string;
}) => Promise<void>;

type LiveDownload = {
    shareId: string;
    target: Extract<ShareDownload, { kind: 'live' }>;
    /** The request lists text/html (acceptsHtml). */
    html: boolean;
    base: string;
    gate: WaitGate;
    pin: PinServed;
    /** The request's own signal: a client that disconnects ends the wait
     *  and frees its slot of `gate`. */
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    /** Test seams for the operation poll. */
    waitMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
};

/**
 * Reads a live share's definition door and answers with the file it lists:
 * 302 to the file's stable link, after `pin`. A 202 sends a browser to the preparing
 * page (303) and holds any other client while the route polls the operation
 * for up to OPERATION_WAIT_MS; past that, 503 with `Retry-After`, and a
 * retry finds the stored file. Each read holds a slot of `gate`, and a full
 * gate answers 503 at once. The door's own 400 and 422 pass on, 404 or 410
 * is not found, 429 or 503 is busy, and anything else is 502. Once `signal`
 * aborts, the read or poll stops, nothing is pinned or logged, and the
 * answer (CANCELLED) reaches no one.
 */
export const serveLiveDownload = async ({
    shareId,
    target,
    html,
    base,
    gate,
    pin,
    signal,
    fetchImpl = datasetsFetch,
    waitMs = OPERATION_WAIT_MS,
    sleep,
    now,
}: LiveDownload): Promise<DownloadAnswer> => {
    const release = gate.tryEnter();

    if (!release) {
        return busy();
    }

    const log = (message: string, fields: Record<string, unknown>) =>
        console.error(`share-download: ${message}`, {
            share: shareId,
            spec: target.specId,
            ...fields,
        });

    try {
        const res = await fetchImpl(`${base}${target.path}`, {
            cache: 'no-store',
            signal: withTimeout(signal, DEFINITION_TIMEOUT_MS),
        }).catch((error: unknown) => {
            if (!signal?.aborted) {
                log('the definition door did not answer', { error: messageOf(error) });
            }

            return null;
        });
        const body: unknown = await res?.json().catch(() => null);

        if (signal?.aborted) {
            return CANCELLED;
        }

        if (!res) {
            return reply(502, NOT_PREPARED);
        }

        if (res.status === 202) {
            const operation = (body as Partial<OperationResource> | null)?.operation;

            if (operation && OPERATION_SHAPE.test(operation.operation_id)) {
                return html
                    ? {
                          kind: 'redirect',
                          status: 303,
                          location: preparingDownloadPath(
                              shareId,
                              operation.operation_id,
                              target.rendering,
                          ),
                      }
                    : await awaitOperation({
                          operation,
                          target,
                          base,
                          pin,
                          signal,
                          fetchImpl,
                          waitMs,
                          sleep,
                          now,
                          log,
                      });
            }
        }

        if (res.status === 200 && body) {
            const manifest = body as VersionLinkDocument;
            const file = storedDownload(manifest);

            if (file) {
                if (signal?.aborted) {
                    return CANCELLED;
                }

                await pin({ manifest, specId: target.specId, digest: file.digest });

                return { kind: 'redirect', status: 302, location: artifactHref(file.url) };
            }
        }

        return doorRefusal({ res, body, log });
    } finally {
        release();
    }
};

/** Polls a definition's operation to its manifest, then answers with the
 *  file of the rendering asked for. */
const awaitOperation = async ({
    operation,
    target,
    base,
    pin,
    signal,
    fetchImpl,
    waitMs,
    sleep,
    now,
    log,
}: {
    operation: OperationResource['operation'];
    target: Extract<ShareDownload, { kind: 'live' }>;
    base: string;
    pin: PinServed;
    signal: AbortSignal | undefined;
    fetchImpl: typeof fetch;
    waitMs: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    log: (message: string, fields: Record<string, unknown>) => void;
}): Promise<DownloadAnswer> => {
    // Every poll reads the operation by its checked id. The poll path a
    // response names is ignored.
    const pollUrl = `${base}/api/datasets/operations/${operation.operation_id}`;
    let manifest: VersionLinkDocument | null;

    try {
        manifest = await pollOperation(
            { ...operation, poll: pollUrl },
            {
                fetchImpl: (_path, attempt) =>
                    fetchImpl(pollUrl, {
                        cache: 'no-store',
                        signal: withTimeout(attempt, POLL_TIMEOUT_MS),
                    }),
                deadlineMs: waitMs,
                ...(signal ? { signal } : {}),
                ...(sleep ? { sleep } : {}),
                ...(now ? { now } : {}),
            },
        );
    } catch (error) {
        if (signal?.aborted) {
            return CANCELLED;
        }

        const { code, status } = error as { code?: unknown; status?: unknown };

        if (code === OPERATION_DEADLINE) {
            return reply(
                503,
                'The dataset is still being prepared. Try again in a minute, when the file will be ready.',
                PREPARING_RETRY_AFTER_S,
            );
        }

        if (status === 503) {
            return busy();
        }

        log('the operation failed', {
            operation: operation.operation_id,
            error: messageOf(error),
            code,
        });

        return reply(502, NOT_PREPARED);
    }

    const file = renderedFile(manifest, target.rendering);

    if (!manifest || !file) {
        log('the finished operation listed no file', { operation: operation.operation_id });

        return reply(502, NOT_PREPARED);
    }

    await pin({ manifest, specId: target.specId, digest: file.digest });

    return { kind: 'redirect', status: 302, location: artifactHref(file.url) };
};

/** The answer to a definition door response that carried no file. */
const doorRefusal = ({
    res,
    body,
    log,
}: {
    res: Response;
    body: unknown;
    log: (message: string, fields: Record<string, unknown>) => void;
}): DownloadAnswer => {
    const problem = body as Partial<ProblemDetails> | null;
    const detail = problem?.detail ? ` ${problem.detail}` : '';

    if (res.status === 404 || res.status === 410) {
        return reply(404, 'The Datasets API does not serve this dataset.');
    }

    if (res.status === 400 || res.status === 422) {
        return reply(
            res.status,
            `The Datasets API cannot build this file (${problem?.code ?? res.status}).${detail} Open the share to download it from the page.`,
        );
    }

    if (res.status === 429 || res.status === 503) {
        return busy(res.headers.get('Retry-After'));
    }

    log('the definition door failed', { status: res.status, code: problem?.code });

    return reply(502, NOT_PREPARED);
};

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);
