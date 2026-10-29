import {
    readShareHistory,
    readSlotCard,
    readSlotFile,
    SharesError,
    type CreateShareBody,
    type ServedEntry,
    type ShareRecord,
    type SharesBackend,
} from '../chat/apisShares.ts';
import type { SavedConversation } from '../chat/history.ts';
import type { StudioShareKind } from '../chat/shareMode.ts';
import type { CardRef, FrameRef, Widget } from '../chat/widgets.ts';
import { asRecord } from '../asRecord.ts';
import { dropEncodedLength, pick } from '../proxy/headers.ts';
import { problem, type ProblemStatus } from '../proxy/problem.ts';
import { gateOf } from './gate.ts';
import {
    BackendError,
    bounded,
    componentReadOf,
    drawnFrame,
    readComponent,
    type LiveBackend,
} from './liveBackend.ts';
import { widgetFromLiveCard, type SharedView } from './liveCards.ts';

/**
 * The cards of a share held in dfo-apis, as the share pages draw them, and
 * the check a live share's cards pass before it is made.
 *
 * A share's payload (src/lib/chat/sharePayload.ts) holds each slotted data
 * card with `slot`, the 0-based index of the slot that draws it, and none of
 * what it showed. `sharedViewOfRecord` gives every held card its slot's
 * component revision as `ref`, and names its slot in `slots`, which the page
 * puts in each card's refresh and data URLs. Every card, live or snapshot,
 * comes from dfo-apis' public slot card route, which draws the slot's card
 * on the frame the slot serves. A snapshot's slots serve the frames dfo-apis
 * pinned, so its cards are drawn here on the server, within a few seconds. A
 * live share's cards leave the server held, and the browser fills each one
 * (`refreshLiveCards`) from `GET /api/share/[id]/cards/[cardId]/refresh?slot=`,
 * whose body is `slotRefreshResponse`. A snapshot card the server did not
 * read in time is filled the same way. A snapshot's page also reads the
 * share's history, which says since when each slot has shown its
 * frame (`servedAt`), the date a card's citation gives.
 *
 * A live slot serves the newest frame. dfo-apis checks for newer data at
 * most once per 15 minutes and records what it served in the share's
 * history. The route's `ETag` and `Cache-Control` pass through, and so does
 * the browser's `If-None-Match`, so a card that has not changed answers 304.
 *
 * No database, React, or path-alias dependency, so `node --test` imports it.
 */

export type SlotDeps = { shares: SharesBackend };

// The public component reads and exports, which carry no credential.
const publicReads = ({ shares }: SlotDeps): LiveBackend => ({
    apisBase: shares.base,
    aiBase: '',
    principal: '',
    fetch: shares.fetch,
});

// A refresh's whole budget: the slot card read.
const REFRESH_DEADLINE_MS = 75_000;

// A share page's whole budget for drawing a snapshot's cards on the server.
// A card not read by then is left for the browser to fill, so a slow slot
// holds the page back by this much at most.
const PAGE_DEADLINE_MS = 4_000;

// One export call: dfo-apis stops a component route at 30 seconds.
const EXPORT_DEADLINE_MS = 35_000;

// One deadline covers the component reads that check a new live share. 20
// cards read four at a time are five rounds of reads of about 25 milliseconds.
const CREATE_CHECK_DEADLINE_MS = 15_000;

// How many component reads one page or check has in flight at once: the
// dfo-apis default for `PRESENTATION_COMPONENTS_MAX_CONCURRENCY`.
const READ_CONCURRENCY = 4;

// A viewer opening a live canvas reads one slot card per data card, and
// each read can cost dfo-apis a newest-data check and a render, so the cap
// bounds what one opening costs.
export const LIVE_SHARE_MAX_DATA_CARDS = 20;

const sameFrame = (a: FrameRef | null, b: FrameRef | null): boolean =>
    a?.spec_id === b?.spec_id && a?.content_version === b?.content_version;

type PayloadWidget = Record<string, unknown> & { id: string; kind: string };

