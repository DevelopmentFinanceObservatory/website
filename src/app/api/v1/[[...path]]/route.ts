import { NextRequest } from 'next/server';

import { notFoundProblem } from '@/lib/proxy/problem';

// Every /api/v1 path no other route here matches (Next.js tries the specific
// routes first), answered with the problem document dfo-apis gives its own
// unknown routes (see src/lib/proxy/problem) instead of the site's HTML 404
// page. Nothing is forwarded: an unknown path is the site's to refuse, and
// the APIs the site does not publish stay out of reach.
const notFound = (req: NextRequest) => notFoundProblem(req.nextUrl.pathname);

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;
