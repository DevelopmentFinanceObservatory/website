/**
 * Search snapshot shares: capture (mint and pin). A snapshot share holds
 * `{spec_id, content_version, artifact_digest}`. Capture mints the part with
 * the default options and pins the file they render, the one the share's
 * download link serves. dfo-apis keeps the version's canonical frame for as
 * long as any of its artifacts is pinned, so the version outlives the working
 * tier. The share view reads the frozen observations back from dfo-apis
 * (`GET /api/datasets/{spec_id}/{content_version}/observations`, see
 * `fetchSnapshotObservations` in searchClient.ts).
 *
 * This module has no DOM, database, or path-alias dependency, so
 * `node --test` imports it directly. `searchShare.ts` captures through it and
 * `/api/download-pin` pins a downloaded version through it.
 */

import type {
    ArtifactEntryModel,
    Manifest,
    MintOptions,
    PinRequest,
    ProblemDetails,
} from '@developmentfinance/client/wire';

import { datasetsFetch } from './datasetsFetch.ts';
import { pollOperation } from './operationPoll.ts';
import { SPEC_SHAPE, VERSION_SHAPE } from './versionLink.ts';

/** The fields of a Datasets manifest this module reads. */
export type SnapshotManifest = Pick<Manifest, 'content_version' | 'definition' | 'artifacts'>;

/** The rendering a file was made with, as a manifest lists it
 *  (`MintOptions` dumped without its unset fields). */
export type FileRendering = Required<Pick<MintOptions, 'format' | 'bundle'>>;

/** What a mint without options renders (dfo-apis' `MintOptions` defaults), a
 *  CSV bundle. A snapshot capture mints and pins this rendering. */
export const MINT_DEFAULT_RENDERING: FileRendering = { format: 'csv', bundle: true };

// A rendering that sets any of these (every MintOptions member beside `format` and `bundle`) is
// reshaped, enriched or cut, so it is a different file from the plain one with the same format and
// bundle. A null or false member is unset.
const RESHAPES = [
    'columns',
    'pivot',
    'groupby',
    'layout',
    'without_party_totals',
] as const satisfies readonly (keyof MintOptions)[];

/**
 * The listed file made with exactly `format` and `bundle` and no reshape or cut, or
 * undefined. A version manifest lists every rendering stored for the
 * version, so the first bundle it lists can be an xlsx or column-enriched
 * one. A statistics artifact carries no format and never matches.
 */
export const renderingArtifact = <
    TArtifact extends Pick<ArtifactEntryModel, 'artifact_digest' | 'rendering'>,
>(
    artifacts: readonly TArtifact[] | undefined,
    { format, bundle }: FileRendering,
): TArtifact | undefined =>
    artifacts?.find(
        ({ artifact_digest, rendering }) =>
            !!artifact_digest &&
            rendering.format === format &&
            rendering.bundle === bundle &&
            RESHAPES.every((key) => !rendering[key]),
    );

/** The pin failed or cannot be attempted, so the snapshot would expire with
 *  the working tier. POST /api/share answers this code as its `detail`. */
export const PIN_REFUSED = 'pin_refused';

/** The pin door is pinning nothing right now (429 or 503) because its daily
 *  allowance is spent or it is busy. POST /api/share answers this code as
 *  its `detail`. */
export const PIN_UNAVAILABLE = 'pin_unavailable';

const UNAVAILABLE_STATUSES = new Set([429, 503]);

/** The first artifact the manifest lists with a digest, or undefined. */
const firstArtifact = (manifest: SnapshotManifest) =>
    manifest.artifacts?.find((artifact) => artifact.artifact_digest);

// Upstream bounds: a synchronous mint runs up to the mint door's own 120 s
// timeout (an over-budget one answers 202 at once and is polled under the
// caller's deadline); the version read and the pin answer in seconds.
const MINT_TIMEOUT_MS = 120_000;
const DOOR_TIMEOUT_MS = 20_000;

