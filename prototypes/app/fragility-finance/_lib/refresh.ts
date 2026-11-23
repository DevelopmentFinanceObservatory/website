// What the page reads again in the browser when DFO has stored newer data than the build read
// (lib/storedCheck.ts): every source the build read, derived as the build derives them. The
// contexts and their classification come from the built figures, which carry each context's
// profile, so the browser needs no copy of the OECD's file. refs.json loads only here, when a
// spec changed.
import type { Profile } from './classification.ts';
import type { Figures } from './figures.ts';

import type { RefreshPlan } from '#lib/storedCheck.ts';

/** Each context's profile, in the built order, which is the classification's. */
export const profilesOf = ({ contexts }: Figures): Profile[] =>
    contexts.map(({ iso3, name, tier, score, rank, dimensions }) => ({
        iso3,
        name,
        tier,
        score,
        rank,
        dimensions,
    }));

/** The page's sources and derivation, for the contexts of `built`. */
export const loadRefresh = async (built: Figures): Promise<RefreshPlan<string, Figures>> => {
    const [{ default: refs }, { figuresFromRows, recipientGroups, sources }] = await Promise.all([
        import('../_data/refs.json', { with: { type: 'json' } }),
        import('./figures.ts'),
    ]);
    const profiles = profilesOf(built);
    const groups = recipientGroups(refs.data, profiles);

    return {
        sources: sources(refs.data, groups),
        derive: (rows) => figuresFromRows(rows, profiles, groups),
    };
};
