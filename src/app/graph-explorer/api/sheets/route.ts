import type { NextRequest } from 'next/server';

import { readerDecision } from '@/lib/auth/requireReader';
import { readGoogleAccess } from '@/lib/graphExplorer/googleAccess';
import { LIMITS } from '@/lib/graphExplorer/googleSheet';
import { createGoogleSheet, type ReadBody } from '@/lib/graphExplorer/sheetsExport';
import { readBoundedText } from '@/lib/proxy/boundedBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The body as JSON, refused when it is not JSON, is over the byte cap or does not parse. */
const readJson = async (request: NextRequest): Promise<ReadBody> => {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return { ok: false };
    const text = await readBoundedText(request.body, LIMITS.bodyBytes).catch(() => null);
    if (text === null) return { ok: false };
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false };
    }
};

/**
 * POST /graph-explorer/api/sheets creates the Start a sheet page's mapping
 * sheet as a Google spreadsheet in the reader's own Drive and answers its
 * URL. The decision flow and its statuses are in lib/graphExplorer/sheetsExport.
 */
export const POST = async (request: NextRequest) => {
    const { status, body } = await createGoogleSheet({
        decide: readerDecision,
        readBody: () => readJson(request),
        googleAccess: readGoogleAccess,
        fetch,
        today: new Date().toISOString().slice(0, 10),
        log: (message, fields) => console.error(message, fields),
    });
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
};
