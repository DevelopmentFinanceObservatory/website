/**
 * The `Change` rows on a card's page: which of the card's rows can change and
 * the choices each offers (`changeOffers`), the `apply_change` request a pick
 * of years or places sends (`yearsChange`, `placesChange`), the harness's
 * refusal of one, and where the reader's last change to a row stands
 * (`changeStatus`), read from the transcript. A change is a silent turn: its
 * user message carries `edit`, naming the card it changed and the row, and
 * its reply holds text only when the harness refused it.
 */

import type { Widget } from '../chat/widgets.ts';
import { cardUnitOffer, SCOPE_CHOICE_STALE } from './cardUnit.ts';
import type { StreamRefusal } from './studioClient.ts';
import { baseYears, priceRows, servesUnit, unitText } from './unitChoice.ts';
import type {
    ApplyChange,
    CardChangeMark,
    PlaceOption,
    UnitChoice,
    UnitOffer,
    WindowOffer,
} from './wire.ts';

/** The rows of `What it measures` a change can attach to. */
export type ChangeRowKey = 'unit' | 'years' | 'shows';

/** The mark on a card change's prompt: the card the change named, the row,
 *  and for a change of places the role. */
export type ChangeEdit = { card: string; row: ChangeRowKey; role?: string };

const MARK_ROWS: Record<CardChangeMark['kind'], ChangeRowKey> = {
    unit: 'unit',
    window: 'years',
    places: 'shows',
};

/** The prompt mark of a turn a state read records as a card change. */
export const editOfMark = (mark: CardChangeMark): ChangeEdit => ({
    card: mark.component_id,
    row: MARK_ROWS[mark.kind],
    ...(mark.role ? { role: mark.role } : {}),
});

/** One row's change: the row it attaches to (`key`), the offer's own id among
 *  the card's offers (`id`: one `shows` offer per role), what it can move to,
 *  and the value it holds now. */
export type ChangeOffer =
    | { key: 'unit'; id: 'unit'; offer: UnitOffer; current: UnitChoice }
    | { key: 'years'; id: 'years'; specId: string; window: WindowOffer }
    | {
          key: 'shows';
          id: string;
          specId: string;
          role: string;
          label: string;
          multiple: boolean;
          chosen: PlaceOption[];
      };

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

    return [{ key: 'unit', id: 'unit', offer, current: offer.start }];
};

/** The years a range of `window` can start or end on: every year from its
 *  first to its last that holds data. */
export const windowYears = (window: WindowOffer): number[] => {
    const missing = new Set(window.missing_years ?? []);
    const years: number[] = [];

    for (let year = window.first_year; year <= window.last_year; year += 1) {
        if (!missing.has(year)) years.push(year);
    }

    return years;
};

/** Whether `from` to `to` is a range the harness takes from `window`: both
 *  ends years with data inside it, `from` no later than `to`, so a range may
 *  be one year. A `single` window takes one year only. */
export const windowServes = (window: WindowOffer, from: number, to: number): boolean => {
    const years = windowYears(window);

    return (window.single ? from === to : from <= to) && years.includes(from) && years.includes(to);
};

/** Whether `from` to `to` is another range than the one `window` draws. */
export const windowChanged = (window: WindowOffer, from: number, to: number): boolean =>
    from !== window.start_year || to !== window.end_year;

const yearsOffer = (widget: Widget): ChangeOffer[] => {
    const changes = widget.kind === 'text' ? undefined : widget.cardChanges;
    const window = changes?.window;

    if (!changes || !window) return [];

    const ends = windowYears(window).length;
    const ranges = window.single ? ends : (ends * (ends + 1)) / 2;
    const drawsOne = windowServes(window, window.start_year, window.end_year);

    // Some range other than the one drawn.
    return ranges > (drawsOne ? 1 : 0)
        ? [{ key: 'years', id: 'years', specId: changes.spec_id, window }]
        : [];
};

// The reader's words for a role of places, as the site's search pages label
// the two sides of a flow. Any other role is the place the card shows.
const ROLE_LABELS: Record<string, { one: string; many: string }> = {
    origin: { one: 'Provider', many: 'Providers' },
    destination: { one: 'Recipient', many: 'Recipients' },
};

