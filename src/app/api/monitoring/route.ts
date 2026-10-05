import { NextResponse } from 'next/server';

/**
 * Sentry tunnel (POST /api/monitoring): the browser SDK posts its envelopes
 * here and this forwards them to Sentry — same-origin, so ad blockers don't
 * eat them. Our own route rather than the plugin's rewrite because a
 * rewrite forwards the request headers too, and on the Basic-auth test
 * deployment the browser's `Authorization: Basic …` makes Sentry answer
 * 400 for every report. Only our own DSN's project is forwarded.
 */
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const target = (() => {
    if (!DSN) {
        return null;
    }

    const url = new URL(DSN);

    return {
        host: url.host,
        projectId: url.pathname.replace(/^\//, ''),
        endpoint: `https://${url.host}/api/${url.pathname.replace(/^\//, '')}/envelope/`,
    };
})();

export const POST = async (request: Request) => {
    if (!target) {
        return new NextResponse(null, { status: 404 });
    }

    const body = await request.text();
    let header: { dsn?: string };

    try {
        header = JSON.parse(body.slice(0, body.indexOf('\n'))) as { dsn?: string };
    } catch {
        return new NextResponse(null, { status: 400 });
    }

    const dsn = header.dsn ? new URL(header.dsn) : null;

    if (!dsn || dsn.host !== target.host || dsn.pathname.replace(/^\//, '') !== target.projectId) {
        return new NextResponse(null, { status: 400 });
    }

    const upstream = await fetch(target.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-sentry-envelope' },
        body,
    }).catch(() => null);

    return new NextResponse(null, { status: upstream?.status ?? 502 });
};
