import type { NextRequest } from 'next/server';

import { readBoundedText } from '@/lib/proxy/boundedBody';
import { clientIp } from '@/lib/proxy/forward';
import { problem, rateLimitedProblem, requestInvalidProblem } from '@/lib/proxy/problem';
import { rateHeaders } from '@/lib/proxy/rateHeaders';
import { hit } from '@/lib/proxy/rateLimit';
import { MAX_DOWNLOAD_PIN_BODY, parseDownloadPin, pinVersionFrame } from '@/lib/search/snapshot';
import { needsPin, pinVersionOnce } from '@/lib/search/versionPin';
import { searchApiBase } from '@/lib/searchApi';

// Bounds the poll of an over-budget mint; each upstream call carries
// its own timeout (see lib/search/snapshot).
const CAPTURE_POLL_DEADLINE_MS = 50_000;

// POST /api/download-pin { specId, contentVersion, definition } → 204
// The search page posts here after a download's mint returns, without waiting
// on the answer. The route pins one artifact per version: the first the
// version lists, minted when it lists none. That keeps the version link in
// the bundle opening and the version's rows readable. The pin needs the
// site's own principal, so it runs here, once per version per instance
// (pinVersionOnce). Without DFO_PRINCIPAL there is nothing to pin with,
// quietly. Every call counts against the pin allowance
// before its body is read. A body over MAX_DOWNLOAD_PIN_BODY bytes is refused
// 413 as soon as the count passes it, chunked or not, and a malformed one
// fails parseDownloadPin. A pin the door refuses, or cannot take right now, is
// logged with the door's detail and left unpinned for a later download to
// retry. Every refusal is a problem document (src/lib/proxy/problem).
export const POST = async (req: NextRequest) => {
    // A pin can mint, so it has its own small allowance.
    const verdict = await hit('pin', clientIp(req));

    if (!verdict.allowed) {
        return rateLimitedProblem(verdict, rateHeaders(verdict));
    }

    const text = await readBoundedText(req.body, MAX_DOWNLOAD_PIN_BODY).catch((error: unknown) => {
        // A client that hangs up mid-body, for one.
        console.error('download-pin: the body could not be read', {
            error: error instanceof Error ? error.message : String(error),
        });

        return undefined;
    });

    if (text === undefined) {
        return requestInvalidProblem('The request body could not be read.');
    }

    if (text === null) {
        return problem({
            status: 413,
            code: 'payload_too_large',
            detail: `The request body is over ${MAX_DOWNLOAD_PIN_BODY} bytes.`,
            retryable: false,
        });
    }

    const body = parseDownloadPin(text);

    if (!body) {
        return requestInvalidProblem('The request body is not a download pin.');
    }

    if (!needsPin(body)) {
        return new Response(null, { status: 204 });
    }

    // Outside the try, so a missing SEARCH_API_BASE is a 500 rather than a 502.
    const base = searchApiBase();

    try {
        await pinVersionOnce(body, (principal) =>
            pinVersionFrame({
                base,
                specId: body.specId,
                contentVersion: body.contentVersion,
                definition: body.definition,
                principal,
                pollDeadlineMs: CAPTURE_POLL_DEADLINE_MS,
            }),
        );

        return new Response(null, { status: 204 });
    } catch (error) {
        // The download already happened; the log is the only place this shows.
        const { message, cause } = error as Error;

        console.error('download-pin: the version frame is not pinned', {
            spec: body.specId,
            cv: body.contentVersion,
            error: message,
            cause: cause instanceof Error ? cause.message : undefined,
        });

        return problem({
            status: 502,
            code: 'pin_refused',
            detail: 'The version could not be pinned. A later download tries again.',
            retryable: false,
        });
    }
};
