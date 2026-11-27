/**
 * A card's identity across its replacements. A card the harness redraws
 * under a new id (`replaces`, or the card an edit turn set out to change) is
 * the same card: `replaced` maps each replacement's id to the id it took the
 * place of. From that map and the canvas, this module answers which card
 * stands for an id now (its latest replacement on the canvas, or none once
 * the chain left it), and which question a card belongs to: a card drawn by
 * a card change turn (its prompt marked `edit`) keeps the turn of the card it
 * replaced, while a card a question drew in another's place joins that
 * question. Every path that places a card (the stream, a resumed stream, a
 * state read) and every reader of a card's current id (the queue, the
 * canvas, the transcript, the session panel) goes through it.
 */

/** Each card that was replaced, mapped to the card that took its place: the
 *  replacement map read forward. Built once per map (a map is replaced, never
 *  changed in place, so the index stays true for it). */
const indexes = new WeakMap<Readonly<Record<string, string>>, ReadonlyMap<string, string>>();

export const successorsOf = (
    replaced: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> => {
    let index = indexes.get(replaced);

    if (!index) {
        index = new Map(Object.entries(replaced).map(([newer, older]) => [older, newer]));
        indexes.set(replaced, index);
    }

    return index;
};

/** The card on the canvas (`onCanvas`) standing for `id`: itself, or the
 *  latest card of its replacements, followed forward through `replaced`.
 *  Null once none of them is on the canvas. A loop in the map ends the walk. */
export const standingFor = (
    id: string,
    onCanvas: { has: (id: string) => boolean },
    replaced: Readonly<Record<string, string>>,
): string | null => {
    const successors = successorsOf(replaced);
    const seen = new Set<string>();
    let at: string | undefined = id;

    while (at !== undefined && !seen.has(at)) {
        if (onCanvas.has(at)) return at;

        seen.add(at);
        at = successors.get(at);
    }

    return null;
};

/**
 * The card standing for card `id` among the cards the conversation holds
 * (`cards`), followed through `replaced`, and on the canvas when the canvas
 * is known (`onCanvas`; null while the page holds no manifest, when every
 * held card counts). Null once no card of the chain is held there: a
 * question took it off, or the session left it.
 */
export const currentCard = <TCard extends { id: string }>(
    id: string,
    cards: readonly TCard[],
    replaced: Readonly<Record<string, string>>,
    onCanvas: ReadonlySet<string> | null,
): TCard | null => {
    const held = new Map(cards.map((card) => [card.id, card]));
    const standing = standingFor(
        id,
        { has: (other) => held.has(other) && (onCanvas === null || onCanvas.has(other)) },
        replaced,
    );

    return standing === null ? null : (held.get(standing) ?? null);
};

/** A transcript message as the turn rule reads it: a prompt with its page
 *  turn, marked `edit` when it is a card change. */
type TurnMessage = { role: 'user' | 'bot'; turn?: number; edit?: unknown };

/** The page turns whose prompt is a card change (marked `edit`): a card
 *  drawn in such a turn in another card's place keeps that card's turn
 *  (placeCard's `keepTurn`). */
export const changeTurns = (messages: readonly TurnMessage[]): ReadonlySet<number> =>
    new Set(
        messages.flatMap((message) =>
            message.role === 'user' && message.edit && message.turn !== undefined
                ? [message.turn]
                : [],
        ),
    );

/** The replacement map (`replaced`: each replacement's id to the id it took
 *  the place of) that held cards record of their chains (CardHistory's
 *  `replaced`, newest first), so a reopened conversation knows the cards its
 *  cards replaced. A card saved without a chain adds nothing. */
export const replacementsOf = (
    cards: readonly { id: string; replaced?: readonly string[] }[],
): Record<string, string> => {
    const map: Record<string, string> = {};

    for (const { id, replaced = [] } of cards) {
        [id, ...replaced].forEach((newer, index) => {
            const older = replaced[index];

            if (older !== undefined && map[newer] === undefined) map[newer] = older;
        });
    }

    return map;
};
