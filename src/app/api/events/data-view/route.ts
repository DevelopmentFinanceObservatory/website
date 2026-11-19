import { after, type NextRequest } from 'next/server';

import { auth } from '@/lib/auth/auth';
import {
    corsHeaders,
    MAX_DATA_VIEW_BODY,
    parseCorsOrigins,
    parseDataView,
    withCaller,
} from '@/lib/events/dataView';
import { track, userWho } from '@/lib/events/track';
import { readBoundedText } from '@/lib/proxy/boundedBody';
import { clientIp } from '@/lib/proxy/forward';
import { problem, rateLimitedProblem } from '@/lib/proxy/problem';
import { rateHeaders } from '@/lib/proxy/rateHeaders';
import { hit } from '@/lib/proxy/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedOrigins = () => parseCorsOrigins(process.env.DFO_CORS_ORIGINS);

const cors = (req: NextRequest) => corsHeaders(req.headers.get('origin'), allowedOrigins());

const invalid = (detail: string, pointer: string, headers: Record<string, string>) =>
    problem({
        status: 400,
        code: 'request_invalid',
        detail,
        retryable: false,
        headers,
        extra: pointer ? { pointer } : undefined,
    });

/** The preflight of a cross-origin POST. Only a DFO_CORS_ORIGINS origin gets the allow set. */
export const OPTIONS = (req: NextRequest) =>
    new Response(null, { status: 204, headers: cors(req) });

// POST /api/events/data-view → 204
// A page sends one data.view per render of a chart or table built on DFO
// data (src/lib/events/dataView parses the body; docs/analytics.md has the
// payload). Every call counts against the event allowance before its body
// is read. The body is read as text whatever its content type, so
// navigator.sendBeacon's text/plain works without a preflight. A session
// cookie makes the event the signed-in user's. The cookie is SameSite=Lax,
// so a POST from another site carries none and its event is anonymous.
// Refusals are problem documents (src/lib/proxy/problem), and every answer
// carries the CORS headers.
export const POST = async (req: NextRequest) => {
    const headers = cors(req);
    const verdict = await hit('event', clientIp(req));

    if (!verdict.allowed) {
        return rateLimitedProblem(verdict, { ...rateHeaders(verdict), ...headers });
    }

    const text = await readBoundedText(req.body, MAX_DATA_VIEW_BODY).catch(() => undefined);

    if (text === undefined) {
        return invalid('The request body could not be read.', '', headers);
    }

    if (text === null) {
        return problem({
            status: 413,
            code: 'payload_too_large',
            detail: `The request body is over ${MAX_DATA_VIEW_BODY} bytes.`,
            retryable: false,
            headers,
        });
    }

    const parsed = parseDataView(text, {
        origin: req.headers.get('origin'),
        allowed: allowedOrigins(),
    });

    if (!parsed.ok) {
        return invalid(parsed.detail, parsed.pointer, headers);
    }

    after(async () => {
        // Read here from the request's headers, since the cached getSession()
        // reads the request scope, which has ended.
        const session = await auth.api
            .getSession({ headers: req.headers, query: { disableRefresh: true } })
            .catch((error) => {
                console.warn('data.view: session read failed', error);
                return null;
            });

        await track('data.view', withCaller(parsed.props, req.headers), {
            ...userWho(session?.user),
            page: parsed.page,
            headers: req.headers,
        });
    });

    return new Response(null, { status: 204, headers });
};
