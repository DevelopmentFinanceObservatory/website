/**
 * The note under a reply whose card a card change redrew: the reply keeps
 * its text, which describes the card as it drew it, and the note says what
 * the card shows since. Built from the card's changeable rows (changeOffers)
 * as the reply drew them (CardHistory's `before`, recorded by placeCard) and
 * as they are now, so a row changed back to where it started drops out.
 */

import type { Widget } from '../chat/widgets.ts';
import { type ChangeOffer, changeOffers, offerText } from './cardChange.ts';
import type { CardHistory } from './cardReplace';

type NoteCard = Widget & { turn: number } & CardHistory;

/** What each of a card's changeable rows shows, keyed by offer id. */
export const rowValues = (widget: Widget & { turn: number }): Record<string, string> =>
    Object.fromEntries(changeOffers(widget).map((offer) => [offer.id, offerText(offer)]));

// Places first, then years, then the unit: the order a reader names them in.
const ORDER: Record<ChangeOffer['key'], number> = { shows: 0, years: 1, unit: 2 };

// A unit reads inside the sentence in lower case ("constant 2023 US
// dollars"); places and years keep their own case.
const inSentence = (offer: ChangeOffer, text: string): string =>
    offer.key === 'unit' ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;

/** The rows of `card` that show something else than its reply drew, in
 *  words, or none when no change stands. */
const changedRows = (card: NoteCard): string[] => {
    const before = card.before;

    if (!before) return [];

    return changeOffers(card)
        .filter((offer) => offer.id in before && before[offer.id] !== offerText(offer))
        .toSorted((a, b) => ORDER[a.key] - ORDER[b.key])
        .map((offer) => inSentence(offer, offerText(offer)));
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
