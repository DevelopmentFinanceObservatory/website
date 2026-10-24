import { NextRequest } from 'next/server';

import { codeTarget } from '@/lib/proxy/codes';
import { forward } from '@/lib/proxy/forward';
import { notFoundProblem } from '@/lib/proxy/problem';
import { searchApiBase } from '@/lib/searchApi';

// The API's refusal-code registry (GET /codes/{code}), served at the same
// root path on the site's domain. A problem document's `type` is that
// root-relative path, so the link in it resolves here (see src/lib/proxy/codes).
export const GET = async (req: NextRequest, { params }: { params: Promise<{ code: string }> }) => {
    const { code } = await params;
    const target = codeTarget(searchApiBase(), code, req.nextUrl.search);

    if (!target) {
        return notFoundProblem(req.nextUrl.pathname);
    }

    return forward(req, {
        surface: 'api',
        target,
        unreachable: 'The DFO APIs are unreachable.',
    });
};
