/**
 * The `Change` rows on a card's page: which of the card's rows can change and
 * the choices each offers (`changeOffers`), and where the reader's last change
 * to a row stands (`changeStatus`), read from the transcript. A change is a
 * silent turn: its user message carries `edit`, naming the card it changed,
 * and its reply holds text only when the harness refused it.
 */

import type { Widget } from '../chat/widgets.ts';
import { cardUnitOffer } from './cardUnit.ts';
import { baseYears, priceRows, servesUnit } from './unitChoice.ts';
import type { UnitChoice, UnitOffer } from './wire.ts';

/** The rows of `What it measures` a change can attach to. */
export type ChangeRowKey = 'unit' | 'years' | 'shows' | 'split';

/** One row's change: the row it attaches to, what it can move to, and the
 *  value it holds now. Each kind of change is one member. */
export type ChangeOffer = { key: 'unit'; offer: UnitOffer; current: UnitChoice };

/** Where the reader's last change to a row stands. */
export type ChangeStatus =
    { state: 'idle' } | { state: 'pending' } | { state: 'refused'; detail: string };

// More than one unit to choose from: two currencies, two price bases, or two
// base years.
const unitChoices = (offer: UnitOffer): boolean =>
    offer.currencies.length > 1 ||
    priceRows(offer, offer.start).length > 1 ||
    baseYears(offer, offer.start).length > 1;

const unitOffer = (widget: Widget & { turn: number }): ChangeOffer[] => {
    const offer = cardUnitOffer(widget);

    // A card with no turn to name cannot send the change (cardUnitChange). An
    // offer that does not serve its own starting unit is one the card no
    // longer reads, so the harness would refuse any pick from it.
    if (!offer || widget.turn < 1 || !servesUnit(offer, offer.start) || !unitChoices(offer)) {
        return [];
    }

    return [{ key: 'unit', offer, current: offer.start }];
};

/** The changes `widget` carries, each with at least two choices. A card whose
 *  unit offer went stale has none, since the refusal clears it from the
 *  widget (`useChat`'s `applyUnit`). */
export const changeOffers = (widget: Widget & { turn: number }): ChangeOffer[] => unitOffer(widget);

/** A transcript message as the change rows read it. An edit turn's user
 *  message names the card its request changed and the row. */
export type ChangeMessage = {
    role: 'user' | 'bot';
    text: string;
    edit?: { card: string; row: ChangeRowKey };
};

/** A change waiting behind the request in flight, as `useChat` queues it. */
export type QueuedChange = { unit?: { request: { component_id: string } } };

// The text of a refusal reply, which `applyUnit` writes in italics.
const refusalText = (text: string): string => text.trim().replace(/^_([\s\S]*)_$/, '$1');

/** The id of the card an edit turn's message changed, or undefined for any
 *  other message. */
export const editedCard = (message: ChangeMessage): string | undefined =>
    message.role === 'user' ? message.edit?.card : undefined;

/**
 * Where the last change to row `key` of card `cardId` stands. Pending while
 * it waits in the queue, or while its turn is the last one asked and the
 * conversation is busy. Refused when its reply holds text, the harness's
 * reason. Idle otherwise, which includes a change that succeeded: the card
 * then has a new id that no edit turn names yet.
 */
export const changeStatus = ({
    messages,
    thinking,
    cardId,
    key,
    queued = [],
}: {
    messages: readonly ChangeMessage[];
    thinking: boolean;
    cardId: string;
    key: ChangeRowKey;
    queued?: readonly QueuedChange[];
}): ChangeStatus => {
    if (key === 'unit' && queued.some((item) => item.unit?.request.component_id === cardId)) {
        return { state: 'pending' };
    }

    const at = messages.findLastIndex(
        (message) => editedCard(message) === cardId && message.edit?.row === key,
    );

    if (at < 0) {
        return { state: 'idle' };
    }

    const lastAsked = messages.findLastIndex((message) => message.role === 'user') === at;

    if (thinking && lastAsked) {
        return { state: 'pending' };
    }

    const reply = messages[at + 1];
    const detail = reply?.role === 'bot' ? refusalText(reply.text) : '';

    return detail ? { state: 'refused', detail } : { state: 'idle' };
};
