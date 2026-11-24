/**
 * The removals of harness cards the page owes the harness: each card the
 * user took off the canvas whose removal the harness has not confirmed. The
 * set is saved with the conversation (`owedRemovals`), and every path that
 * draws or saves a canvas leaves its cards off (canvasWidgetsOf), so a card
 * owed removal stays off the canvas, its shares and its embeds whatever
 * happened to the request. An entry leaves the set when a manifest of the
 * conversation's composition lacks the card (the harness took it off), when
 * the page has since seen the card at a newer revision than the one removed
 * (the model drew it again), and when the user adds the card back. The page
 * sends a `remove` for each entry the harness still holds whenever its
 * canvas changes, so an owed removal goes again once the harness answers.
 */

import type { CardRef } from '../chat/widgets.ts';
import type { CanvasBaseline } from './composition.ts';

/** A harness card the user took off the canvas, and the revision the page
 *  held it at then (null when unknown). */
export type OwedRemoval = { id: string; revision: number | null };

/** The fields of a stored conversation the owed removals come from. */
export type OwedSource = {
    owedRemovals?: OwedRemoval[];
    canvas?: CanvasBaseline | null;
    removedIds?: string[];
    localIds?: string[];
    widgets?: readonly { id: string; ref?: CardRef }[];
};

/**
 * The owed removals of a stored conversation: its `owedRemovals`. A save
 * from before them owes the harness cards its `removedIds` lists that a
 * baseline naming a composition and carrying no `pinned` holds, a fork's
 * inherited cards (`localIds`) aside, since the page that saved it took
 * those off on the page alone. Any other save owes none.
 */
export const owedRemovalsOf = ({
    owedRemovals,
    canvas,
    removedIds = [],
    localIds = [],
    widgets = [],
}: OwedSource): OwedRemoval[] => {
    if (owedRemovals) {
        return owedRemovals;
    }

    if (canvas?.compositionId == null || canvas.pinned) {
        return [];
    }

    const removed = new Set(removedIds);
    const local = new Set(localIds);

    return canvas.ids
        .filter((id) => removed.has(id) && !local.has(id))
        .map((id) => ({
            id,
            revision: widgets.find((widget) => widget.id === id)?.ref?.revision ?? null,
        }));
};

/** The ids `owed` names. */
export const owedIds = (owed: readonly OwedRemoval[]): Set<string> =>
    new Set(owed.map((entry) => entry.id));

/** `owed` with card `id`, held at `revision`, taken off (Remove). A card
 *  owed already keeps its entry. */
export const owe = (
    owed: readonly OwedRemoval[],
    id: string,
    revision: number | null,
): OwedRemoval[] =>
    owed.some((entry) => entry.id === id) ? [...owed] : [...owed, { id, revision }];

/** `owed` without card `id`, which the user put back (Add). */
export const forgive = (owed: readonly OwedRemoval[], id: string): OwedRemoval[] =>
    owed.filter((entry) => entry.id !== id);

/**
 * `owed` less the removals that are settled against `baseline`, a manifest
 * of the conversation's composition: the cards it lacks, which the harness
 * took off, and the cards the page holds at a newer revision than the one
 * removed (`revisions`), which the model drew again. The same array when
 * nothing settled. A legacy baseline, and none, settle nothing.
 */
export const settle = (
    owed: OwedRemoval[],
    baseline: CanvasBaseline | null,
    revisions: ReadonlyMap<string, number>,
): OwedRemoval[] => {
    if (baseline?.compositionId == null) {
        return owed;
    }

    const held = new Set(baseline.ids);
    const kept = owed.filter((entry) => {
        const seen = revisions.get(entry.id);

        return (
            held.has(entry.id) &&
            !(entry.revision !== null && seen !== undefined && seen > entry.revision)
        );
    });

    return kept.length === owed.length ? owed : kept;
};

/** The owed cards to send a `remove` for: the ones `baseline` holds, less
 *  the ones with a `remove` in flight. None for a legacy baseline. */
export const removalsToSend = (
    owed: readonly OwedRemoval[],
    baseline: CanvasBaseline | null,
    inFlight: ReadonlySet<string>,
): string[] => {
    if (baseline?.compositionId == null) {
        return [];
    }

    const held = new Set(baseline.ids);

    return owed.map((entry) => entry.id).filter((id) => held.has(id) && !inFlight.has(id));
};
