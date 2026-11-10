import { filterGroups } from '@/lib/sources/filters';
import { loadSources } from '@/lib/sources/graph';

// The drawer's sources: the Sources page's cards (cached an hour, a failure
// remembered for a minute, concurrent reads shared), grouped the way its
// filter chips are. A failed read answers 503, so the drawer tells it from
// an empty list and reads again when it next opens.
export const GET = async () => {
    try {
        return Response.json({ sources: filterGroups(await loadSources()) });
    } catch (error) {
        console.warn('data availability: the sources read failed', error);

        return Response.json({ error: 'the source catalogue is unavailable' }, { status: 503 });
    }
};
