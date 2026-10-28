import {
    readShare,
    readSlot,
    SharesError,
    type ShareRecord,
    type SharesBackend,
} from '../chat/apisShares.ts';
import type { SavedConversation } from '../chat/history.ts';
import type { StudioShareKind } from '../chat/shareMode.ts';
import type { CardRef, FrameRef, Widget } from '../chat/widgets.ts';
import { dropEncodedLength, pick } from '../proxy/headers.ts';
import { problem, type ProblemStatus } from '../proxy/problem.ts';
import { gateOf } from './gate.ts';
import {
    BackendError,
    bounded,
    livePrincipal,
    readComponent,
    renderedExport,
    renderOnFrame,
    storedExport,
    type LiveBackend,
    type LiveCard,
} from './liveBackend.ts';
import { widgetFromLiveCard, type SharedView } from './liveCards.ts';

/**
 * The cards of a share held in dfo-apis, as the share pages draw them.
 *
 * A share's payload (src/lib/chat/sharePayload.ts) holds each slotted data
 * card with `slot`, the 0-based index of the slot that draws it, and none of
 * what it showed. `sharedViewOfRecord` gives every held card its slot's
 * component revision as `ref`. A snapshot's cards are drawn here on the
 * server from their revisions' public reads, which are the numbers the share
 * was made with. A live share's cards leave the server held, and the browser
 * fills each one (`refreshLiveCards`) from
 * `POST /api/share/[id]/cards/[cardId]/refresh`, whose body is
 * `slotRefreshResponse`.
 *
 * A live card is drawn on the frame its slot serves now: a read of dfo-apis'
 * slot data route, which checks for newer data at most once per 15 minutes
 * and records what it served in the share's history. When that is the
 * frame the card revision stands on, the revision's own public read is the
 * card. When the data moved, the revision is drawn on the served frame
 * through dfo-apis' render route, which only the live-refresh credential
 * (`LIVE_REFRESH_PRINCIPAL`) opens. Without it a moved card answers
 * `live_unavailable`.
 *
 * No database, React, or path-alias dependency, so `node --test` imports it.
 */

type Env = Record<string, string | undefined>;

export type SlotDeps = {
    shares: SharesBackend;
    // dfo-apis' render routes, or null without the live-refresh credential.
    render: LiveBackend | null;
};

/** Whether this deployment can draw a live share's cards on moved data. */
export const liveSharingAvailable = (env: Env = process.env): boolean =>
    livePrincipal(env) !== null;

// The public component reads and exports, which carry no credential.
const publicReads = ({ shares }: SlotDeps): LiveBackend => ({
    apisBase: shares.base,
    aiBase: '',
    principal: '',
    fetch: shares.fetch,
});

// A refresh's whole budget, as the site's old live refresh had it.
const REFRESH_DEADLINE_MS = 75_000;

// One export call: dfo-apis stops a component route at 30 seconds.
const EXPORT_DEADLINE_MS = 35_000;

// How many component reads one snapshot page has in flight at once: the
// dfo-apis default for `PRESENTATION_COMPONENTS_MAX_CONCURRENCY`.
const READ_CONCURRENCY = 4;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const sameFrame = (a: FrameRef | null, b: FrameRef): boolean =>
    a !== null && a.spec_id === b.spec_id && a.content_version === b.content_version;

type PayloadWidget = Record<string, unknown> & { id: string; kind: string };

