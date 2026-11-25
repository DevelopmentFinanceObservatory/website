import type { NextRequest } from 'next/server';

import { missingProblem, requestInvalidProblem, unreachableProblem } from '@/lib/proxy/problem';
import { downloadAllowance, readVersionFile } from '@/lib/search/storedFile';
import { SPEC_SHAPE, VERSION_SHAPE } from '@/lib/search/versionLink';

const withHeaders = (response: Response, headers: Record<string, string>): Response => {
    for (const [name, value] of Object.entries(headers)) {
        response.headers.set(name, value);
    }

    return response;
};

// GET /api/version-download/<spec>/<cv> → 302 to the version's stored file.
// A bundle prints this path, which does not change; the route reads the
// manifest at click time and redirects to the stable link of the file
// `storedDownload` picks (readVersionFile). Refusals are problem documents
// (src/lib/proxy/problem): 404 when the API serves no such version or the
// version lists no file to offer; 429 past the `api` allowance, with the
// allowance headers and Retry-After; 502 when the version read fails. Every
// response after the count carries the allowance headers, so the request log
// records its tier.
export const GET = async (
    req: NextRequest,
    { params }: { params: Promise<{ spec: string; cv: string }> },
) => {
    const allowance = await downloadAllowance(req);

    if (allowance.refusal) {
        return allowance.refusal;
    }

    const { spec, cv } = await params;

    if (!SPEC_SHAPE.test(spec) || !VERSION_SHAPE.test(cv)) {
        return requestInvalidProblem(
            'The spec or content version is not a valid reference.',
            undefined,
            allowance.headers,
        );
    }

    const file = await readVersionFile({ specId: spec, contentVersion: cv });

    if ('status' in file) {
        return file.status === 404
            ? withHeaders(missingProblem(file.message), allowance.headers)
            : unreachableProblem(file.message, allowance.headers);
    }

    return new Response(null, {
        status: 302,
        headers: { ...allowance.headers, Location: file.url, 'Cache-Control': 'no-store' },
    });
};
