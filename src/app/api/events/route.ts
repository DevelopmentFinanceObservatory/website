import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { boundedLookup } from '@/lib/events/boundedLookup';
import { fitsProps, MAX_PROPS_BYTES } from '@/lib/events/limits';
import { isBrowserEventName } from '@/lib/events/browserEvents';
import { track, userWho } from '@/lib/events/track';
import { problem, requestInvalidProblem } from '@/lib/proxy/problem';

/**
 * Usage-event intake (POST /api/events) for the browser side of
 * src/lib/events. Body: `{ name, props?, visitorId?, page? }`. The name must
 * be one the site's pages send (BROWSER_EVENT_NAMES); props are capped so a stray payload can't bloat
 * the table. Answers 204 for an event taken, and a problem document
 * (`request_invalid`, `payload_too_large`) for one refused; the page never
 * waits on either, and the route answers once the event is written.
 */
const MAX_ID = 64;
const MAX_PAGE = 300;

const clip = (value: unknown, max: number): string | null =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

export const POST = async (request: Request) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const name = body?.name;

    if (!isBrowserEventName(name)) {
        return requestInvalidProblem('The event name is not one the browser sends.', '/name');
    }

    const props =
        body?.props && typeof body.props === 'object' && !Array.isArray(body.props)
            ? (body.props as Record<string, unknown>)
            : {};

    if (!fitsProps(props)) {
        return problem({
            status: 413,
            code: 'payload_too_large',
            detail: `The event props are over ${MAX_PROPS_BYTES} bytes.`,
            retryable: false,
        });
    }

    // A failed or stalled session read records the event as a signed-out one.
    const session = await boundedLookup(getSession, null, 'events: session read');

    // Awaited, so the insert finishes while the request still holds the
    // instance's CPU: Cloud Run throttles an instance once its response is sent.
    // The page sends with keepalive and never waits on the answer.
    await track(name, props, {
        ...userWho(session?.user),
        visitorId: clip(body?.visitorId, MAX_ID),
        page: clip(body?.page, MAX_PAGE),
        headers: request.headers,
    });

    return new NextResponse(null, { status: 204 });
};
