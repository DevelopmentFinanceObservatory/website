import type { NextRequest } from 'next/server';

import { slotDepsFor } from '@/lib/chat/shareStore';
import { libraryView } from '@/lib/library/admin';
import { cachedSlotChart, isReadFailure } from '@/lib/library/chartData';
import { artifactBySlug } from '@/lib/library/store';
import { missingProblem, problem } from '@/lib/proxy/problem';
import { slotDataResponse } from '@/lib/studio/slotCards';

type Context = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

// Five minutes, as the page's link-preview image and its chart read.
const OPEN_CACHE = 'public, max-age=300, must-revalidate';

const noData = (): Response =>
    problem({
        status: 404,
        code: 'not_found',
        detail: 'This Library artifact has no data rows.',
        retryable: false,
        headers: NO_STORE,
    });

// GET /library/<slug>/data.csv → text/csv
// The rows behind a published Library card, on the frame its slot serves,
// as the bare CSV of the share's slot data route (src/lib/studio/slotCards).
// The page's Dataset block names this address, which robots.txt leaves open,
// unlike /api/. It answers when the page does (`libraryView`), for a
// published artifact whose card draws data rows (`readSlotChart`), and 404
// otherwise. An open Library's file is cached publicly for five minutes; an
// admin's preview is not stored.
export const GET = async (request: NextRequest, { params }: Context) => {
    const view = await libraryView();
    const found = view === null ? null : await artifactBySlug((await params).slug);

    if (found?.status !== 'published') {
        return missingProblem('There is no Library artifact at this address.');
    }

    const deps = slotDepsFor(request.headers);
    const { shareId } = found.artifact;
    let chart;

    try {
        chart = await cachedSlotChart(deps.shares, shareId);
    } catch (error) {
        if (!isReadFailure(error)) {
            throw error;
        }

        return problem({
            status: 502,
            code: error.code,
            detail: 'The card has no data file to serve.',
            retryable: error.retryable,
            headers: NO_STORE,
        });
    }

    if (chart === null) {
        return noData();
    }

    const response = await slotDataResponse(
        deps,
        shareId,
        new URLSearchParams({ slot: String(chart.slot), format: 'csv', bundle: 'false' }),
    );

    if (response.ok && view === 'open') {
        response.headers.set('Cache-Control', OPEN_CACHE);
    }

    return response;
};
