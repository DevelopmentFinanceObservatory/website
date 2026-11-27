/**
 * Where a `component.created` card lands among a conversation's cards, and
 * how a card that replaces another (a Change unit, or an edit the harness
 * redrew, named by the frame's `replaces`) takes over the old card's place.
 * A replacement is the same card under a new id: every per-card setting
 * keyed by the old id (pin, view, title, note, place and size) moves to the
 * new one through renameId and renameKey. A Change unit turn also keeps the
 * old card's turn, since it draws nothing else, so the canvas hides nothing
 * else from that answer.
 */

import { standingFor } from './cardIdentity.ts';
import type { CanvasBaseline } from './composition';

/** A card as the conversation holds it: its id, the turn that drew it, and,
 *  once it has taken another card's place, the turn of the question that
 *  made the first card of its chain of replacements (`madeIn`), the ids of
 *  that chain, newest first (`replaced`), and the turns of the card changes
 *  that drew a card of the chain since its reply drew it, oldest first
 *  (`changedIn`). After a card change, `before` holds what the card's
 *  changeable rows showed when its reply drew it and `after` what they show
 *  since (keyed by offer id, `values`). The conversation saves these with
 *  the card, so its history survives a reopen and a loss of its offers. */
type PlacedCard = { id: string; turn: number; madeIn?: number } & CardHistory;

export type CardHistory = {
    replaced?: string[];
    changedIn?: number[];
    before?: Record<string, string>;
    after?: Record<string, string>;
};

type Takeover = { replaces?: string | null; editing?: string | null };

/**
 * The card a new card with id `id` takes over: the one its frame `replaces`,
 * else the card an edit turn set out to edit (a harness that does not name
 * `replaces`). A frame naming its own id updates that card in place, so it
 * takes over nothing.
 */
export const takenOver = (id: string, { replaces = null, editing = null }: Takeover) => {
    const from = replaces ?? editing;

    return from && from !== id ? from : null;
};

/**
 * The cards after `card` (stamped with the turn that drew it) arrives. A card
 * that takes over a card held here (see takenOver) takes its place, and its
 * turn too when `keepTurn` (a card change turn), and records the turn of the
 * question that made the chain's first card (`madeIn`), the chain's ids
 * (`replaced`), and, on a card change turn, that turn (`changedIn`) and the
 * rows as the reply drew them (`before`, read by `values` from the first
 * card the reply drew). A card a question drew in another's place starts
 * the rows afresh, since its reply describes it. A re-used id updates that
 * card in place, keeping what it recorded, and pulls it into this turn; one
 * pulled into another turn's reply starts the rows afresh too. Any other
 * card goes at the end.
 */
export const placeCard = <TCard extends PlacedCard>(
    cards: readonly TCard[],
    card: TCard,
    {
        keepTurn = false,
        values,
        ...takeover
    }: Takeover & { keepTurn?: boolean; values?: (card: TCard) => Record<string, string> },
): TCard[] => {
    const from = takenOver(card.id, takeover);
    const replaced = from ? cards.find((other) => other.id === from) : undefined;

    if (replaced) {
        // A card a question drew in another's place belongs to that
        // question's reply, which describes it, so its history starts afresh.
        const changedIn = keepTurn ? [...(replaced.changedIn ?? []), card.turn] : undefined;
        const before = keepTurn ? (replaced.before ?? values?.(replaced)) : undefined;
        // A row the new card offers none of keeps what the last change
        // recorded for it.
        const after = before && { ...replaced.after, ...values?.(card) };

        return cards
            .filter((other) => other.id !== card.id)
            .map((other) =>
                other === replaced
                    ? {
                          ...card,
                          turn: keepTurn ? replaced.turn : card.turn,
                          madeIn: replaced.madeIn ?? replaced.turn,
                          replaced: [replaced.id, ...(replaced.replaced ?? [])],
                          ...(changedIn && { changedIn }),
                          ...(before && { before }),
                          ...(after && { after }),
                      }
                    : other,
            );
    }

    return cards.some((other) => other.id === card.id)
        ? cards.map((other) => {
              if (other.id !== card.id) return other;

              const { before, after, ...kept } = recordOf(other);
              const sameReply = other.turn === card.turn;

              return {
                  ...card,
                  ...kept,
                  ...(before && sameReply && { before }),
                  ...(after && sameReply && { after }),
                  ...recordOf(card),
              };
          })
        : [...cards, card];
};