/** The row label of a places offer for `role`. */
export const roleLabel = (role: string, multiple: boolean): string => {
    const words = ROLE_LABELS[role];

    return words ? (multiple ? words.many : words.one) : 'Shows';
};

const showsOffers = (widget: Widget): ChangeOffer[] => {
    const changes = widget.kind === 'text' ? undefined : widget.cardChanges;

    if (!changes) return [];

    return (changes.places ?? [])
        .filter((places) => places.chosen.length > 0)
        .map((places) => ({
            key: 'shows',
            id: `shows:${places.role}`,
            specId: changes.spec_id,
            role: places.role,
            label: roleLabel(places.role, places.multiple),
            multiple: places.multiple,
            chosen: places.chosen,
        }));
};

/** The changes `widget` carries: its unit when it has at least two to choose
 *  from, its years when another range is open, and its places per role. A
 *  card whose offer went stale has none of that offer, since the refusal
 *  clears it from the widget (`useChat`'s `applyUnit` and `applyChange`). */
export const changeOffers = (widget: Widget & { turn: number }): ChangeOffer[] => [
    ...unitOffer(widget),
    ...yearsOffer(widget),
    ...showsOffers(widget),
];

/** The value an offer's row shows when the card's facts have no row for it. */
export const offerText = (offer: ChangeOffer): string => {
    switch (offer.key) {
        case 'unit':
            return unitText(offer.offer, offer.current);
        case 'years':
            return yearsText(offer.window.start_year, offer.window.end_year);
        case 'shows':
            return placesText(offer.chosen);
    }
};

/** A range of years in words: "2010 to 2024", or "2020" for one year. */
export const yearsText = (from: number, to: number): string =>
    from === to ? `${from}` : `${from} to ${to}`;

/** Places in words: "Kenya", "Kenya and Uganda", "Kenya, Uganda and Ghana". */
export const placesText = (places: readonly PlaceOption[]): string => {
    const labels = places.map((place) => place.label);
    const last = labels.pop();

    return labels.length > 0 ? `${labels.join(', ')} and ${last}` : (last ?? '');
};

/** The places a places picker lists: those the card shows, then each option
 *  it does not list already. */
export const pickablePlaces = (
    shown: readonly PlaceOption[],
    options: readonly PlaceOption[],
): PlaceOption[] => {
    const seen = new Set<string>();

    return [...shown, ...options].filter((place) => {
        if (seen.has(place.id)) return false;

        seen.add(place.id);

        return true;
    });
};

/** Whether `place`'s label holds the filter's text, ignoring case. */
export const placeMatches = (place: PlaceOption, filter: string): boolean =>
    place.label.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());

/** Whether `picked` names other places than `shown`, in any order. */
export const placesChanged = (
    shown: readonly PlaceOption[],
    picked: readonly PlaceOption[],
): boolean => {
    const ids = new Set(shown.map((place) => place.id));

    return picked.length !== ids.size || picked.some((place) => !ids.has(place.id));
};

/** A pick of years or places, ready to send: the card's title as the canvas
 *  shows it, the row it changes (and the role, for places), the row's label,
 *  the pick in words, and the request. */
export type CardChangeRequest = {
    title: string;
    row: 'years' | 'shows';
    role?: string;
    label: string;
    words: string;
    request: ApplyChange;
};

const componentIdOf = (widget: Widget): string =>
    widget.kind === 'text' ? widget.id : (widget.ref?.component_id ?? widget.id);

/** The change that draws `widget` over `from` to `to`, or null when the card
 *  offers no such range. */
export const yearsChange = (
    widget: Widget,
    title: string,
    from: number,
    to: number,
): CardChangeRequest | null => {
    const offer = yearsOffer(widget)[0];

    if (offer?.key !== 'years' || !windowServes(offer.window, from, to)) return null;

    return {
        title,
        row: 'years',
        label: 'Years',
        words: yearsText(from, to),
        request: {
            component_id: componentIdOf(widget),
            spec_id: offer.specId,
            change: { kind: 'window', start_year: from, end_year: to },
        },
    };
};

/** The most places one change can name (`PlacesChange.entities`). */
export const MAX_PLACES = 50;

