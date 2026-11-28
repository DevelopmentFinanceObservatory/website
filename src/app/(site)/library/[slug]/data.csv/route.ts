import type { NextRequest } from 'next/server';

import { sharesBackendFor } from '@/lib/chat/shareStore';
import { libraryView } from '@/lib/library/admin';
import { libraryCsvResponse } from '@/lib/library/chartData';
import { artifactBySlug } from '@/lib/library/store';
import { missingProblem, problem } from '@/lib/proxy/problem';

type Context = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';

// GET /library/<slug>/data.csv?card=&spec_id=&content_version= → text/csv
// The data file of a published Library artifact's chart `card` (its only or
// first chart without one), as `libraryCsvResponse` serves it: on the frame
// `spec_id` and `content_version` name together, which the page's link
// names, else on the frame the page draws the chart on now. The page's
// Dataset blocks name the address without a frame, which robots.txt leaves
// open, unlike /api/. It answers when the page does (`libraryView`), and 404
// for any other artifact. One of `spec_id` and `content_version` without the
// other is 400 `request_invalid`, as dfo-apis refuses it.
export const GET = async (request: NextRequest, { params }: Context) => {
    const view = await libraryView();
    const found = view === null ? null : await artifactBySlug((await params).slug);

    if (found?.status !== 'published') {
        return missingProblem('There is no Library artifact at this address.');
    }

    const query = request.nextUrl.searchParams;
    const specId = query.get('spec_id');
    const contentVersion = query.get('content_version');

    if ((specId === null) !== (contentVersion === null)) {
        return problem({
            status: 400,
            code: 'request_invalid',
            detail: 'Name a frame with both spec_id and content_version, or with neither.',
            retryable: false,
        });
    }

    return libraryCsvResponse(sharesBackendFor(request.headers), found.artifact, {
        card: query.get('card'),
        frame:
            specId === null || contentVersion === null
                ? null
                : { spec_id: specId, content_version: contentVersion },
        open: view === 'open',
    });
};
