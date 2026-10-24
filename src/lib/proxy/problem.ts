/**
 * The problem document the proxy answers with for a route it does not have,
 * in the shape dfo-apis uses for its own refusals (the docs corpus's
 * dfo-apis/conventions.md, "Problem details"): `application/problem+json`
 * with the registry `code`, a `trace_id` repeated in the `x-dfo-trace-id`
 * header, and `retryable`. A client such as the SDK branches on `code`, so a
 * bare 404 reads as a refusal without one. Kept apart from the route so
 * `node --test` can load it.
 */

/** A 404 problem document for `path`, with a fresh trace id. */
export const notFoundProblem = (path: string): Response => {
    const traceId = crypto.randomUUID().replaceAll('-', '');

    return Response.json(
        {
            type: '/codes/not_found',
            title: 'Not Found',
            status: 404,
            detail: `There is no route ${path}.`,
            code: 'not_found',
            trace_id: traceId,
            retryable: false,
        },
        {
            status: 404,
            headers: {
                'Content-Type': 'application/problem+json',
                'x-dfo-trace-id': traceId,
                'Cache-Control': 'no-cache',
            },
        },
    );
};