const widgetsOf = (record: ShareRecord): PayloadWidget[] => {
    const widgets = isRecord(record.payload) ? record.payload['widgets'] : undefined;

    return Array.isArray(widgets)
        ? widgets.filter(
              (widget): widget is PayloadWidget =>
                  isRecord(widget) &&
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

/**
 * A Studio share from dfo-apis as its page passes it to the client. Every
 * held card has its slot's revision as `ref`. A snapshot's held cards are
 * drawn from their revisions; a card whose read fails stays held, and the
 * failure is logged. A live share's cards stay held for the browser.
 */
export const sharedViewOfRecord = async (
    deps: SlotDeps,
    record: ShareRecord,
): Promise<SharedView> => {
    const live = record.mode === 'live';
    const reads = bounded(publicReads(deps), REFRESH_DEADLINE_MS);
    const gate = gateOf(READ_CONCURRENCY);

    const widgets = await Promise.all(
        widgetsOf(record).map(async (widget) => {
            if (!isHeld(record, widget)) {
                return widget as unknown as Widget;
            }

            const slotted = slotCardOf(record, widget);
            const held = heldWidget(widget, slotted?.ref);

            if (live || !slotted) {
                return held;
            }

            try {
                const { card } = await gate(() => readComponent(reads, slotted.ref));

                return widgetFromLiveCard(held, card) ?? held;
            } catch (error) {
                console.error('share: a snapshot card could not be read', {
                    share: record.id,
                    slot: slotted.slot,
                    error: error instanceof BackendError ? error.code : String(error),
                });

                return held;
            }
        }),
    );

    return {
        id: record.id,
        kind: record.kind as StudioShareKind,
        saved: { ...(record.payload as SavedConversation), widgets } as SavedConversation,
        live,
        createdAt: record.createdAt,
    };
};

type Drawn =
    | { status: 'current' | 'redrawn'; card: LiveCard; ref: CardRef; frame: FrameRef }
    | { status: 'error'; code: string; retryable?: true };

const errorOf = (error: unknown): Drawn => {
    if (error instanceof BackendError || error instanceof SharesError) {
        return {
            status: 'error',
            code: error.code,
            ...(error.retryable ? { retryable: true as const } : {}),
        };
    }

    throw error;
};

/** One slot of a live share drawn on the frame it serves now. */
export const drawLiveSlot = async (
    deps: SlotDeps,
    shareId: string,
    slot: number,
): Promise<Drawn> => {
    const signal = AbortSignal.timeout(REFRESH_DEADLINE_MS);

    try {
        const served = await readSlot({ ...deps.shares, signal }, shareId, slot);
        const ref = { component_id: served.componentId, revision: served.revision };
        const stored = await readComponent(bounded(publicReads(deps), REFRESH_DEADLINE_MS), ref);

        if (sameFrame(stored.frame, served.frame)) {
            return { status: 'current', card: stored.card, ref, frame: served.frame };
        }

        if (!deps.render) {
            return { status: 'error', code: 'live_unavailable' };
        }

        const drawn = await renderOnFrame(
            bounded(deps.render, REFRESH_DEADLINE_MS),
            ref,
            served.frame,
        );

        return { status: 'redrawn', card: drawn.card, ref, frame: served.frame };
    } catch (error) {
        return errorOf(error);
    }
};

const NO_STORE = { 'Cache-Control': 'no-store' };

const notFound = (): Response =>
    problem({
        status: 404,
        code: 'not_found',
        detail: 'There is no such live card.',
        retryable: false,
        headers: NO_STORE,
    });

// The slot of a live share's data card, or null: no such share, a share
// that is not live, or no data card with that id drawn by a slot.
const liveSlotOf = async (
    deps: SlotDeps,
    shareId: string,
    cardId: string,
): Promise<number | null> => {
    const record = await readShare(deps.shares, shareId);

    if (!record || record.mode !== 'live') {
        return null;
    }

    const widget = widgetsOf(record).find((entry) => entry.id === cardId);

    return (widget && slotCardOf(record, widget)?.slot) ?? null;
};

/**
 * `POST /api/share/[id]/cards/[cardId]/refresh`. 404 unless the share is
 * live and a slot draws the card. Otherwise 200 with `{status, card}` or
 * `{status: 'error', code, retryable?}`, so one failing card leaves the rest
 * of the page standing. A share id that is not dfo-apis' form answers 404.
 */
export const slotRefreshResponse = async (
    deps: SlotDeps,
    shareId: string,
    cardId: string,
): Promise<Response> => {
    let slot: number | null;

    try {
        slot = await liveSlotOf(deps, shareId, cardId);
    } catch (error) {
        if (error instanceof SharesError && error.status === 404) {
            return notFound();
        }

        return Response.json(errorOf(error), { headers: NO_STORE });
    }

    if (slot === null) {
        return notFound();
    }

    const drawn = await drawLiveSlot(deps, shareId, slot);

    return Response.json(
        drawn.status === 'error' ? drawn : { status: drawn.status, card: drawn.card },
        { headers: NO_STORE },
    );
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
 * `GET /api/share/[id]/cards/[cardId]/data?format=&bundle=`. The rows of a
 * live card on the frame its slot serves now: the stored revision's public
 * export when that is its own frame, else the render export on the served
 * frame. A download that cannot be served answers a problem document under
 * an error status, so a browser does not save it as the file.
 */
export const slotDataResponse = async (
    deps: SlotDeps,
    shareId: string,
    cardId: string,
    query: URLSearchParams,
): Promise<Response> => {
    let slot: number | null;

    try {
        slot = await liveSlotOf(deps, shareId, cardId);
    } catch (error) {
        if (error instanceof SharesError && error.status === 404) {
            return notFound();
        }

        const failed = errorOf(error) as { code: string; retryable?: boolean };

        return noFile(failed);
    }

    if (slot === null) {
        return notFound();
    }

    const drawn = await drawLiveSlot(deps, shareId, slot);

    if (drawn.status === 'error') {
        return noFile(drawn);
    }

    const options = {
        format: query.get('format') ?? undefined,
        bundle: query.get('bundle') ?? undefined,
    };

    try {
        const upstream =
            drawn.status === 'redrawn' && deps.render
                ? await renderedExport(
                      bounded(deps.render, EXPORT_DEADLINE_MS),
                      drawn.ref,
                      drawn.frame,
                      options,
                  )
                : await storedExport(
                      bounded(publicReads(deps), EXPORT_DEADLINE_MS),
                      drawn.ref,
                      options,
                  );
        const headers = new Headers(NO_STORE);

        pick(upstream.headers, EXPORT_HEADERS, headers);
        dropEncodedLength(upstream.headers, headers);

        return new Response(upstream.body, { headers });
    } catch (error) {
        if (!(error instanceof BackendError)) {
            throw error;
        }

        const status = REQUEST_REFUSALS.find((refusal) => refusal === error.status) ?? 502;

        return noFile(error, status);
    }
};
