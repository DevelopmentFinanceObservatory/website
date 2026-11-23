// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): the reads of live-refs.json at DFO's newest stored versions
// (lib/buildRead.ts) and the figures derived from them (./figures.ts), with DFO's stored versions
// of every spec the reads took, checked before the reads and after (`readChecked`). A failed read,
// a refused derivation or a check that moved on every read fails the build.
import liveRefs from '../_data/live-refs.json' with { type: 'json' };

import { type HivFigures, type HivKey, hivFromRows, hivSources } from './figures.ts';

import { type BuildPage, type CheckedRead, readChecked } from '#lib/buildRead.ts';

/** The page's build-time read: its figures, when they were read, the versions read and DFO's
 *  stored versions. */
export const hivBuild: BuildPage<CheckedRead<HivKey, HivFigures>> = {
    name: 'hiv-financing',
    build: (options) =>
        readChecked('hiv-financing', hivSources(liveRefs.data), hivFromRows, options),
};

export default hivBuild;
