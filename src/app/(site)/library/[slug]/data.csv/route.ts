import type { NextRequest } from 'next/server';

import { sharesBackendFor } from '@/lib/chat/shareStore';
import { libraryView } from '@/lib/library/admin';
import { libraryCsvResponse } from '@/lib/library/chartData';
import { artifactBySlug } from '@/lib/library/store';
import { missingProblem } from '@/lib/proxy/problem';

type Context = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';

// GET /library/<slug>/data.csv?card=&frame= → text/csv
// The rows a published Library artifact's chart `card` (its only or first
// chart without one) shows on the page, as `libraryCsvResponse` serves them
// from the entry the page's tables are drawn from, on frame `frame` when the
// query names one. The page's Dataset
// blocks name this address, which robots.txt leaves open, unlike /api/. It
// answers when the page does (`libraryView`), and 404 for any other
// artifact.
export const GET = async (request: NextRequest, { params }: Context) => {
    const view = await libraryView();
    const found = view === null ? null : await artifactBySlug((await params).slug);

    if (found?.status !== 'published') {
        return missingProblem('There is no Library artifact at this address.');
    }

    const query = request.nextUrl.searchParams;

    return libraryCsvResponse(sharesBackendFor(request.headers), found.artifact, {
        card: query.get('card'),
        frame: query.get('frame'),
        open: view === 'open',
    });
};
