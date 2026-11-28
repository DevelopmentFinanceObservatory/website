/**
 * Whether a live artifact's data cards draw fixed periods, which the
 * evergreen check asks when its text names a year (`namesYear` and `decide`
 * in ./evergreenRule.ts). A card pinned to 2023 shows 2023 after every
 * refresh, so a sentence naming 2023 stays true. dfo-apis
 * names each revision's mode in its component read (`readPeriodMode`).
 *
 * No database or path-alias dependency, so `node --test` imports it.
 */

import type { CardRef } from '../chat/widgets.ts';
import { type LiveBackend, readPeriodMode } from '../studio/liveBackend.ts';

/** The most the lookup waits for every card's mode. It runs beside the
 *  check's own requests, inside `CHECK_DEADLINE_MS`. */
export const PERIOD_DEADLINE_MS = 3_000;

/** The artifact's data cards, null for one with no stored revision. */
export type CardRefs = readonly (CardRef | null)[];

/** What the lookup found. `fixed` when every card is fixed and `rolling` when
 *  one is rolling. Otherwise the reason no mode is known, which the check
 *  logs as the `cause` of `library_period_mode_unknown`: `no_cards`,
 *  `no_revision` for a card with no stored revision, and `mode_missing` or
 *  `mode_unknown` for a read whose `period_mode` is absent or names neither
 *  value. */
export type PeriodsFound =
    'fixed' | 'rolling' | 'no_cards' | 'no_revision' | 'mode_missing' | 'mode_unknown';

/** What the modes of the cards in `refs` come to (`PeriodsFound`). A card
 *  with no revision is found before any read. A failed read rejects, which
 *  the check counts as rolling. */
export const allPeriodsFixed = async (
    backend: LiveBackend,
    refs: CardRefs,
): Promise<PeriodsFound> => {
    const known = refs.filter((ref): ref is CardRef => ref !== null);

    if (refs.length === 0) {
        return 'no_cards';
    }

    if (known.length < refs.length) {
        return 'no_revision';
    }

    const modes = await Promise.all(known.map((ref) => readPeriodMode(backend, ref)));

    if (modes.includes('rolling')) {
        return 'rolling';
    }

    if (modes.includes('missing')) {
        return 'mode_missing';
    }

    return modes.includes('unknown') ? 'mode_unknown' : 'fixed';
};