/** What a held card recorded of its chain (`madeIn`, `replaced`,
 *  `changedIn`, `before` and `after`), for a redraw of it under the same id
 *  to keep. */
export const recordOf = ({
    madeIn,
    replaced,
    changedIn,
    before,
    after,
}: Pick<PlacedCard, 'madeIn' | 'replaced' | 'changedIn' | 'before' | 'after'>) => ({
    ...(madeIn !== undefined && { madeIn }),
    ...(replaced && { replaced }),
    ...(changedIn && { changedIn }),
    ...(before && { before }),
    ...(after && { after }),
});

/** `ids` with `from` swapped for `to`, in place; the same array when it
 *  does not hold `from`. */
export const renameId = (ids: string[], from: string, to: string): string[] =>
    ids.includes(from) ? ids.filter((id) => id !== to).map((id) => (id === from ? to : id)) : ids;

/** `record` with the entry under `from` moved to `to`; the same record when
 *  there is none. */
export const renameKey = <TValue>(
    record: Record<string, TValue>,
    from: string,
    to: string,
): Record<string, TValue> => {
    if (!(from in record)) {
        return record;
    }

    const { [from]: value, ...rest } = record;

    return { ...rest, [to]: value as TValue };
};

/**
 * The held manifest once card `from` is redrawn as `to`, before the
 * harness's next manifest says so: `to` stands in `from`'s place and keeps
 * its pin, so the canvas shows the replacement from the frame that brings
 * it. The block revision recorded for `from` goes, since `to`'s comes with
 * the next manifest. The same baseline when it does not hold `from`.
 */
export const withReplacedCard = (
    canvas: CanvasBaseline | null,
    from: string,
    to: string,
): CanvasBaseline | null => {
    if (!canvas?.ids.includes(from)) {
        return canvas;
    }

    return {
        ...canvas,
        ids: renameId(canvas.ids, from, to),
        ...(canvas.pinned && { pinned: renameId(canvas.pinned, from, to) }),
        ...(canvas.revisions && {
            revisions: Object.fromEntries(
                Object.entries(canvas.revisions).filter(([id]) => id !== from),
            ),
        }),
    };
};

/**
 * A card's chain of replacements, by `replaced` (each replacement's id to the
 * id it replaced): the card itself first, then each card it replaced, newest
 * first, so the first card of the chain is last. A loop in the map ends the
 * chain.
 */
export const replacedChain = (id: string, replaced: Readonly<Record<string, string>>): string[] => {
    const chain = [id];
    let at = replaced[id];

    while (at !== undefined && !chain.includes(at)) {
        chain.push(at);
        at = replaced[at];
    }

    return chain;
};

/** A follow-up's target card followed to the card standing in its place on
 *  the canvas (standingFor), named as that card is named now (`titleOf`), or
 *  null once none of its chain is there. The same target while its own card
 *  stands under the same title. */
export const standingTarget = <TTarget extends { id: string; title: string }>(
    target: TTarget | null,
    onCanvas: { has: (id: string) => boolean },
    replaced: Readonly<Record<string, string>>,
    titleOf: (id: string) => string,
): TTarget | null => {
    const standing = target && standingFor(target.id, onCanvas, replaced);

    if (!target || !standing) return null;

    const title = titleOf(standing);

    return standing === target.id && title === target.title
        ? target
        : { ...target, id: standing, title };
};
