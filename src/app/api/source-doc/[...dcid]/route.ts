import { missingProblem, unreachableProblem } from '@/lib/proxy/problem';
import { loadSourceDoc } from '@/lib/sources/graph';

// The graph's own words for one source (the same documentation door the
// Sources pages read), for the Studio card's More Info panel: a card frame
// names its source by dcid only.
export const GET = async (
    _request: Request,
    { params }: { params: Promise<{ dcid: string[] }> },
) => {
    let doc: Awaited<ReturnType<typeof loadSourceDoc>>;

    try {
        doc = await loadSourceDoc((await params).dcid.join('/'));
    } catch (error) {
        // loadSourceDoc throws on a 5xx from the graph or a failed request.
        console.error('source-doc: the graph read failed', error);

        return unreachableProblem('The graph is unavailable.', {});
    }

    if (!doc) {
        return missingProblem('The graph holds no documentation for this source.');
    }

    return Response.json({
        name: doc.details.name_of_source,
        publisher: doc.details.publisher,
        description: doc.details.description,
        url: doc.details.source_url,
    });
};