const widgetsOf = (payload: unknown): PayloadWidget[] => {
    const widgets = asRecord(payload)?.['widgets'];

    return Array.isArray(widgets)
        ? widgets.filter(
              (widget): widget is PayloadWidget =>
                  asRecord(widget) !== undefined &&
                  typeof widget['id'] === 'string' &&
                  typeof widget['kind'] === 'string',
          )
        : [];
};

// The 1-based slot a payload widget's `slot` index names, with its card.
const slotCardOf = (
    record: ShareRecord,
    widget: PayloadWidget,
): { slot: number; ref: CardRef } | null => {
    const index = widget['slot'];

    if (!Number.isSafeInteger(index)) {
        return null;
    }

    const slot = (index as number) + 1;
    const card = record.slots.find((entry) => entry.slot === slot)?.card;

    return card
        ? { slot, ref: { component_id: card.component_id, revision: card.revision } }
        : null;
};

// A payload's held card in the shape the card components draw: the kind,
// id, turn, and chart shape it keeps, empty values, and its slot's `ref`.
const heldWidget = (widget: PayloadWidget, ref: CardRef | undefined): Widget => {
    const { id } = widget;
    const turn = widget['turn'] as number;

    switch (widget.kind) {
        case 'key_number':
            return { kind: 'key_number', id, turn, label: '', value: '', ref } as Widget;
        case 'chart':
            return {
                kind: 'chart',
                id,
                turn,
                chartType: widget['chartType'] === 'bar' ? 'bar' : 'line',
                horizontal: widget['horizontal'] === true ? true : undefined,
                title: '',
                categories: [],
                series: [],
                ref,
            } as Widget;
        default:
            return { kind: 'table', id, turn, title: '', columns: [], rows: [], ref } as Widget;
    }
};

// Held in the payload: every slotted card, and in a live share every data
// card, slotted or not (`slotCanvas`).
const isHeld = (record: ShareRecord, widget: PayloadWidget): boolean =>
    widget.kind !== 'text' && (Number.isSafeInteger(widget['slot']) || record.mode === 'live');

// A share made through the Presentation API (the SDK) holds no widgets of
// the website's own: its payload is null. It shows one card per filled
// slot, held as a table until its slot's card says what it draws
// (`widgetFromLiveCard`).
const slotWidgets = (record: ShareRecord): PayloadWidget[] =>
    record.slots.flatMap(({ slot, card }) =>
        card ? [{ kind: 'table', id: `slot-${slot}`, turn: 1, slot: slot - 1 }] : [],
    );

// The canvas a share's payload holds, with `widgets` in place of its own.
// Fields a payload leaves out, as an SDK share's leaves them all, read as an
// empty canvas named by the share's title.
const savedOf = (record: ShareRecord, widgets: SavedConversation['widgets']): SavedConversation =>
    ({
        id: record.id,
        sessionId: null,
        title: record.title ?? '',
        updatedAt: Date.parse(record.createdAt),
        messages: [],
        turnCount: 1,
        pinnedIds: [],
        removedIds: [],
        layout: {},
        ...asRecord(record.payload),
        widgets,
    }) as SavedConversation;

// When each slot of a snapshot began to show the frame it serves, by slot:
// the newest entry of the share's history with that slot and frame. The
// history is read a page at a time until every framed slot has its entry
// or the history ends, or names a page it has already given. A slot is left
// out when no entry matches, or when a page cannot be read (the page deadline
// included) before its entry turns up.
const servedSince = async (
    shares: SharesBackend,
    record: ShareRecord,
): Promise<Map<number, string>> => {
    const pending = record.slots.flatMap(({ slot, card }) =>
        card?.frame ? [{ slot, frame: card.frame }] : [],
    );
    const since = new Map<number, string>();
    const seen = new Set<string>();
    let before: string | null = null;

    while (pending.length) {
        let page: { served: ServedEntry[]; next: string | null };

        try {
            page = await readShareHistory(shares, record.id, before);
        } catch (error) {
            console.error('share: the share history could not be read', {
                share: record.id,
                error: error instanceof SharesError ? error.code : String(error),
            });

            break;
        }

        for (const { slot: at, card, firstServedAt } of page.served) {
            const found = pending.findIndex(
                ({ slot, frame }) => slot === at && card !== null && sameFrame(card.frame, frame),
            );

            if (found !== -1) {
                since.set(at, firstServedAt);
                pending.splice(found, 1);
            }
        }

        if (page.next === null || seen.has(page.next)) {
            break;
        }

        seen.add(page.next);
        before = page.next;
    }

    return since;
};

