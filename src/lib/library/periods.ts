/**
 * Whether a live artifact's data cards draw fixed periods, which the
 * evergreen check asks before it applies the year rules to a title or
 * section heading (`decide` in ./evergreenRule.ts). A card pinned to 2023
 * shows 2023 after every refresh, so a title naming 2023 stays true. dfo-apis
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

/** Whether every card in `refs` is `fixed`. False with no cards, and for a
 *  card with no revision or a read that names no mode. A failed read
 *  rejects, which the check counts as rolling. */
export const allPeriodsFixed = async (backend: LiveBackend, refs: CardRefs): Promise<boolean> => {
    const known = refs.filter((ref): ref is CardRef => ref !== null);

    if (known.length === 0 || known.length < refs.length) {
        return false;
    }

    const modes = await Promise.all(known.map((ref) => readPeriodMode(backend, ref)));

    return modes.every((mode) => mode === 'fixed');
};
