import { NextRequest } from 'next/server';

import { forwardDatasets } from '@/lib/proxy/datasetReads';
import { dotSegmentProblem } from '@/lib/proxy/problem';
import { forwardablePath } from '@/lib/proxy/surfaces';
import { searchApiBase } from '@/lib/searchApi';

// The Datasets API's document routes, mirrored 1:1 under the site's domain
// (see src/lib/proxy/forward), with the read routes cached, followed to
// storage and open to DFO origins (src/lib/proxy/datasetReads); the mint door
// itself is ../route.ts.
const proxy = (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) =>
    params.then(({ path }) => {
        const rest = forwardablePath(path);

        if (rest === undefined) {
            return dotSegmentProblem();
        }

        return forwardDatasets(req, {
            segments: path,
            surface: 'api',
            target: `${searchApiBase()}/api/datasets${rest}${req.nextUrl.search}`,
            unreachable: 'The Datasets API is unreachable.',
        });
    });

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