/**
 * A Studio share from dfo-apis as its page passes it to the client. Every
 * held card has its slot's revision as `ref`, and `slots` names each one's
 * slot. A share whose payload holds no widgets shows one card per filled
 * slot. A snapshot's held cards are drawn here from their slots' cards, each
 * on the frame its slot recorded: the frame of the card's revision for a
 * share made as a snapshot, and the frame the slot served at the switch for
 * a live share made a snapshot. `servedAt` gives each held card of a
 * snapshot the moment its slot began to show that frame, from the share's
 * history read a page at a time; a card is left out when no entry matches
 * or a page it needs cannot be read. The reads share `deadlineMs`. A card whose
 * read fails or is not done by then stays held and is named in `undrawn`,
 * so the browser asks the refresh route for it, and the failure is logged.
 * A live share's cards stay held for the browser.
 */
export const sharedViewOfRecord = async (
    deps: SlotDeps,
    record: ShareRecord,
    { deadlineMs = PAGE_DEADLINE_MS }: { deadlineMs?: number } = {},
): Promise<SharedView> => {
    const live = record.mode === 'live';
    const shares = { ...deps.shares, signal: AbortSignal.timeout(deadlineMs) };
    const gate = gateOf(READ_CONCURRENCY);
    const undrawn: string[] = [];
    const slots: Record<string, number> = {};
    const payloadWidgets = widgetsOf(record.payload);

    // Read beside the cards, within the same deadline.
    const firstServed = live
        ? Promise.resolve(new Map<number, string>())
        : servedSince(shares, record);

    const drawn = async (held: Widget, slot: number): Promise<Widget | null> => {
        const { body } = await gate(() => readSlotCard(shares, record.id, slot));

        return body && widgetFromLiveCard(held, componentReadOf(body).card);
    };

    const widgets = await Promise.all(
        (payloadWidgets.length ? payloadWidgets : slotWidgets(record)).map(async (widget) => {
            if (!isHeld(record, widget)) {
                return widget as unknown as Widget;
            }

            const slotted = slotCardOf(record, widget);
            const held = heldWidget(widget, slotted?.ref);

            if (slotted) {
                slots[widget.id] = slotted.slot;
            }

            if (live || !slotted) {
                return held;
            }

            try {
                const card = await drawn(held, slotted.slot);

                if (card) {
                    return card;
                }
            } catch (error) {
                console.error('share: a snapshot card could not be read', {
                    share: record.id,
                    slot: slotted.slot,
                    error:
                        error instanceof BackendError || error instanceof SharesError
                            ? error.code
                            : String(error),
                });
            }

            undrawn.push(widget.id);

            return held;
        }),
    );
    const servedBySlot = await firstServed;
    const servedAt = Object.fromEntries(
        Object.entries(slots).flatMap(([id, slot]) => {
            const at = servedBySlot.get(slot);

            return at ? [[id, at]] : [];
        }),
    );

    return {
        id: record.id,
        kind: record.kind as StudioShareKind,
        // Every widget keeps the turn its payload widget has.
        saved: savedOf(record, widgets as SavedConversation['widgets']),
        live,
        undrawn,
        slots,
        servedAt,
        createdAt: record.createdAt,
    };
};

type CardError = { status: 'error'; code: string; retryable?: true };

const errorOf = (error: unknown): CardError => {
    if (error instanceof BackendError || error instanceof SharesError) {
        return {
            status: 'error',
            code: error.code,
            ...(error.retryable ? { retryable: true as const } : {}),
        };
    }

    throw error;
};