/** The change that shows `places` in role `role` of `widget`, or null when
 *  the card offers no change of that role, or the pick is empty, too long,
 *  or more than one place for a role that takes one. */
export const placesChange = (
    widget: Widget,
    title: string,
    role: string,
    places: readonly PlaceOption[],
): CardChangeRequest | null => {
    const offer = showsOffers(widget).find((other) => other.key === 'shows' && other.role === role);

    if (
        offer?.key !== 'shows' ||
        places.length === 0 ||
        places.length > MAX_PLACES ||
        (!offer.multiple && places.length > 1)
    ) {
        return null;
    }

    return {
        title,
        row: 'shows',
        role,
        label: offer.label,
        words: placesText(places),
        request: {
            component_id: componentIdOf(widget),
            spec_id: offer.specId,
            change: { kind: 'places', role, entities: places.map((place) => place.id) },
        },
    };
};

/** The machine-readable codes of the harness's 422 refusals of a change. */
export const CHANGE_REFUSALS = [
    SCOPE_CHOICE_STALE,
    'change_not_offered',
    'change_no_data',
] as const;

/** The constraint id of the harness's 503 when it could not read the places a
 *  card can change to. It answers a places change and the places read. */
export const PLACE_OPTIONS_UNAVAILABLE = 'place_options_unavailable';

/** The `detail` of the harness's refusal of a change of years or places (422
 *  with a pointer under `/apply_change`, or the 503 of a places read that
 *  failed), or null for any other refusal. */
export const changeRefusalDetail = (refusal: StreamRefusal): string | null => {
    const { error } = refusal;

    if (refusal.status === 422 && error?.pointer?.startsWith('/apply_change')) {
        return error.detail;
    }

    return refusal.status === 503 && error?.constraint_id === PLACE_OPTIONS_UNAVAILABLE
        ? error.detail
        : null;
};

/** Whether the harness refused a change as stale: the card's offers are dead,
 *  so the card should stop offering them. */
export const changeRefusalStale = (refusal: StreamRefusal): boolean =>
    changeRefusalDetail(refusal) !== null && refusal.error?.constraint_id === SCOPE_CHOICE_STALE;

/** A transcript message as the change rows read it. An edit turn's user
 *  message names the card its request changed, the row, and for a change of
 *  places the role. */
export type ChangeMessage = {
    role: 'user' | 'bot';
    text: string;
    edit?: ChangeEdit;
};

/** A change waiting behind the request in flight, as `useChat` queues it. */
export type QueuedChange = {
    unit?: { request: { component_id: string } };
    change?: { row: ChangeRowKey; role?: string; request: { component_id: string } };
};

// The text of a refusal reply, which `applyUnit` writes in italics.
const refusalText = (text: string): string => text.trim().replace(/^_([\s\S]*)_$/, '$1');

/** The id of the card an edit turn's message changed, or undefined for any
 *  other message. */
export const editedCard = (message: ChangeMessage): string | undefined =>
    message.role === 'user' ? message.edit?.card : undefined;

const queuedFor = (item: QueuedChange, cardId: string, key: ChangeRowKey, role?: string) =>
    key === 'unit'
        ? item.unit?.request.component_id === cardId
        : item.change?.request.component_id === cardId &&
          item.change.row === key &&
          item.change.role === role;

/**
 * Where the last change to row `key` of card `cardId` (role `role` of a
 * `shows` row) stands. Pending while it waits in the queue, or while its
 * turn is the last one asked and the conversation is busy. Refused when its
 * reply holds text, the harness's reason. Idle otherwise, which includes a
 * change that succeeded: the card then has a new id that no edit turn names
 * yet.
 */
export const changeStatus = ({
    messages,
    thinking,
    cardId,
    key,
    role,
    queued = [],
}: {
    messages: readonly ChangeMessage[];
    thinking: boolean;
    cardId: string;
    key: ChangeRowKey;
    role?: string;
    queued?: readonly QueuedChange[];
}): ChangeStatus => {
    if (queued.some((item) => queuedFor(item, cardId, key, role))) {
        return { state: 'pending' };
    }

    const at = messages.findLastIndex(
        (message) =>
            editedCard(message) === cardId &&
            message.edit?.row === key &&
            message.edit.role === role,
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