const poster =
    (base: string, fetchImpl: typeof fetch) =>
    async (
        path: string,
        body: unknown,
        { headers = {}, timeoutMs }: { headers?: Record<string, string>; timeoutMs: number },
    ) => {
        const res = await fetchImpl(`${base}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
            cache: 'no-store',
            signal: AbortSignal.timeout(timeoutMs),
        });

        return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
    };

type PinOptions = {
    base: string;
    specId: string;
    contentVersion: string;
    artifactDigest: string;
    /** `x-dfo-principal`; it must equal dfo-apis'
     *  DATASETS_PIN_FIRST_PARTY_PRINCIPAL. */
    principal: string;
    fetchImpl?: typeof fetch;
};

/**
 * Pins one artifact of a version, so it outlives the working tier's 30 days.
 * Throws `PIN_UNAVAILABLE` when the pin door is pinning nothing right now,
 * and `PIN_REFUSED` when it refuses otherwise or cannot be reached; either
 * carries the platform's `detail` (else its code) as the cause.
 */
export const pinArtifact = async ({
    base,
    specId,
    contentVersion,
    artifactDigest,
    principal,
    fetchImpl = datasetsFetch,
}: PinOptions): Promise<void> => {
    const pinned = await poster(base, fetchImpl)(
        `/api/datasets/${specId}/${contentVersion}/pin`,
        { schema_version: 1, artifact_digest: artifactDigest } satisfies PinRequest,
        { headers: { 'x-dfo-principal': principal }, timeoutMs: DOOR_TIMEOUT_MS },
    ).catch((error: unknown) => ({ ok: false, status: 0, body: null, error }));

    if (!pinned.ok) {
        throw new Error(UNAVAILABLE_STATUSES.has(pinned.status) ? PIN_UNAVAILABLE : PIN_REFUSED, {
            cause: new Error(pinned.body?.detail ?? pinned.body?.code ?? `pin ${pinned.status}`),
        });
    }
};

type CaptureOptions = {
    base: string;
    specId: string;
    definition: unknown;
    /** The version the mint must land on to be pinned; a mint that lands
     *  elsewhere throws `snapshot_version_moved` and pins nothing. */
    expectedContentVersion?: string;
    /** `x-dfo-principal` for the pin; it must equal dfo-apis'
     *  DATASETS_PIN_FIRST_PARTY_PRINCIPAL. */
    principal: string | undefined;
    pollDeadlineMs: number;
    fetchImpl?: typeof fetch;
};

/**
 * Mints the part with the default options and pins the file they render
 * (MINT_DEFAULT_RENDERING), which a snapshot share's download link serves.
 * Resolves to the version and the digest it pinned. Throws on a refused mint
 * (the platform's code as the message), `PIN_REFUSED` when the manifest
 * lists no such file, and `PIN_REFUSED` or `PIN_UNAVAILABLE` when the pin
 * cannot be made, so no unpinned snapshot is ever stored.
 */
export const captureSnapshot = async ({
    base,
    specId,
    definition,
    expectedContentVersion,
    principal,
    pollDeadlineMs,
    fetchImpl = datasetsFetch,
}: CaptureOptions): Promise<{ specId: string; contentVersion: string; artifactDigest: string }> => {
    // dfo-apis refuses every pin without the principal: fail before minting.
    if (!principal) {
        throw new Error(PIN_REFUSED, { cause: new Error('DFO_PRINCIPAL is not set') });
    }

    const post = poster(base, fetchImpl);

    const minted = await post(
        '/api/datasets',
        {
            schema_version: 1,
            input: {
                kind: 'spec_id',
                spec_id: specId,
                definition,
            },
        },
        { timeoutMs: MINT_TIMEOUT_MS },
    );

    if (!minted.ok) {
        throw new Error(minted.body?.code ?? `mint ${minted.status}`);
    }

    // An over-budget mint answers 202 with an operation envelope; a done
    // poll needs no principal.
    const manifest = (
        minted.status === 202
            ? await pollOperation(minted.body.operation, {
                  fetchImpl: (url) =>
                      fetchImpl(`${base}${url}`, {
                          cache: 'no-store',
                          signal: AbortSignal.timeout(DOOR_TIMEOUT_MS),
                      }),
                  deadlineMs: pollDeadlineMs,
              })
            : minted.body
    ) as (Partial<SnapshotManifest> & Partial<Pick<ProblemDetails, 'code'>>) | null;

    if (typeof manifest?.content_version !== 'string') {
        throw new Error(manifest?.code ?? `mint ${minted.status}`);
    }

    const capturedSpecId = manifest.definition?.spec_id ?? specId;
    const contentVersion = manifest.content_version;

    if (expectedContentVersion && contentVersion !== expectedContentVersion) {
        throw new Error('snapshot_version_moved', { cause: new Error(contentVersion) });
    }

    // An async mint's done manifest lists every rendering of the version,
    // so the default one is picked by its rendering.
    const digest = renderingArtifact(manifest.artifacts, MINT_DEFAULT_RENDERING)?.artifact_digest;

    if (!digest) {
        throw new Error(PIN_REFUSED, { cause: new Error('mint listed no default rendering') });
    }

    await pinArtifact({
        base,
        specId: capturedSpecId,
        contentVersion,
        artifactDigest: digest,
        principal,
        fetchImpl,
    });

    return { specId: capturedSpecId, contentVersion, artifactDigest: digest };
};

type FramePinOptions = Omit<CaptureOptions, 'principal' | 'expectedContentVersion'> & {
    contentVersion: string;
    principal: string;
};

/**
 * Pins a downloaded version, so the version link (`/data?spec=&v=`) keeps
 * opening and reads its rows from dfo-apis. The first artifact the version
 * lists is pinned, already pinned or not, and dfo-apis then keeps the
 * version's canonical frame. A version listing none is minted again and
 * pinned only when the mint lands on the same version. Resolves to what it
 * did; throws on a refusal, and `snapshot_version_moved` when the data has
 * moved on.
 */
export const pinVersionFrame = async ({
    contentVersion,
    ...capture
}: FramePinOptions): Promise<'already_pinned' | 'pinned' | 'minted'> => {
    const { base, specId, principal, fetchImpl = datasetsFetch } = capture;
    const res = await fetchImpl(`${base}/api/datasets/${specId}/${contentVersion}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(DOOR_TIMEOUT_MS),
    });

    if (!res.ok) {
        throw new Error(`version ${res.status}`);
    }

    const artifact = firstArtifact((await res.json()) as SnapshotManifest);

    // A pinned tier can still lack this principal's retention reference. The
    // pin door repairs it on a repeat call, so a listed artifact always pins.
    if (artifact?.artifact_digest) {
        await pinArtifact({
            base,
            specId,
            contentVersion,
            artifactDigest: artifact.artifact_digest,
            principal,
            fetchImpl,
        });

        return artifact.tier === 'pinned' ? 'already_pinned' : 'pinned';
    }

    await captureSnapshot({ ...capture, expectedContentVersion: contentVersion });

    return 'minted';
};

/** The largest /api/download-pin body read, in bytes: room for a
 *  definition. */
export const MAX_DOWNLOAD_PIN_BODY = 256_000;

export type DownloadPinRequest = {
    specId: string;
    contentVersion: string;
    definition: Record<string, unknown> | null;
};

/**
 * A /api/download-pin body, read up to `MAX_DOWNLOAD_PIN_BODY`, or null
 * when it is malformed: a spec and version of the link's shape and a
 * definition object (or none). The route mints with the definition when the
 * version lists no artifact.
 */
export const parseDownloadPin = (text: string): DownloadPinRequest | null => {
    let body: unknown;

    try {
        body = JSON.parse(text);
    } catch {
        return null;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return null;
    }

    const { specId, contentVersion, definition } = body as Record<string, unknown>;

    if (
        typeof specId !== 'string' ||
        !SPEC_SHAPE.test(specId) ||
        typeof contentVersion !== 'string' ||
        !VERSION_SHAPE.test(contentVersion)
    ) {
        return null;
    }

    if (definition != null && (typeof definition !== 'object' || Array.isArray(definition))) {
        return null;
    }

    return {
        specId,
        contentVersion,
        definition: (definition as Record<string, unknown> | null | undefined) ?? null,
    };
};
