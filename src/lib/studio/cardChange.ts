/**
 * The `Change` rows on a card's page: which of the card's rows can change and
 * the choices each offers (`changeOffers`), the `apply_change` request a pick
 * of years or places sends (`yearsChange`, `placesChange`), the harness's
 * refusal of one, and where the reader's last change to a row stands
 * (`changeStatus`), read from the transcript. A change is a silent turn: its
 * user message carries `edit`, naming the card it changed and the row, and
 * its reply holds text only when the harness refused it.
 */

import { capitalise } from '../capitalise.ts';
import type { Widget } from '../chat/widgets.ts';
import { cardUnitOffer, SCOPE_CHOICE_STALE } from './cardUnit.ts';
import { CHANGE_REFUSAL_CODES, type ChangeRefusalCode } from './changeRefusalCodes.ts';
import type { StreamRefusal } from './studioClient.ts';
import { baseYears, priceRows, servesUnit, unitText } from './unitChoice.ts';
import type {
    ApplyChange,
    CardChangeMark,
    PlaceOption,
    PlacesLabel,
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
          /** The most places a change of the role can name. */
          max: number;
          chosen: PlaceOption[];
      };

/** Where the reader's last change to a row stands. A refusal carries the
 *  harness's code (`code`) when it sent one (changeRefusalCode), none when
 *  the harness's closing sentence gave it, and `dropped` when the change
 *  queue dropped the change (DroppedChange). */
export type ChangeStatus =
    | { state: 'idle' }
    | { state: 'pending' }
    | { state: 'refused'; detail: string; code?: ChangeRefusalCode; dropped?: true };

// More than one unit to choose from: two currencies, two price bases, or two
// base years.
const unitChoices = (offer: UnitOffer): boolean =>
    offer.currencies.length > 1 ||
    priceRows(offer, offer.start).length > 1 ||
    baseYears(offer, offer.start).length > 1;

