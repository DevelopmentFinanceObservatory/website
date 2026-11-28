import type { NextRequest } from 'next/server';

import { sharesBackendFor } from '@/lib/chat/shareStore';
import { libraryView } from '@/lib/library/admin';
import { libraryCsvResponse } from '@/lib/library/chartData';
import { artifactBySlug } from '@/lib/library/store';
import { missingProblem, requestInvalidProblem } from '@/lib/proxy/problem';

type Context = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';

// GET /library/<slug>/data.csv?card=&spec_id=&content_version= (text/csv)
// The data file of chart `card` of a published Library artifact, or of its
// only or first chart without `card`, as `libraryCsvResponse` serves it. With
// `spec_id` and `content_version`, which the page's link names, the file is
// on that frame. Without them it is on the frame the page draws the chart
// on. The page's link and its Dataset blocks name the address with a frame,
// and robots.txt leaves the route open while it closes /api/. The route answers when
// the page does (`libraryView`) and is 404 for any other artifact. One of
// `spec_id` and `content_version` without the other is 400
// `request_invalid`, as dfo-apis refuses it.
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
        return requestInvalidProblem(
            'Name a frame with both spec_id and content_version, or with neither.',
        );
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
