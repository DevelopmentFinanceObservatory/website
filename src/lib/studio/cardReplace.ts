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

/** A card as the conversation holds it: its id and the turn that drew it. */
type PlacedCard = { id: string; turn: number };

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
 * turn too when `keepTurn` (a Change unit turn). A re-used id updates that
 * card in place and pulls it into this turn; any other card goes at the end.
 */
export const placeCard = <TCard extends PlacedCard>(
    cards: readonly TCard[],
    card: TCard,
    { keepTurn = false, ...takeover }: Takeover & { keepTurn?: boolean },
): TCard[] => {
    const from = takenOver(card.id, takeover);
    const replaced = from ? cards.find((other) => other.id === from) : undefined;

    if (replaced) {
        return cards
            .filter((other) => other.id !== card.id)
            .map((other) =>
                other === replaced
                    ? { ...card, turn: keepTurn ? replaced.turn : card.turn }
                    : other,
            );
    }

    return cards.some((other) => other.id === card.id)
        ? cards.map((other) => (other.id === card.id ? card : other))
        : [...cards, card];
};

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
