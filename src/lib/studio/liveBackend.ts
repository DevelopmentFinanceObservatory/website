/**
 * The server's read of one component revision from dfo-apis, the public
 * route a share's live cards are checked against before the share is made:
 *
 *   GET {apis}/api/presentation/components/{id}?revision=N        readComponent
 *
 * The route carries no credential. Callers inject the fetch (src/lib/apisAuth
 * through `SharesBackend`), which adds the site's Cloud Run ID token. A
 * share slot's card has the read's shape, so `componentReadOf` and
 * `drawnFrame` read it too.
 *
 * Every failure is a `BackendError` whose `code` is machine-readable, either
 * one of this module's own codes or the code of dfo-apis' refusal. Nothing
 * else of a refusal (its detail, its headers) leaves this module.
 *
 * No database or path-alias dependency, so `node --test` imports it directly.
 */

import { asRecord } from '../asRecord.ts';
import type { CardRef, FrameRef } from '../chat/widgets.ts';

type UnknownRecord = Record<string, unknown>;

export type LiveBackend = {
    apisBase: string;
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
 * (`resolved_payload`) and fact summary, from a component read or a share
 * slot, which have the same shape. The envelope's `provenance` names the
 * frame the card stands on and the series a rolling period left out.
 */
export type LiveCard = {
    component_id: string;
    revision: number;
    payload: UnknownRecord;
    fact_summary: LiveFactSummary;
};

/** A card and the frame its stored intent names. */
export type DrawnCard = { card: LiveCard; frame: FrameRef | null };

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

/** `backend` with every call it makes ended after `ms` milliseconds, or when
 *  it already had a signal that ends sooner. */
export const bounded = (backend: LiveBackend, ms: number): LiveBackend => ({
    ...backend,
    signal: AbortSignal.any([AbortSignal.timeout(ms), ...(backend.signal ? [backend.signal] : [])]),
});

// A refusal's code is passed to the viewer only in this form, so no free
// text of a back end reaches a public response.
const CODE = /^[a-z][a-z0-9_]{0,63}$/;

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

const send = async (backend: LiveBackend, url: string): Promise<Response> => {
    let res: Response;

    try {
        res = await backend.fetch(url, {
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

const json = async (backend: LiveBackend, url: string): Promise<UnknownRecord> => {
    const res = await send(backend, url);
    const body = asRecord(await res.json().catch(() => null));

    if (!body) {
        throw new BackendError('backend_invalid');
    }

    return body;
};

// The forms of a component id and revision in dfo-apis' paths. A stored ref
// that does not match stays out of every URL, because `.` and `..` would
// move the path by a segment.
const COMPONENT_ID = /^cmp_[A-Za-z0-9_-]{1,64}$/;

// Whether `ref` names a component revision in the service's own form.
const isServiceRef = (ref: { component_id?: unknown; revision?: unknown }): boolean =>
    typeof ref.component_id === 'string' &&
    COMPONENT_ID.test(ref.component_id) &&
    Number.isSafeInteger(ref.revision) &&
    (ref.revision as number) >= 1;

// The one place a ref becomes a path, so every read passes the check.
const componentPath = (ref: CardRef): string => {
    if (!isServiceRef(ref)) {
        throw new BackendError('request_invalid');
    }

    return `/api/presentation/components/${ref.component_id}`;
};

// A component read and a share slot's card alike carry `resolved_payload`.
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
// provenance. The read's `stored_intent.frame_ref` is the stored revision's
// own frame, which can differ from the one drawn.
export const drawnFrame = (card: LiveCard): FrameRef | null => {
    const inputs = asRecord(card.payload['provenance'])?.['inputs'];

    return asFrameRef(Array.isArray(inputs) ? inputs[0] : undefined);
};

/** A body in dfo-apis' component read shape: the card, with the frame its
 *  stored intent names. A share slot's card has this shape too. */
export const componentReadOf = (body: UnknownRecord): DrawnCard => ({
    card: cardOf(body),
    frame: asFrameRef(asRecord(body['stored_intent'])?.['frame_ref']),
});

/** One stored revision, with the frame its stored intent names. */
export const readComponent = async (backend: LiveBackend, ref: CardRef): Promise<DrawnCard> =>
    componentReadOf(
        await json(backend, `${backend.apisBase}${componentPath(ref)}?revision=${ref.revision}`),
    );
