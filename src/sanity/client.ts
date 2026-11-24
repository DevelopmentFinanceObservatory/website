import 'server-only';
import { createClient } from 'next-sanity';

// The project and dataset of the Studio in cms-dfo/. Both are public identifiers.
export const sanityProjectId = 'te5hxtq5';
export const sanityDataset = 'production';

// Reads published content through the Sanity CDN. Server Components import it.
export const sanityClient = createClient({
    projectId: sanityProjectId,
    dataset: sanityDataset,
    apiVersion: '2026-11-24',
    useCdn: true,
});
