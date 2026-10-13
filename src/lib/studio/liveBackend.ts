/**
 * The server's calls to dfo-apis and dfo-ai for a live Studio share, and the
 * only module that knows their paths, bodies, and headers:
 *
 *   GET  {apis}/api/presentation/components/{id}?revision=N        readComponent
 *   POST {apis}/api/datasets/frames/refresh                        refreshFrame
 *   POST {apis}/api/presentation/components/{id}/revisions/{N}/render
 *                                                                  renderOnFrame
 *   GET  {apis}/api/presentation/components/{id}/revisions/{N}/render/data
 *                                                                  renderedExport
 *   GET  {apis}/api/presentation/components/{id}/revisions/{N}/data
 *                                                                  storedExport
 *   POST {ai}/api/studio/refresh                                   refreshDerived
 *
 * The refresh, render, and rendered export routes are gated by the
 * live-refresh credential (`LIVE_REFRESH_PRINCIPAL`), which dfo-apis takes in
 * the `x-dfo-principal` header and dfo-ai as a bearer token. The component
 * read and the stored export are public and carry no credential.
 *
 * Every failure is a `BackendError` whose `code` is machine-readable, either
 * one of this module's own codes or the code of the back end's refusal.
 * Nothing else of a refusal (its detail, its headers) leaves this module.
 *
 * No database or path-alias dependency, so `node --test` imports it directly.
 */

import { asRecord } from '../asRecord.ts';
import type { CardRef, FrameRef } from '../chat/widgets.ts';
import { searchApiBase } from '../searchApi.ts';
import type { CardDataOptions } from './cardDownload.ts';

type Env = Record<string, string | undefined>;

type UnknownRecord = Record<string, unknown>;

export type LiveBackend = {
    apisBase: string;
    aiBase: string;
    principal: string;
    fetch: typeof fetch;
    // Bounds every call made with this backend.
    signal?: AbortSignal;
};

/** dfo-apis' closed fact summary of one revision (`FactSummaryModel`), as far
 *  as the site reads it. A coordinate is null where the series has no value
 *  for that axis. */
export type LiveFactSummary = {
    series: {
        id: string;
        label: string;
        coordinates: Record<string, string | null>;
        point_count: number;
        first_value: string | null;
        last_value: string | null;
    }[];
    series_cut: number;
    window: { start: string; end: string } | null;
    unit: string | null;
};

/**
 * A card as dfo-apis resolved it: one revision's payload envelope
 * (`resolved_payload`) and fact summary, from a component read or from a
 * render on another frame, which have the same shape. The envelope's
 * `provenance` names the frame the card stands on, a render's
 * `refreshed_from`, and the series a rolling period left out.
 */
export type LiveCard = {
    component_id: string;
    revision: number;
    payload: UnknownRecord;
    fact_summary: LiveFactSummary;
};

/** A card and the frame it stands on. A component read gives the frame its
 *  stored intent names, and a render the frame it was drawn on. */
export type DrawnCard = { card: LiveCard; frame: FrameRef | null };

export type FrameVerdict =
    | { status: 'current' | 'moved'; frame: FrameRef }
    | { status: 'pending'; retryAfterS: number | null };

export type DerivedVerdict =
    | { status: 'current' }
    | { status: 'redrawn'; drawn: DrawnCard }
    | { status: 'pending'; retryAfterS: number | null };

/** What a failed back-end call came to. `status` is the HTTP status of a
 *  refusal, and absent when no response arrived or it could not be read.
 *  `retryable` is what the refusal itself says about asking again. dfo-apis'
 *  problem body carries it, and a refusal without it is not retryable. */
export class BackendError extends Error {
    readonly code: string;
    readonly status?: number;
    readonly retryable: boolean;

    constructor(code: string, status?: number, retryable = false) {
        super(`live share back end: ${code}`);
        this.name = 'BackendError';
        this.code = code;
        this.status = status;
        this.retryable = retryable;
    }
}

const PRINCIPAL_HEADER = 'x-dfo-principal';

/** `backend` with every call it makes ended after `ms` milliseconds, or when
 *  it already had a signal that ends sooner. */
export const bounded = (backend: LiveBackend, ms: number): LiveBackend => ({
    ...backend,
    signal: AbortSignal.any([AbortSignal.timeout(ms), ...(backend.signal ? [backend.signal] : [])]),
});

