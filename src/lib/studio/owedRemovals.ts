/**
 * The removals of harness cards the page owes the harness: each card the
 * user took off the canvas whose removal the harness has not confirmed. The
 * set is saved with the conversation (`owedRemovals`), and every path that
 * draws or saves a canvas leaves its cards off (canvasWidgetsOf), so a card
 * owed removal stays off the canvas, its shares and its embeds whatever
 * happened to the request. An entry leaves the set when the harness answers
 * its `remove` with a manifest (confirm), when a manifest of the
 * conversation's composition lacks the card, when the harness holds the
 * card at a newer revision than the one removed (the model drew it again),
 * and when the user adds the card back. Whenever its canvas changes, the
 * page sends a `remove` again for each entry the harness still holds,
 * against that canvas's revision (resendsOf). Each tab keeps its own set,
 * and the last tab to save decides the saved one.
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

/**
 * The revision of card `id` the page knows the harness holds: the newer of
 * the one `baseline`'s manifest names (`revisions`, kept from each block)
 * and the one the page drew (`drawn`), which can lag the manifest until the
 * card's read lands. Null when neither knows it.
 */
export const knownRevision = (
    baseline: CanvasBaseline | null,
    drawn: ReadonlyMap<string, number>,
    id: string,
): number | null => {
    const known = [baseline?.revisions?.[id], drawn.get(id)].filter(
        (revision): revision is number => revision !== undefined,
    );

    return known.length === 0 ? null : Math.max(...known);
};

/** `owed` with card `id`, held at `revision` (knownRevision), taken off
 *  (Remove). A card owed already keeps its entry, and `owed` itself comes
 *  back. */
export const owe = (owed: OwedRemoval[], id: string, revision: number | null): OwedRemoval[] =>
    owed.some((entry) => entry.id === id) ? owed : [...owed, { id, revision }];

/** `owed` without card `id`, which the user put back (Add); `owed` itself
 *  when it does not owe the card. */
export const forgive = (owed: OwedRemoval[], id: string): OwedRemoval[] =>
    owed.some((entry) => entry.id === id) ? owed.filter((entry) => entry.id !== id) : owed;

/** `owed` without `entry`, whose `remove` the harness answered with a
 *  manifest, so the harness took the card off. A later Remove of the same
 *  card owes an entry of its own, which stays; `owed` itself comes back
 *  when it lacks `entry`. */
export const confirm = (owed: OwedRemoval[], entry: OwedRemoval): OwedRemoval[] =>
    owed.includes(entry) ? owed.filter((other) => other !== entry) : owed;

/**
 * `owed` less the removals that are settled against `baseline`, a manifest
 * of the conversation's composition: the cards it lacks, which the harness
 * took off, and the cards the harness holds at a newer revision than the
 * one removed (knownRevision, from the manifest's blocks and the page's
 * draws), which the model drew again. An entry whose removed revision is
 * unknown settles only when the card is gone. The same array when nothing
 * settled. A legacy baseline, and none, settle nothing.
 */
export const settle = (
    owed: OwedRemoval[],
    baseline: CanvasBaseline | null,
    drawn: ReadonlyMap<string, number>,
): OwedRemoval[] => {
    if (baseline?.compositionId == null) {
        return owed;
    }

    const held = new Set(baseline.ids);
    const kept = owed.filter((entry) => {
        const seen = knownRevision(baseline, drawn, entry.id);

        return (
            held.has(entry.id) &&
            !(entry.revision !== null && seen !== null && seen > entry.revision)
        );
    });

    return kept.length === owed.length ? owed : kept;
};

/** How many times one page load sends one owed removal again before it
 *  leaves it for the next load. */
export const OWED_RESENDS = 5;

/** A resend of owed removals: the cards, each its own `remove`, and the
 *  composition and revision each is sent against (`expected_revision`), so
 *  a canvas changed since is refused and read again. */
export type OwedResend = {
    ids: string[];
    against: { compositionId: string; revision: number };
};

/**
 * The owed removals to send again against `baseline`, a manifest of the
 * conversation's composition: the cards it holds, less the ones with a
 * `remove` in flight (`inFlight`) and the ones sent OWED_RESENDS times this
 * page load (`sent`). Null while `held` (a reopened page that has not taken
 * the harness's state yet, whose saved baseline can be older than the
 * harness's canvas), for a legacy baseline, and when nothing is left.
 */
export const resendsOf = ({
    owed,
    baseline,
    inFlight,
    sent,
    held,
}: {
    owed: readonly OwedRemoval[];
    baseline: CanvasBaseline | null;
    inFlight: ReadonlySet<string>;
    sent: ReadonlyMap<string, number>;
    held: boolean;
}): OwedResend | null => {
    if (held || baseline?.compositionId == null) {
        return null;
    }

    const onCanvas = new Set(baseline.ids);
    const ids = owed
        .map((entry) => entry.id)
        .filter(
            (id) => onCanvas.has(id) && !inFlight.has(id) && (sent.get(id) ?? 0) < OWED_RESENDS,
        );

    return ids.length === 0
        ? null
        : { ids, against: { compositionId: baseline.compositionId, revision: baseline.revision } };
};
