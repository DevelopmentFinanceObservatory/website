// What the page reads again in the browser when DFO has stored newer data than the build read
// (lib/storedCheck.ts): every source the build read from live-refs.json, derived as the build
// derives them. live-refs.json loads only here, when a spec changed.
import type { HivFigures, HivKey } from './figures.ts';

import type { RefreshPlan } from '#lib/storedCheck.ts';

/** The page's sources and derivation, as the build reads them. */
export const loadRefresh = async (): Promise<RefreshPlan<HivKey, HivFigures>> => {
    const [{ default: liveRefs }, { hivFromRows, hivSources }] = await Promise.all([
        import('../_data/live-refs.json', { with: { type: 'json' } }),
        import('./figures.ts'),
    ]);

    return { sources: hivSources(liveRefs.data), derive: hivFromRows };
};