const unitOffer = (widget: Widget & { turn: number }): ChangeOffer[] => {
    const offer = cardUnitOffer(widget);

    // A card with no turn to name cannot send the change (cardUnitChange). An
    // offer that does not serve its own starting unit is one the card does
    // not read, so the harness would refuse any pick from it.
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

/** The name of a places offer's role, as its row and its picker heading
 *  show it: the card data's own word for the role's places (`label`) in the
 *  form the role needs, plural for a role that takes several and singular
 *  for one, capitalised, else the page's word for `role`. */
export const roleLabel = (role: string, multiple: boolean, label?: PlacesLabel): string => {
    const own = multiple ? label?.plural : label?.singular;

    if (own?.trim()) return capitalise(own.trim());

    const words = ROLE_LABELS[role];

    return words ? (multiple ? words.many : words.one) : 'Shows';
};

const showsOffers = (widget: Widget): ChangeOffer[] => {
    const changes = widget.kind === 'text' ? undefined : widget.cardChanges;

    if (!changes) return [];

    return (changes.places ?? [])
        .filter((places) => places.chosen.length > 0)
        .map((places) => {
            // The most places a change can name: the card's own `max`, a
            // card stored before it was kept taking the request's cap, and
            // one for a role that takes one place.
            const max = places.multiple ? Math.min(places.max ?? MAX_PLACES, MAX_PLACES) : 1;
            const multiple = max > 1;

            return {
                key: 'shows',
                id: `shows:${places.role}`,
                specId: changes.spec_id,
                role: places.role,
                label: roleLabel(places.role, multiple, places.label),
                multiple,
                max,
                chosen: places.chosen,
            };
        });
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
): CardChangeRequest | null =>
    placesRequest(
        widget,
        title,
        role,
        places.map((place) => place.id),
        placesText(places),
    );

// The places change of `entities` in role `role` of `widget`, in `words`, or
// null when the card's offer does not take it.
const placesRequest = (
    widget: Widget,
    title: string,
    role: string,
    entities: readonly string[],
    words: string,
): CardChangeRequest | null => {
    const offer = showsOffers(widget).find((other) => other.key === 'shows' && other.role === role);

    if (offer?.key !== 'shows' || entities.length === 0 || entities.length > offer.max) {
        return null;
    }

    return {
        title,
        row: 'shows',
        role,
        label: offer.label,
        words,
        request: {
            component_id: componentIdOf(widget),
            spec_id: offer.specId,
            change: { kind: 'places', role, entities: [...entities] },
        },
    };
};

/** `change`, built when another card stood in its place, rebuilt for
 *  `widget`, the card standing there now: its id, its spec and its offer.
 *  Null when that offer does not take the change. */
export const retargetChange = (
    change: CardChangeRequest,
    widget: Widget,
): CardChangeRequest | null => {
    const asked = change.request.change;

    return asked.kind === 'window'
        ? yearsChange(widget, change.title, asked.start_year, asked.end_year)
        : placesRequest(widget, change.title, asked.role, asked.entities, change.words);
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

/** The error of the harness's 503 when the deployment cannot list places at
 *  all. It answers a places change and the places read. */
export const CAPABILITY_UNAVAILABLE = 'capability_unavailable';

/** The code of the harness's refusal of a card change, its `constraint_id`
 *  else its `error`, when it is one of CHANGE_REFUSAL_CODES; null otherwise. */
export const changeRefusalCode = (refusal: StreamRefusal): ChangeRefusalCode | null => {
    const named = [refusal.error?.constraint_id, refusal.error?.error];

    return CHANGE_REFUSAL_CODES.find((code) => named.includes(code)) ?? null;
};

/** The `detail` of the harness's refusal of a change of years or places (422
 *  with a pointer under `/apply_change`, or a 503 because the places could
 *  not be read or cannot be listed), or null for any other refusal. */
export const changeRefusalDetail = (refusal: StreamRefusal): string | null => {
    const { error } = refusal;

    if (refusal.status === 422 && error?.pointer?.startsWith('/apply_change')) {
        return error.detail;
    }

    return refusal.status === 503 &&
        (error?.constraint_id === PLACE_OPTIONS_UNAVAILABLE ||
            error?.error === CAPABILITY_UNAVAILABLE)
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
    refusal?: ChangeRefusalCode;
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

/** A queued change that could not be sent: the card standing in its card's
 *  place when its turn came (`card`), its row and role, and why. */
export type DroppedChange = { card: string; row: ChangeRowKey; role?: string; detail: string };

/**
 * How a change a card page sent (`sent`) was refused, or null while it
 * stands. While a card of its chain stands on the canvas (`standing`, the
 * standing card and those it replaced; empty once the chain left), the
 * row's status says (`status`, changeStatus). Once the chain left, the
 * queue's drop of it (`dropped`) says. `why` is `queue` for a drop,
 * else the harness's code, else `assistant`.
 */
export const sentRefusal = (
    sent: { card: string; key: ChangeRowKey; role?: string },
    standing: readonly string[],
    status: ChangeStatus | undefined,
    dropped: readonly DroppedChange[],
): { detail: string; why: ChangeRefusalCode | 'assistant' | 'queue' } | null => {
    if (standing.includes(sent.card) && status?.state === 'refused') {
        return {
            detail: status.detail,
            why: status.dropped ? 'queue' : (status.code ?? 'assistant'),
        };
    }

    const drop = dropped.find(
        (one) => one.card === sent.card && one.row === sent.key && one.role === sent.role,
    );

    return drop ? { detail: drop.detail, why: 'queue' } : null;
};

/** What the assistant can wait on the user for: a plan's approval or the
 *  answer to a question. */
export type ChangePause = 'plan' | 'question';

/** Why a card's `Change` rows wait, or null when they can go: a question
 *  waiting on an answer, or a plan waiting on approval (`live`), would be
 *  discarded by the change, since the harness closes a paused turn when it
 *  admits the next. */
export const changesHeld = (
    plan: { live: boolean } | null,
    question: unknown | null = null,
): string | null => {
    if (question) return 'Answer the question to change this card.';

    return plan?.live ? 'Approve or cancel the plan to change this card.' : null;
};

const PAUSE_DROPS: Record<ChangePause, string> = {
    plan: 'A plan came before this change went. Approve or cancel the plan, then change the card.',
    question: 'A question came before this change went. Answer it, then change the card.',
};

/** The queue once a pause arrives: its card changes leave it, each dropped
 *  with the reason (DroppedChange), since sending one would discard the
 *  pause. Every other item stays, in order. */
export const dropChangesForPause = <TItem extends QueuedChange>(
    queue: readonly TItem[],
    pause: ChangePause,
): { kept: TItem[]; dropped: DroppedChange[] } => {
    const kept: TItem[] = [];
    const dropped: DroppedChange[] = [];

    for (const item of queue) {
        const card = item.unit?.request.component_id ?? item.change?.request.component_id;

        if (card === undefined) {
            kept.push(item);
        } else {
            dropped.push({
                card,
                row: item.unit ? 'unit' : (item.change?.row ?? 'years'),
                ...(item.change?.role !== undefined && { role: item.change.role }),
                detail: PAUSE_DROPS[pause],
            });
        }
    }

    return { kept, dropped };
};

/** The id of row `key`'s change among a card's offers (`ChangeOffer`'s
 *  `id`): `unit`, `years`, or `shows:<role>`. */
export const changeRowId = (key: ChangeRowKey, role?: string): string =>
    key === 'shows' ? `shows:${role ?? ''}` : key;

/**
 * The status of each change row of card `cardId` (changeStatus), by row id
 * (changeRowId): one per offer, and the row of the last change asked of the
 * card's chain when the card offers that row no more, while that change
 * stands pending or refused. A refusal as stale withdraws the offer it
 * refused, so its reason stays on the page until the reader asks another
 * change of the card or a replacement takes its place.
 */
export const changeStatuses = ({
    offers,
    ...read
}: Omit<Parameters<typeof changeStatus>[0], 'key' | 'role'> & {
    offers: readonly ChangeOffer[];
}): Map<string, ChangeStatus> => {
    const statuses = new Map(
        offers.map((offer): [string, ChangeStatus] => [
            offer.id,
            changeStatus({
                ...read,
                key: offer.key,
                ...(offer.key === 'shows' && { role: offer.role }),
            }),
        ]),
    );
    const cardIds = [read.cardId, ...(read.replaced ?? [])];
    const last = read.messages.findLast((message) => {
        const card = editedCard(message);

        return card !== undefined && cardIds.includes(card);
    })?.edit;

    if (!last || statuses.has(changeRowId(last.row, last.role))) return statuses;

    const status = changeStatus({
        ...read,
        key: last.row,
        ...(last.role !== undefined && { role: last.role }),
    });

    if (status.state !== 'idle') statuses.set(changeRowId(last.row, last.role), status);

    return statuses;
};

/** Whether a change to row `key` (role `role`) of any of `cardIds` waits in
 *  the queue. */
export const changeQueued = (
    queued: readonly QueuedChange[],
    cardIds: readonly string[],
    key: ChangeRowKey,
    role?: string,
): boolean => queued.some((item) => cardIds.some((id) => queuedFor(item, id, key, role)));

/**
 * Where the last change to row `key` of card `cardId` (role `role` of a
 * `shows` row) stands. `replaced` lists the cards `cardId` took the place of
 * (replacedChain), since a change asked of one of them is the standing
 * card's. Pending while it waits in the queue, or while its turn is the last
 * one asked and the conversation is busy. Refused when the queue dropped it
 * (`dropped`), or when the reply to a change of `cardId` itself holds text,
 * the harness's reason. Idle otherwise, which includes a change that
 * succeeded: the card then has a new id that no edit turn names yet.
 */
export const changeStatus = ({
    messages,
    thinking,
    cardId,
    key,
    role,
    replaced = [],
    queued = [],
    dropped = [],
}: {
    messages: readonly ChangeMessage[];
    thinking: boolean;
    cardId: string;
    key: ChangeRowKey;
    role?: string;
    replaced?: readonly string[];
    queued?: readonly QueuedChange[];
    dropped?: readonly DroppedChange[];
}): ChangeStatus => {
    const cardIds = [cardId, ...replaced];

    if (changeQueued(queued, cardIds, key, role)) {
        return { state: 'pending' };
    }

    const drop = dropped.findLast(
        (item) => item.card === cardId && item.row === key && item.role === role,
    );

    if (drop) {
        return { state: 'refused', detail: drop.detail, dropped: true };
    }

    const at = messages.findLastIndex((message) => {
        const card = editedCard(message);

        return (
            card !== undefined &&
            cardIds.includes(card) &&
            message.edit?.row === key &&
            message.edit.role === role
        );
    });

    if (at < 0) {
        return { state: 'idle' };
    }

    const lastAsked = messages.findLastIndex((message) => message.role === 'user') === at;

    if (thinking && lastAsked) {
        return { state: 'pending' };
    }

    // A refusal of a change asked of a card since replaced is that card's.
    const asked = messages[at];

    if (!asked || editedCard(asked) !== cardId) {
        return { state: 'idle' };
    }

    const reply = messages[at + 1];
    const detail = reply?.role === 'bot' ? refusalText(reply.text) : '';
    const code = reply?.refusal;

    return detail ? { state: 'refused', detail, ...(code && { code }) } : { state: 'idle' };
};
