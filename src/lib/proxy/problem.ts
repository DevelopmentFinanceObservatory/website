/**
 * The problem documents the proxy answers with when it refuses a call
 * itself: a route it does not have (404), a spent allowance (429), an
 * upstream it cannot reach (502, 503). They are in the shape dfo-apis uses
 * for its own refusals (the docs corpus's dfo-apis/conventions.md, "Problem
 * details"): `application/problem+json` with the registry `code`, a
 * `trace_id` repeated in the `x-dfo-trace-id` header, and `retryable`. A
 * client such as the SDK branches on `code`, so a bare status or a body
 * without one reads as a refusal with no cause. Kept apart from the route so
 * `node --test` can load it.
 */

export const TITLES = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    413: 'Content Too Large',
    422: 'Unprocessable Content',
    429: 'Too Many Requests',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
} as const;

export type ProblemStatus = keyof typeof TITLES;

/**
 * The codes the API's refusal registry or the client contract's
 * `proxy-codes.json` holds, so `/codes/<code>` resolves to a page. Any other
 * code the site refuses with is its own, and its `type` is `about:blank`.
 */
export const REGISTRY_CODES = [
    'request_invalid',
    'not_found',
    'rate_limited',
    'transient_unavailable',
] as const;

const registryCodes: ReadonlySet<string> = new Set(REGISTRY_CODES);

type ProblemInit = {
    status: ProblemStatus;
    code: string;
    detail: string;
    retryable: boolean;
    // Sent with the document, such as Retry-After or the X-RateLimit-* set.
    headers?: Record<string, string>;
    // Members the code defines beyond the common set. They never replace one
    // of the common members.
    extra?: Record<string, unknown>;
};

/** A problem document for `code`, with a fresh trace id. */
export const problem = ({
    status,
    code,
    detail,
    retryable,
    headers,
    extra,
}: ProblemInit): Response => {
    const traceId = crypto.randomUUID().replaceAll('-', '');

    return Response.json(
        {
            ...extra,
            type: registryCodes.has(code) ? `/codes/${code}` : 'about:blank',
            title: TITLES[status],
            status,
            detail,
            code,
            trace_id: traceId,
            retryable,
        },
        {
            status,
            headers: {
                'Cache-Control': 'no-cache',
                ...headers,
                'Content-Type': 'application/problem+json',
                'x-dfo-trace-id': traceId,
            },
        },
    );
};

/** A 404 `not_found` problem document that says what is missing. */
export const missingProblem = (detail: string): Response =>
    problem({ status: 404, code: 'not_found', detail, retryable: false });

/** A 404 problem document for the route `path`. */
export const notFoundProblem = (path: string): Response =>
    missingProblem(`There is no route ${path}.`);

/**
 * A 400 `request_invalid` problem document. `pointer` names the invalid
 * member of the request body, such as `/mode`, when one is at fault.
 */
export const requestInvalidProblem = (detail: string, pointer?: string): Response =>
    problem({
        status: 400,
        code: 'request_invalid',
        detail,
        retryable: false,
        extra: pointer ? { pointer } : undefined,
    });

/** A 401 `unauthorized` problem document: the call needs a signed-in account. */
export const unauthorizedProblem = (): Response =>
    problem({
        status: 401,
        code: 'unauthorized',
        detail: 'Sign in to make this request.',
        retryable: false,
    });

/** A 429 `rate_limited` problem document; `headers` carry the rate headers. */
export const rateLimitedProblem = (
    { limit, reset }: { limit: number; reset: number },
    headers: Record<string, string>,
): Response =>
    problem({
        status: 429,
        code: 'rate_limited',
        detail: `Too many requests: ${limit} per window per address. Try again in ${reset}s.`,
        retryable: true,
        headers: { ...headers, 'Retry-After': String(reset) },
    });

/**
 * A 502 `transient_unavailable` problem document: the upstream did not
 * answer. `upstreamStatus` is the status of an upstream that did answer and
 * whose body then failed before the first byte was relayed; the document
 * carries it as `upstream_status`, so a client can tell that the upstream
 * received the call.
 */
export const unreachableProblem = (
    detail: string,
    headers: Record<string, string>,
    upstreamStatus?: number,
): Response =>
    problem({
        status: 502,
        code: 'transient_unavailable',
        detail,
        retryable: true,
        headers,
        extra: upstreamStatus === undefined ? undefined : { upstream_status: upstreamStatus },
    });