// dfo-ai stops a refresh at 53 seconds (its replay deadline of 45 plus a
// grace of 8) and answers `pending`. The call waits longer, so that answer
// arrives, and a call that does not get one fails as `backend_timeout`.
export const AI_REFRESH_TIMEOUT_MS = 60_000;

// A refusal's code is passed to the viewer only in this form, so no free
// text of a back end reaches a public response.
const CODE = /^[a-z][a-z0-9_]{0,63}$/;

/** The live-refresh credential, or null when the deployment has none. */
export const livePrincipal = (env: Env): string | null =>
    env.LIVE_REFRESH_PRINCIPAL?.trim() || null;

/** The back ends a live share calls, or null without the credential. dfo-ai
 *  defaults to the local harness, as the Studio proxy does. */
export const liveBackendFrom = (env: Env, fetcher: typeof fetch): LiveBackend | null => {
    const principal = livePrincipal(env);

    return principal
        ? {
              apisBase: searchApiBase(env),
              aiBase: env.STUDIO_API_BASE?.trim() || 'http://localhost:8080',
              principal,
              fetch: fetcher,
          }
        : null;
};

const asFrameRef = (value: unknown): FrameRef | null => {
    const record = asRecord(value);
    const specId = record?.['spec_id'];
    const contentVersion = record?.['content_version'];

    return typeof specId === 'string' && specId && typeof contentVersion === 'string'
        ? { spec_id: specId, content_version: contentVersion }
        : null;
};

const refusalOf = async (res: Response): Promise<{ code: string; retryable: boolean }> => {
    const body = asRecord(await res.json().catch(() => null));
    const code = body?.['code'] ?? body?.['error'];

    return {
        code: typeof code === 'string' && CODE.test(code) ? code : 'backend_refused',
        retryable: body?.['retryable'] === true,
    };
};

const send = async (backend: LiveBackend, url: string, init: RequestInit): Promise<Response> => {
    let res: Response;

    try {
        res = await backend.fetch(url, {
            ...init,
            cache: 'no-store',
            redirect: 'manual',
            signal: backend.signal,
        });
    } catch (error) {
        const timedOut =
            error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError');

        throw new BackendError(timedOut ? 'backend_timeout' : 'backend_unreachable');
    }

    if (!res.ok) {
        const { code, retryable } = await refusalOf(res);

        throw new BackendError(code, res.status, retryable);
    }

    return res;
};

const json = async (
    backend: LiveBackend,
    url: string,
    init: RequestInit,
): Promise<UnknownRecord> => {
    const res = await send(backend, url, init);
    const body = asRecord(await res.json().catch(() => null));

    if (!body) {
        throw new BackendError('backend_invalid');
    }

    return body;
};

const post = (headers: Record<string, string>, body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
});

// The forms of a component id and revision in dfo-apis' paths. A stored ref
// that does not match stays out of every URL, because `.` and `..` would
// move the credentialed path by a segment.
const COMPONENT_ID = /^cmp_[A-Za-z0-9_-]{1,64}$/;

/** Whether `ref` names a component revision in the service's own form. */
export const isServiceRef = (ref: { component_id?: unknown; revision?: unknown }): boolean =>
    typeof ref.component_id === 'string' &&
    COMPONENT_ID.test(ref.component_id) &&
    Number.isSafeInteger(ref.revision) &&
    (ref.revision as number) >= 1;

// The one place a ref becomes a path, so every call that carries a
// credential or reads a stored row passes the check.
const componentPath = (ref: CardRef): string => {
    if (!isServiceRef(ref)) {
        throw new BackendError('request_invalid');
    }

    return `/api/presentation/components/${ref.component_id}`;
};

const revisionPath = (ref: CardRef): string => `${componentPath(ref)}/revisions/${ref.revision}`;

// A component read and a render answer alike with `resolved_payload`.
const cardOf = (body: UnknownRecord): LiveCard => {
    const payload = asRecord(body['resolved_payload']);
    const facts = asRecord(body['fact_summary']);

    if (
        typeof body['component_id'] !== 'string' ||
        !Number.isInteger(body['revision']) ||
        !payload ||
        !facts
    ) {
        throw new BackendError('backend_invalid');
    }

    return {
        component_id: body['component_id'],
        revision: body['revision'] as number,
        payload,
        // dfo-apis' closed fact summary, passed on as it came.
        fact_summary: facts as LiveFactSummary,
    };
};

