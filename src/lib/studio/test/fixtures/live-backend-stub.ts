/**
 * A stubbed dfo-apis and dfo-ai for the live share tests: a `fetch` that
 * answers the routes `liveBackend.ts` calls and records every call. Every
 * dfo-apis answer is built from a pair of the recording
 * (`wire-pairs.json`, through `recorded-wire.ts`) with only the ids a test
 * names swapped in, so the stub keeps the service's shapes. A refusal echoes
 * the credential it was sent in its detail and in a header, so a test can
 * assert that neither reaches a response of the site.
 */
import { bodyOf, frameOfAnswer, pairOf, responseOf } from './recorded-wire.ts';

export const PRINCIPAL = 'lrp-test-credential-7f3a9c';

export const APIS = 'https://apis.example';
export const AI = 'https://ai.example';

export const ENV = {
    SEARCH_API_BASE: APIS,
    STUDIO_API_BASE: AI,
    LIVE_REFRESH_PRINCIPAL: PRINCIPAL,
};

type Frame = { spec_id: string; content_version: string };

// The frames of the recording: a dataset card read at its stored frame and
// rendered on the one the dataset moved to, and a derived card stored on one
// op-spec frame and replayed onto another.
export const DATASET_FRAME: Frame = bodyOf('component_read.at_revision')['stored_intent'].frame_ref;
export const MOVED_FRAME: Frame = frameOfAnswer('frame_refresh.moved');
export const DERIVED_FRAME: Frame = bodyOf('render.derived_card_with_anchor_warning')[
    'stored_intent'
].frame_ref;
export const REPLAYED_FRAME: Frame = bodyOf('render.derived_card_with_anchor_warning')[
    'resolved_payload'
].provenance.inputs[0];

const isDerived = (frame: Frame | null): boolean => frame?.spec_id.startsWith('ops_') ?? false;

/** dfo-apis' component read of one revision whose stored intent names
 *  `frame`: the recorded read of a dataset card, or of a derived card for an
 *  `ops_` frame. */
export const componentRead = (componentId: string, revision: number, frame: Frame | null) => {
    const body = bodyOf(
        isDerived(frame) ? 'render.derived_card_with_anchor_warning' : 'component_read.at_revision',
    );

    body['component_id'] = componentId;
    body['revision'] = revision;
    body['resolved_payload'].component_id = componentId;
    body['resolved_payload'].revision = revision;
    body['resolved_payload'].provenance.refreshed_from = null;

    if (frame) {
        body['stored_intent'].frame_ref = frame;
        body['resolved_payload'].provenance.inputs = [frame];
    } else {
        delete body['stored_intent'].frame_ref;
        body['resolved_payload'].provenance.inputs = [];
    }

    return body;
};

/** dfo-apis' render of one revision on `target`: the recorded render of a
 *  dataset card, or of a derived card for an `ops_` target. Its
 *  `stored_intent` names the frame the revision was stored on, as the
 *  service's does, and the envelope names `target`. */
export const renderReply = (componentId: string, revision: number, target: Frame) => {
    const body = bodyOf(
        isDerived(target) ? 'render.derived_card_with_anchor_warning' : 'render.dataset_card',
    );

    body['component_id'] = componentId;
    body['revision'] = revision;
    body['resolved_payload'].component_id = componentId;
    body['resolved_payload'].revision = revision;
    body['resolved_payload'].provenance.inputs = [target];
    body['resolved_payload'].provenance.refreshed_from = revision;

    return body;
};

export type StubCall = {
    method: string;
    url: string;
    path: string;
    headers: Headers;
    body: unknown;
    signal: AbortSignal | null | undefined;
};

type Reply = Response | Promise<Response>;

export type StubScript = {
    // The frame each component's stored intent names, by component id. A
    // component left out answers 404.
    components: Record<string, Frame | null>;
    refreshFrame?: (call: StubCall) => Reply;
    render?: (call: StubCall) => Reply;
    refreshDerived?: (call: StubCall) => Reply;
    renderedExport?: (call: StubCall) => Reply;
    storedExport?: (call: StubCall) => Reply;
};

/** A call that never answers: it fails the way `fetch` does once the
 *  caller's signal ends. */
export const stalled = (call: StubCall): Promise<Response> =>
    new Promise((_resolve, reject) => {
        call.signal?.addEventListener('abort', () => reject(call.signal?.reason), { once: true });
    });

export const json = (body: unknown, status = 200): Response => Response.json(body, { status });

/** dfo-apis' frame refresh answer `current` or `moved`, on `frame`. */
export const frameAnswer = (status: 'current' | 'moved', frame: Frame): Response =>
    json({ ...bodyOf('frame_refresh.current'), status, frame });

/** dfo-apis' frame refresh answer `pending`, with the recorded wait (a
 *  float) unless `retryAfterS` names one. */
export const pendingAnswer = (retryAfterS?: number): Response =>
    json({
        ...bodyOf('frame_refresh.pending'),
        ...(retryAfterS === undefined ? {} : { retry_after_s: retryAfterS }),
    });

/** A refusal as dfo-apis sends one (problem JSON with the recorded keys),
 *  echoing the credential it was sent in its detail and a header. */
