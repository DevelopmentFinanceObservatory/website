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

/**
 * The agent's card removals during a turn, held until the turn's stream
 * ends. The harness's manifest can drop a card before the frame of the card
 * that replaces it arrives, and a removal applied then would unpin and drop
 * a card that lives on under a new id. At the end a held removal goes ahead
 * unless a replacement took the card over; a card once replaced is never
 * removed by a later manifest either. Outside a turn removals pass at once.
 */
export const createRemovalHold = () => {
    let open = false;
    let held: string[] = [];
    const replaced = new Set<string>();

    const live = (ids: readonly string[]) => ids.filter((id) => !replaced.has(id));

    return {
        /** A turn's stream starts. */
        begin: () => {
            open = true;
        },
        /** The removals to apply now: none while a turn streams. */
        remove: (ids: readonly string[]): string[] => {
            if (!open) {
                return live(ids);
            }

            held.push(...ids.filter((id) => !held.includes(id)));

            return [];
        },
        /** A replacement took `id` over: its removal is no removal. */
        replace: (id: string) => {
            replaced.add(id);
        },
        /** The turn's stream ended: the held removals to apply now. */
        end: (): string[] => {
            const removals = live(held);

            open = false;
            held = [];

            return removals;
        },
        /** A new or reopened conversation. */
        reset: () => {
            open = false;
            held = [];
            replaced.clear();
        },
    };
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
