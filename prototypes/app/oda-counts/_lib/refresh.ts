// What the page reads again in the browser when DFO has stored newer data than the build read
// (lib/storedCheck.ts): the 19 DAC1 reads of live-refs.json, derived as the build derives them
// (`deriveCounts`). The definitions and the currency offer stay as the build read them.
// live-refs.json loads only here, when a spec changed.
import type { BuiltCounts, ReadKey } from './derive.ts';

import type { RefreshPlan } from '#lib/storedCheck.ts';

/** The page's DAC1 sources and derivation, as the build reads them. */
export const loadRefresh = async (): Promise<RefreshPlan<ReadKey, BuiltCounts>> => {
    const [{ default: liveRefs }, { countsSources, deriveCounts }] = await Promise.all([
        import('../_data/live-refs.json', { with: { type: 'json' } }),
        import('./derive.ts'),
    ]);

    return {
        sources: countsSources(liveRefs.data),
        derive: deriveCounts,
    };
};
