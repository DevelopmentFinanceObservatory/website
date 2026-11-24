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
 * page sends a `remove` again for each entry the harness still holds, one
 * card at a time, each against the revision the canvas holds when it goes
 * (drainOwedRemovals).
 *
 * Two limits stay. Each tab keeps its own set, and the last tab to save
 * decides the saved one. And when the answer to a `remove` the harness
 * committed is lost, and the model then puts the card back at the revision
 * the entry recorded, the resend takes it off again. The page cannot tell
 * that case from a `remove` that never landed.
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

/** `owed` without card `id`, which the user put back (Add). `owed` itself
 *  comes back when it does not owe the card. */
export const forgive = (owed: OwedRemoval[], id: string): OwedRemoval[] =>
    owed.some((entry) => entry.id === id) ? owed.filter((entry) => entry.id !== id) : owed;

/** `owed` without `entry`, whose `remove` the harness answered with a
 *  manifest, so the harness took the card off. A later Remove of the same
 *  card owes an entry of its own, which stays. `owed` itself comes back
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
 *  leaves it for the next load, counted per card. */
export const OWED_RESENDS = 5;

/** A resend of one owed removal: the card, and the composition and
 *  revision it is sent against (`composition_id`, `expected_revision`), so
 *  a canvas changed since refuses it. */
export type OwedResend = {
    id: string;
    against: { compositionId: string; revision: number };
};

/**
 * The next owed removal to send again against `baseline`, a manifest of the
 * conversation's composition, in the set's order: the first card it holds,
 * less the ones with a `remove` in flight (`inFlight`), the ones sent
 * OWED_RESENDS times this page load (`sent`), and the ones `skip` names.
 * Null while `held` (a reopened page that has not taken the harness's state
 * yet, whose saved baseline can be older than the harness's canvas), for a
 * legacy baseline, and when nothing is left.
 */
export const nextResend = ({
    owed,
    baseline,
    inFlight,
    sent,
    held,
    skip = new Set(),
}: {
    owed: readonly OwedRemoval[];
    baseline: CanvasBaseline | null;
    inFlight: { has: (id: string) => boolean };
    sent: ReadonlyMap<string, number>;
    held: boolean;
    skip?: ReadonlySet<string>;
}): OwedResend | null => {
    if (held || baseline?.compositionId == null) {
        return null;
    }

    const onCanvas = new Set(baseline.ids);
    const entry = owed.find(
        ({ id }) =>
            onCanvas.has(id) &&
            !inFlight.has(id) &&
            !skip.has(id) &&
            (sent.get(id) ?? 0) < OWED_RESENDS,
    );

    return entry
        ? {
              id: entry.id,
              against: { compositionId: baseline.compositionId, revision: baseline.revision },
          }
        : null;
};

/** How the harness answered one resend: with a manifest (`answered`), with
 *  no block for the card (`gone`), as sent against a revision the canvas
 *  has moved past (`stale`), or not at all (`failed`). */
export type ResendOutcome = 'answered' | 'gone' | 'stale' | 'failed';

/**
 * The composition and revision a resend of card `id` goes against when the
 * edit queue reaches it, each time it goes. While `owed` still holds the
 * card's entry and the harness holds the card at no newer revision than the
 * one removed (knownRevision over `baseline` and `drawn`), it goes against
 * the revision `baseline` holds by then, so the edits queued ahead of it do
 * not make it stale. Otherwise it goes against the revision it was picked
 * for (`against`), which the harness refuses as stale: a card the model drew
 * again while the resend waited stays on the canvas. `against` also goes
 * once the page holds another composition or none.
 */
export const againstWhenSent = ({
    id,
    against,
    owed,
    baseline,
    drawn,
}: {
    id: string;
    against: OwedResend['against'];
    owed: readonly OwedRemoval[];
    baseline: CanvasBaseline | null;
    drawn: ReadonlyMap<string, number>;
}): OwedResend['against'] => {
    const entry = owed.find((other) => other.id === id);
    const known = knownRevision(baseline, drawn, id);
    const redrawn = entry?.revision != null && known !== null && known > entry.revision;

    return entry && !redrawn && baseline?.compositionId === against.compositionId
        ? { compositionId: against.compositionId, revision: baseline.revision }
        : against;
};

/** The first wait before a drain run that left cards behind runs again,
 *  in milliseconds. Each such run in a row doubles it, up to
 *  OWED_RETRY_MAX_MS. */
export const OWED_RETRY_MS = 2_000;
export const OWED_RETRY_MAX_MS = 60_000;

/** The wait before the drain runs again after `runs` runs in a row left
 *  cards behind (drainOwedRemovals), or null after a run that left none. */
export const owedRetryAfter = (runs: number): number | null =>
    runs === 0 ? null : Math.min(OWED_RETRY_MS * 2 ** (runs - 1), OWED_RETRY_MAX_MS);

/**
 * Send the owed removals again, one card at a time and in order, until
 * `next` (nextResend over the page's current set and canvas) names none.
 * Each send waits for the answer before the next goes. A `stale` answer
 * reads the canvas again (`reread`, true when it took a newer canvas) and
 * goes on. A card that fails, or whose re-read brought nothing newer, is
 * left for the rest of this run. Each send counts against its card in
 * `sent`, and `onCapped` hears a card that reaches OWED_RESENDS without the
 * harness taking it off. Resolves with the cards left behind, which a later
 * run sends again (owedRetryAfter).
 */
export const drainOwedRemovals = async ({
    next,
    send,
    reread,
    sent,
    onCapped,
}: {
    next: (skip: ReadonlySet<string>) => OwedResend | null;
    send: (resend: OwedResend) => Promise<ResendOutcome>;
    reread: () => Promise<boolean>;
    sent: Map<string, number>;
    onCapped: (id: string, outcome: ResendOutcome) => void;
}): Promise<string[]> => {
    const skip = new Set<string>();

    for (let resend = next(skip); resend; resend = next(skip)) {
        const count = (sent.get(resend.id) ?? 0) + 1;

        sent.set(resend.id, count);

        const outcome = await send(resend);

        if (outcome === 'failed' || (outcome === 'stale' && !(await reread()))) {
            skip.add(resend.id);
        }

        if ((outcome === 'stale' || outcome === 'failed') && count === OWED_RESENDS) {
            onCapped(resend.id, outcome);
        }
    }

    return [...skip].filter((id) => (sent.get(id) ?? 0) < OWED_RESENDS);
};