// The frame a card was drawn on is the first input of its envelope's
// provenance. A render's `stored_intent.frame_ref` is the stored revision's
// own frame, not the one drawn.
const drawnFrame = (card: LiveCard): FrameRef | null => {
    const inputs = asRecord(card.payload['provenance'])?.['inputs'];

    return asFrameRef(Array.isArray(inputs) ? inputs[0] : undefined);
};

const drawnCard = (body: UnknownRecord): DrawnCard => {
    const card = cardOf(body);

    return { card, frame: drawnFrame(card) };
};

const retryAfter = (body: UnknownRecord): number | null =>
    typeof body['retry_after_s'] === 'number' ? body['retry_after_s'] : null;

/** One stored revision, with the frame its stored intent names. */
export const readComponent = async (backend: LiveBackend, ref: CardRef): Promise<DrawnCard> => {
    const body = await json(
        backend,
        `${backend.apisBase}${componentPath(ref)}?revision=${ref.revision}`,
        {},
    );

    return {
        card: cardOf(body),
        frame: asFrameRef(asRecord(body['stored_intent'])?.['frame_ref']),
    };
};

/** Whether a dataset frame is still its dataset's current rendering. */
export const refreshFrame = async (
    backend: LiveBackend,
    frame: FrameRef,
): Promise<FrameVerdict> => {
    const body = await json(
        backend,
        `${backend.apisBase}/api/datasets/frames/refresh`,
        post({ [PRINCIPAL_HEADER]: backend.principal }, frame),
    );
    const status = body['status'];

    if (status === 'pending') {
        return { status, retryAfterS: retryAfter(body) };
    }

    const current = asFrameRef(body['frame']);

    if ((status !== 'current' && status !== 'moved') || !current) {
        throw new BackendError('backend_invalid');
    }

    return { status, frame: current };
};

/** A stored revision's intent drawn on another frame. */
export const renderOnFrame = async (
    backend: LiveBackend,
    ref: CardRef,
    frame: FrameRef,
): Promise<DrawnCard> =>
    drawnCard(
        await json(
            backend,
            `${backend.apisBase}${revisionPath(ref)}/render`,
            post({ [PRINCIPAL_HEADER]: backend.principal }, { frame }),
        ),
    );

/** dfo-ai's refresh of a card on a derived frame. */
export const refreshDerived = async (
    backend: LiveBackend,
    ref: CardRef,
): Promise<DerivedVerdict> => {
    const body = await json(
        bounded(backend, AI_REFRESH_TIMEOUT_MS),
        `${backend.aiBase}/api/studio/refresh`,
        post({ authorization: `Bearer ${backend.principal}` }, ref),
    );
    const status = body['status'];

    if (status === 'current') {
        return { status };
    }

    if (status === 'pending') {
        return { status, retryAfterS: retryAfter(body) };
    }

    const render = asRecord(body['render']);

    if (status !== 'redrawn' || !render) {
        throw new BackendError('backend_invalid');
    }

    return { status, drawn: drawnCard(render) };
};

// The export routes validate `format` and `bundle` themselves. The caller's
// values go through as they came, and no other parameter of the caller does.
const exportQuery = (options: Partial<Record<keyof CardDataOptions, string>>): URLSearchParams => {
    const query = new URLSearchParams();

    for (const name of ['format', 'bundle'] as const) {
        const value = options[name];

        if (value !== undefined) {
            query.set(name, value);
        }
    }

    return query;
};

export type ExportOptions = Partial<Record<keyof CardDataOptions, string>>;

/** The rows behind a stored revision's shown values, as a file. */
export const storedExport = async (
    backend: LiveBackend,
    ref: CardRef,
    options: ExportOptions,
): Promise<Response> => {
    const query = exportQuery(options).toString();

    return send(backend, `${backend.apisBase}${revisionPath(ref)}/data${query && `?${query}`}`, {});
};

/** The rows behind a revision drawn on `frame`, as a file. */
export const renderedExport = async (
    backend: LiveBackend,
    ref: CardRef,
    frame: FrameRef,
    options: ExportOptions,
): Promise<Response> => {
    const query = exportQuery(options);

    query.set('spec_id', frame.spec_id);
    query.set('content_version', frame.content_version);

    return send(backend, `${backend.apisBase}${revisionPath(ref)}/render/data?${query}`, {
        headers: { [PRINCIPAL_HEADER]: backend.principal },
    });
};
