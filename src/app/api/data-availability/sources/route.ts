import { loadSources } from '@/lib/sources/graph';
import { publisherOptions } from '@/lib/sources/search';

// Serves the drawer's sources from the Sources page's cards (cached an hour,
// a failure remembered for 15 s, concurrent reads shared) as the page's
// publisher list with no query (publisherOptions). A failed read answers 503,
// so the drawer can tell it from an empty list and reads again when it next
// opens.
export const GET = async () => {
    try {
        return Response.json({ sources: publisherOptions(await loadSources(), '') });
    } catch (error) {
        console.warn('data availability: the sources read failed', error);

        return Response.json({ error: 'the source catalogue is unavailable' }, { status: 503 });
    }
};
