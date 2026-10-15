import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { fitsProps } from '@/lib/events/limits';
import { EVENT_NAMES, type EventName, track } from '@/lib/events/track';

/**
 * Usage-event intake (POST /api/events) for the browser side of
 * src/lib/events. Body: `{ name, props?, visitorId?, page? }`. The name must
 * be one the site emits; props are capped so a stray payload can't bloat
 * the table. Always answers 204 — the page never waits on analytics.
 */
const MAX_ID = 64;
const MAX_PAGE = 300;

const clip = (value: unknown, max: number): string | null =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

export const POST = async (request: Request) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const name = body?.name;

    if (!(EVENT_NAMES as readonly unknown[]).includes(name)) {
        return NextResponse.json({ error: 'unknown event' }, { status: 400 });
    }

    const props =
        body?.props && typeof body.props === 'object' && !Array.isArray(body.props)
            ? (body.props as Record<string, unknown>)
            : {};

    if (!fitsProps(props)) {
        return NextResponse.json({ error: 'props too large' }, { status: 413 });
    }

    const session = await getSession();

    // Not awaited on purpose — the answer doesn't wait on the insert.
    void track(name as EventName, props, {
        userId: session?.user.id ?? null,
        visitorId: clip(body?.visitorId, MAX_ID),
        page: clip(body?.page, MAX_PAGE),
        headers: request.headers,
    });

    return new NextResponse(null, { status: 204 });
};