const NO_STORE = { 'Cache-Control': 'no-store' };

const notFound = (): Response =>
    problem({
        status: 404,
        code: 'not_found',
        detail: 'There is no such shared card.',
        retryable: false,
        headers: NO_STORE,
    });

/** The slot a card route's `slot` query names (from 1), or null for none
 *  or anything but a whole number from 1. The share page puts each card's
 *  slot in its URLs (`SharedView.slots`), so a route reads the slot alone. */
export const slotOfQuery = (value: string | null): number | null =>
    value && /^[1-9][0-9]{0,8}$/.test(value) ? Number(value) : null;

// dfo-apis' answer for a share id or slot it does not have, an empty slot,
// or a note's slot.
const isNoSlot = (error: unknown): boolean =>
    error instanceof SharesError && error.status === 404 && error.code === 'not_found';

/**
 * `GET /api/share/[id]/cards/[cardId]/refresh?slot=`. The card slot `slot`
 * of the share draws: 404 without a slot, or when dfo-apis has no such
 * share or card-holding slot. Otherwise 200 with `{status, card}`, where
 * `status` is `current` when the card stands on its revision's own frame
 * and `redrawn` when dfo-apis drew it on another, under dfo-apis' `ETag`
 * and `Cache-Control`; 304 when `ifNoneMatch` names that ETag; or 200 with
 * `{status: 'error', code, retryable?}`, so one failing card leaves the rest
 * of the page standing. The card id names the card to its reader only: the
 * slot routes are public, so the share record is not read to match it.
 */
export const slotRefreshResponse = async (
    deps: SlotDeps,
    shareId: string,
    slot: number | null,
    ifNoneMatch: string | null = null,
): Promise<Response> => {
    const shares = { ...deps.shares, signal: AbortSignal.timeout(REFRESH_DEADLINE_MS) };

    if (slot === null) {
        return notFound();
    }

    try {
        const served = await readSlotCard(shares, shareId, slot, ifNoneMatch);
        const headers = new Headers({ 'Cache-Control': served.cacheControl ?? 'no-cache' });

        if (served.etag) {
            headers.set('ETag', served.etag);
        }

        if (!served.body) {
            return new Response(null, { status: 304, headers });
        }

        const { card, frame } = componentReadOf(served.body);
        const status = sameFrame(frame, drawnFrame(card)) ? 'current' : 'redrawn';

        return Response.json({ status, card }, { headers });
    } catch (error) {
        return isNoSlot(error) ? notFound() : Response.json(errorOf(error), { headers: NO_STORE });
    }
};

const EXPORT_HEADERS = ['content-type', 'content-disposition', 'content-length'];

// The statuses with which dfo-apis refuses an export request itself: a
// format it cannot write, or rows that are gone.
const REQUEST_REFUSALS = [400, 404, 422] as const satisfies readonly ProblemStatus[];

const noFile = (
    { code, retryable }: { code: string; retryable?: boolean },
    status: ProblemStatus = 502,
): Response =>
    problem({
        status,
        code,
        detail: 'The card has no data file to serve.',
        retryable: retryable === true,
        headers: NO_STORE,
    });

/**
 * `GET /api/share/[id]/cards/[cardId]/data?slot=&format=&bundle=`. 404
 * without a slot. The rows of the card slot `slot` draws, on the frame the
 * slot serves (for a live share, the newest; for a snapshot, the one
 * pinned), in every format and as a bundle or a bare file, from dfo-apis'
 * slot data route. The route's
 * defaults are the component export's (a CSV bundle), and the request names
 * both explicitly, so the file is the one the browser asked for. dfo-apis
 * refuses a format or bundle it cannot write (JSON as a bundle, or an
 * unknown format) with 400. A download that cannot be served answers a
 * problem document under an error status, so a browser does not save it as
 * the file.
 */
