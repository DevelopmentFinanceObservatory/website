/**
 * The note under a reply whose card a card change redrew: the reply keeps
 * its text, which describes the card as it drew it, and the note says what
 * the card shows since. Built from the card's changeable rows as the reply
 * drew them and as the last change left them (CardHistory's `before` and
 * `after`, recorded by placeCard and saved with the card), so the note needs
 * no live offer, and a row changed back to where it started drops out.
 */

import type { Widget } from '../chat/widgets.ts';
import { changeOffers, offerText } from './cardChange.ts';
import type { CardHistory } from './cardReplace';

type NoteCard = Widget & { turn: number } & CardHistory;

/** What each of a card's changeable rows shows, keyed by offer id. */
export const rowValues = (widget: Widget & { turn: number }): Record<string, string> =>
    Object.fromEntries(changeOffers(widget).map((offer) => [offer.id, offerText(offer)]));

// Places first, then years, then the unit: the order a reader names them
// in, read from the row's offer id (`shows:<role>`, `years`, `unit`).
const order = (id: string): number => (id.startsWith('shows:') ? 0 : id === 'years' ? 1 : 2);

// A unit reads inside the sentence in lower case ("constant 2023 US
// dollars"); places and years keep their own case.
const inSentence = (id: string, text: string): string =>
    id === 'unit' ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;

/** The rows of `card` that show something else than its reply drew, in
 *  words, or none when no change stands. */
const changedRows = ({ before, after }: NoteCard): string[] => {
    if (!before || !after) return [];

    return Object.entries(after)
        .filter(([id, text]) => id in before && before[id] !== text)
        .toSorted(([a], [b]) => order(a) - order(b))
        .map(([id, text]) => inSentence(id, text));
};

/**
 * The one line under a reply whose cards (`cards`, the reply's own) a card
 * change redrew, or null when none shows anything else than the reply drew.
 * A reply with one card says "This card"; one with several names each
 * changed card by its title (`titleOf`).
 */
export const changeNote = (
    cards: readonly NoteCard[],
    titleOf: (card: NoteCard) => string,
): string | null => {
    const several = cards.filter((card) => card.kind !== 'text').length > 1;
    const sentences = cards.flatMap((card) => {
        const rows = changedRows(card);

        if (rows.length === 0) return [];

        const subject = several ? `“${titleOf(card)}”` : 'This card';

        return [`${subject} now shows ${rows.join(', ')}.`];
    });

    return sentences.length > 0 ? sentences.join(' ') : null;
};
