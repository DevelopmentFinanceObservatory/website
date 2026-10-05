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

        return Response.json({ detail: 'The graph is unavailable' }, { status: 502 });
    }

    if (!doc) {
        return Response.json({ detail: 'Not found' }, { status: 404 });
    }

    return Response.json({
        name: doc.details.name_of_source,
        publisher: doc.details.publisher,
        description: doc.details.description,
        url: doc.details.source_url,
    });
};
