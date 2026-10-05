import type { NextRequest } from 'next/server';

import { downloadAllowance, readVersionFile } from '@/lib/search/storedFile';
import { SPEC_SHAPE, VERSION_SHAPE } from '@/lib/search/versionLink';

// GET /api/version-download/<spec>/<cv> → 302 to the version's stored file.
// The manifest signs its file URLs for minutes, so a page that links to
// one goes dead; this route reads the manifest at click time and redirects
// to a fresh URL for the file `storedDownload` picks (readVersionFile). 404
// when the API serves no such version or the version lists no file to
// offer; 429 past the `api` allowance.
export const GET = async (
    req: NextRequest,
    { params }: { params: Promise<{ spec: string; cv: string }> },
) => {
    const allowance = await downloadAllowance(req);

    if (!allowance.allowed) {
        return Response.json(
            { detail: 'Too many requests' },
            { status: 429, headers: allowance.headers },
        );
    }

    const { spec, cv } = await params;

    if (!SPEC_SHAPE.test(spec) || !VERSION_SHAPE.test(cv)) {
        return Response.json({ detail: 'Bad ref' }, { status: 400 });
    }

    const file = await readVersionFile({ specId: spec, contentVersion: cv });

    if ('status' in file) {
        return Response.json({ detail: file.message }, { status: file.status });
    }

    return new Response(null, {
        status: 302,
        headers: { ...allowance.headers, Location: file.url, 'Cache-Control': 'no-store' },
    });
};