export const slotDataResponse = async (
    deps: SlotDeps,
    shareId: string,
    query: URLSearchParams,
): Promise<Response> => {
    const shares = { ...deps.shares, signal: AbortSignal.timeout(EXPORT_DEADLINE_MS) };
    const slot = slotOfQuery(query.get('slot'));

    if (slot === null) {
        return notFound();
    }

    try {
        const upstream = await readSlotFile(shares, shareId, slot, {
            format: query.get('format') ?? 'csv',
            bundle: query.get('bundle') ?? 'true',
        });
        const headers = new Headers(NO_STORE);

        pick(upstream.headers, EXPORT_HEADERS, headers);
        dropEncodedLength(upstream.headers, headers);

        return new Response(upstream.body, { headers });
    } catch (error) {
        if (!(error instanceof BackendError || error instanceof SharesError)) {
            throw error;
        }

        const status = REQUEST_REFUSALS.find((refusal) => refusal === error.status) ?? 502;

        return noFile(error, status);
    }
};

type BlockedCard = { id: string; reason: 'unknown_component' | 'unsupported_frame' };

const isRefreshableFrame = (frame: FrameRef | null): boolean =>
    frame !== null && (frame.spec_id.startsWith('spec_') || frame.spec_id.startsWith('ops_'));

/**
 * The problem document that says why `body`, a live share about to be made,
 * cannot be live, or null when it can. Run before the create, so a share
 * whose cards fail is never made. The share holds at most
 * `LIVE_SHARE_MAX_DATA_CARDS` cards (400 `live_too_many_cards`, with `limit`
 * and `count`), and every card's revision is one dfo-apis reads publicly
 * and stands on a dataset or derived frame, which a slot can follow to
 * newer data (400 `live_cards_blocked`, naming the payload widget of each
 * card that fails). A read that fails for want of an answer is 502
 * `transient_unavailable`.
 */
export const liveCardsRefusal = async (
    deps: SlotDeps,
    { cards, payload }: Pick<CreateShareBody, 'cards' | 'payload'>,
): Promise<Response | null> => {
    if (cards.length > LIVE_SHARE_MAX_DATA_CARDS) {
        return problem({
            status: 400,
            code: 'live_too_many_cards',
            detail: `A live share holds at most ${LIVE_SHARE_MAX_DATA_CARDS} data cards; this one holds ${cards.length}.`,
            retryable: false,
            extra: { limit: LIVE_SHARE_MAX_DATA_CARDS, count: cards.length },
        });
    }

    const reads = bounded(publicReads(deps), CREATE_CHECK_DEADLINE_MS);
    const gate = gateOf(READ_CONCURRENCY);
    // Each slot's card, by the payload widget that the slot draws.
    const slotted = widgetsOf(payload).flatMap((widget) => {
        const index = widget['slot'];
        const ref = Number.isSafeInteger(index) ? cards[index as number] : undefined;

        return ref ? [{ id: widget.id, ref }] : [];
    });

    const blockOf = async ({ id, ref }: { id: string; ref: CardRef }) => {
        try {
            const { frame } = await gate(() => readComponent(reads, ref));

            return isRefreshableFrame(frame) ? null : { id, reason: 'unsupported_frame' as const };
        } catch (error) {
            // A 404 is dfo-apis saying the ref names no component of its own.
            // Any other refusal says nothing about the card, so the check
            // fails as transient.
            if (error instanceof BackendError && error.status === 404) {
                return { id, reason: 'unknown_component' as const };
            }

            throw error;
        }
    };

    let blocked: BlockedCard[];

    try {
        blocked = (await Promise.all(slotted.map(blockOf))).filter((block) => block !== null);
    } catch (error) {
        console.error('live share: card check failed', {
            error: error instanceof BackendError ? error.code : String(error),
        });

        return problem({
            status: 502,
            code: 'transient_unavailable',
            detail: 'The data cards could not be checked right now. Try again in a minute.',
            retryable: true,
        });
    }

    return blocked.length
        ? problem({
              status: 400,
              code: 'live_cards_blocked',
              detail: 'Some data cards cannot show live data, so the share cannot be live.',
              retryable: false,
              extra: { cards: blocked },
          })
        : null;
};
