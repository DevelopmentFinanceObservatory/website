// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): the reads of live-refs.json at DFO's newest stored versions
// (lib/buildRead.ts) and the figures derived from them (./figures.ts). A failed read or a
// refused derivation fails the build.
import liveRefs from '../_data/live-refs.json' with { type: 'json' };

import { type HivFigures, type HivKey, hivFromRows, hivSources } from './figures.ts';

import { type BuildPage, type BuildRead, readSettled } from '#lib/buildRead.ts';

/** The page's build-time read: its figures, when they were read and the versions read. */
export const hivBuild: BuildPage<BuildRead<HivKey, HivFigures>> = {
    name: 'hiv-financing',
    build: (options) =>
        readSettled('hiv-financing', hivSources(liveRefs.data), hivFromRows, options),
};

export default hivBuild;