export const refusal = (
    code: string,
    status: number,
    call: StubCall,
    retryable = false,
): Response => {
    const sent = call.headers.get('x-dfo-principal') ?? call.headers.get('authorization') ?? '';

    return Response.json(
        {
            ...bodyOf('render.render_target_mismatch'),
            code,
            status,
            retryable,
            detail: `refused for ${sent}`,
        },
        {
            status,
            headers: {
                'content-type': pairOf('render.render_target_mismatch').response.headers[
                    'content-type'
                ]!,
                'x-echo': sent,
            },
        },
    );
};

/**
 * dfo-ai's answers to `POST /api/studio/refresh`. dfo-ai has no recording
 * file: the shapes are the JSON documented for the route, and the codes and
 * statuses are the harness's `REFRESH_CODES` table in
 * `services/harness/src/harness/live_refresh.py`. `retry` is whether asking
 * again can succeed. A code outside the table is passed through from
 * dfo-apis or the replayer under 422 and is permanent.
 */
export const AI_REFUSALS = {
    unauthorized: { status: 401, retry: false },
    request_invalid: { status: 422, retry: false },
    component_not_found: { status: 422, retry: false },
    frame_unsupported: { status: 422, retry: false },
    dataset_frame: { status: 422, retry: false },
    recipe_missing: { status: 422, retry: false },
    recipe_invalid: { status: 422, retry: false },
    dfo_apis_refused: { status: 422, retry: false },
    upstream_unavailable: { status: 503, retry: true },
    refresh_not_configured: { status: 503, retry: false },
} as const;

export const aiCurrent = (): Response => json({ status: 'current' });

/** `pending`, with a wait that may be fractional (1.0, 1.5, 2.0, 2.5, 5.0 occur). */
export const aiPending = (retryAfterS = 1.5): Response =>
    json({ status: 'pending', retry_after_s: retryAfterS });

/** `redrawn`, whose `render` is the dfo-apis component read of the redraw. */
export const aiRedrawn = (render: unknown): Response => json({ status: 'redrawn', render });

/** A refusal, `{code, detail}`, echoing the credential it was sent in its
 *  detail and a header. A code outside `AI_REFUSALS` answers 422. */
export const aiRefusal = (code: string, call: StubCall): Response => {
    const sent = call.headers.get('authorization') ?? '';
    const { status } = AI_REFUSALS[code as keyof typeof AI_REFUSALS] ?? { status: 422 };

    return Response.json(
        { code, detail: `refused for ${sent}` },
        {
            status,
            headers: {
                'cache-control': 'no-store',
                'x-echo': sent,
                ...(status === 401 ? { 'www-authenticate': 'Bearer' } : {}),
            },
        },
    );
};

// The recorded export of a rendered card, with a cookie the site must not
// pass on.
const renderedFile = (): Response => {
    const recorded = responseOf('render_data.csv');
    const headers = new Headers(recorded.headers);

    headers.set('set-cookie', 'upstream=1');

    return new Response(recorded.body, { headers });
};

const storedFile = (): Response =>
    new Response('year,value\n2024,1\n', {
        headers: {
            'content-type': 'text/csv',
            'content-disposition': 'attachment; filename="stored.csv"',
            'set-cookie': 'upstream=1',
        },
    });

const COMPONENT = /^\/api\/presentation\/components\/([^/]+)$/;
const REVISION =
    /^\/api\/presentation\/components\/([^/]+)\/revisions\/(\d+)\/(render|render\/data|data)$/;

export const stubBackend = (script: StubScript) => {
    const calls: StubCall[] = [];

    const answer = (call: StubCall, url: URL): Reply => {
        const read = url.origin === APIS && call.method === 'GET' && COMPONENT.exec(url.pathname);

        if (read) {
            const id = decodeURIComponent(read[1]!);

            return id in script.components
                ? json(
                      componentRead(
                          id,
                          Number(url.searchParams.get('revision')),
                          script.components[id]!,
                      ),
                  )
                : refusal('not_found', 404, call);
        }

        if (url.origin === APIS && url.pathname === '/api/datasets/frames/refresh') {
            return script.refreshFrame?.(call) ?? refusal('unscripted', 500, call);
        }

        if (url.origin === AI && url.pathname === '/api/studio/refresh') {
            return script.refreshDerived?.(call) ?? aiRefusal('unscripted', call);
        }

        const revision = url.origin === APIS && REVISION.exec(url.pathname);

        if (revision && revision[3] === 'render') {
            return script.render?.(call) ?? refusal('unscripted', 500, call);
        }

        if (revision && revision[3] === 'render/data') {
            return script.renderedExport?.(call) ?? renderedFile();
        }

        if (revision) {
            return script.storedExport?.(call) ?? storedFile();
        }

        return refusal('no_such_route', 404, call);
    };

    const fetcher: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        const call: StubCall = {
            method: init?.method ?? 'GET',
            url: url.href,
            path: url.pathname,
            headers: new Headers(init?.headers),
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
            signal: init?.signal,
        };

        calls.push(call);

        return answer(call, url);
    };

    return {
        calls,
        fetch: fetcher,
        to: (path: string): StubCall[] => calls.filter((call) => call.path.endsWith(path)),
    };
};
