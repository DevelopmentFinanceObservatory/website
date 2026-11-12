import { loadSearchCatalogue } from '@/lib/search/catalogueLoader';

// Serves the drawer's counts from the search catalogue the server already
// reads for /data (cached five minutes, a failure remembered for one). A
// failed read answers 503, so the drawer can tell it from an empty answer and
// reads again when it next opens.
export const GET = async () => {
    const catalogue = await loadSearchCatalogue();

    return catalogue
        ? Response.json(catalogue)
        : Response.json({ error: 'the search catalogue is unavailable' }, { status: 503 });
};
