import { asRecord } from '../asRecord.ts';
import { canvasWidgetsOf } from './canvas.ts';
import type { SavedConversation } from './history.ts';
import type { ShareMode, StudioShareKind } from './shareMode.ts';
import { pruneForShare } from './sharePrune.ts';
import type { CardRef, FrameRef } from './widgets.ts';

/**
 * What a Studio share holds in dfo-apis: its slots, the data cards dfo-apis
 * draws, and the website-owned payload that renders the rest. A new share
 * (`studioShareBody`) and the export of a stored one (db/share-export.ts)
 * both place cards through `slotCanvas`, so a newly made share and one
 * imported from the website's table read back alike.
 *
 * A data card with a ref naming a component revision in dfo-apis' form gets
 * a slot. In the payload's `widgets` it is held: it keeps `kind`, `id`,
 * `turn`, and for a chart `chartType` and `horizontal`, and gains `slot`, the
 * 0-based index of its slot (dfo-apis numbers slots from 1). Its numbers,
 * title, source and description come from the slot's component revision.
 *
 * No database, React, or path-alias dependency, so `node --test` imports it.
 */

/** One data card of a share as dfo-apis holds it. `frame` is null when the
 *  stored card names none in dfo-apis' form; dfo-apis reads it from the
 *  component revision. */
export type ShareSlot = CardRef & { frame: FrameRef | null };

type StoredWidget = SavedConversation['widgets'][number];

const COMPONENT_ID = /^cmp_[A-Za-z0-9_-]{1,64}$/;
const FRAME_SPEC_ID = /^(spec|ops)_[A-Za-z0-9_-]+$/;

const frameOf = (value: unknown): FrameRef | null => {
    const frame = asRecord(value);

    return typeof frame?.['spec_id'] === 'string' &&
        FRAME_SPEC_ID.test(frame['spec_id']) &&
        typeof frame['content_version'] === 'string' &&
        frame['content_version'] !== ''
        ? { spec_id: frame['spec_id'], content_version: frame['content_version'] }
        : null;
};

/** The slot of a data card whose `ref` names a component revision in
 *  dfo-apis' form, or null for a text card and a card with no such ref. */
export const slotOf = (widget: StoredWidget): ShareSlot | null => {
    if (widget.kind === 'text') {
        return null;
    }

    const ref = asRecord(widget.ref);

    if (
        !ref ||
        typeof ref.component_id !== 'string' ||
        !COMPONENT_ID.test(ref.component_id) ||
        !Number.isSafeInteger(ref.revision) ||
        (ref.revision as number) < 1
    ) {
        return null;
    }

    return {
        component_id: ref.component_id,
        revision: ref.revision as number,
        frame: frameOf(widget.frame),
    };
};

// A data card in the payload with none of what it showed: where it sits,
// what shape it takes, and the index of the slot that draws it, if any.
const heldCard = (widget: StoredWidget, slot: number | undefined): Record<string, unknown> => ({
    kind: widget.kind,
    id: widget.id,
    turn: widget.turn,
    ...(widget.kind === 'chart'
        ? { chartType: widget.chartType, horizontal: widget.horizontal }
        : {}),
    slot,
});

/** A stored copy as a viewer reads it: no owner's harness session and no
 *  inherited refs (`pruneForShare`). */
export const viewerCopy = <T extends Record<string, unknown>>(data: T): T => ({
    ...data,
    sessionId: null,
    componentRefs: [],
});

export type SlottedCanvas =
    | { slots: ShareSlot[]; widgets: unknown[] }
    // The ids of the shown data cards a live share cannot hold.
    | { unslotted: string[] };

/**
 * The slots of a canvas or card share and its payload widgets. The data
 * cards the canvas shows (`canvasWidgetsOf`) get a slot each, in that order,
 * when they have a ref. Two cards drawing the same revision get one each. A
 * live share needs a slot for every shown data card, and holds every data
 * card, shown or not, because live share pages show none of the numbers
 * stored with the share. A snapshot keeps a card with no ref, and every card
 * it does not show, as stored.
 */
export const slotCanvas = (saved: SavedConversation, mode: ShareMode): SlottedCanvas => {
    const slots: ShareSlot[] = [];
    const slotIndex = new Map<StoredWidget, number>();
    const unslotted: string[] = [];

    // canvasWidgetsOf hands back the stored widget objects, so each slot is
    // tied to its own widget even when two cards draw the same revision.
    for (const widget of canvasWidgetsOf(saved)) {
        if (widget.kind === 'text') {
            continue;
        }

        const slot = slotOf(widget as StoredWidget);

        if (slot) {
            slotIndex.set(widget as StoredWidget, slots.length);
            slots.push(slot);
        } else {
            unslotted.push(widget.id);
        }
    }

    if (mode === 'live' && unslotted.length) {
        return { unslotted };
    }

    const widgets = saved.widgets.map((widget) => {
        const slot = slotIndex.get(widget);
        const held = slot !== undefined || (mode === 'live' && widget.kind !== 'text');

        return held ? heldCard(widget, slot) : widget;
    });

    return { slots, widgets };
};

/**
 * The slot (from 1) of each card a live share of `saved` has a slot for, by
 * card id: the slots `slotCanvas` gives the share, so they match those a
 * share made or imported from the same canvas holds in dfo-apis. Throws when
 * a shown data card has no ref, since such a canvas cannot be live.
 */
export const liveSlotsOf = (saved: SavedConversation): Record<string, number> => {
    const slotted = slotCanvas(saved, 'live');

    if ('unslotted' in slotted) {
        throw new Error(`live card ${slotted.unslotted[0]} has no component ref in dfo-apis' form`);
    }

    return Object.fromEntries(
        slotted.widgets.flatMap((widget) => {
            const { id, slot } = widget as { id: string; slot?: number };

            return slot === undefined ? [] : [[id, slot + 1]];
        }),
    );
};

// The title a live card share gets when its sharer set none. The page title
// and the embed's title come from the share, and a live card's own title is
// withheld from the page with its data, so it stays out of them too.
export const LIVE_CARD_TITLE = 'Live card';

/** The title of a Studio share: a card share's own title, else the
 *  conversation's. `data` is the pruned copy (`pruneForShare`). */
export const studioShareTitle = (
    data: SavedConversation,
    {
        kind,
        mode,
        cardId,
        savedTitle,
    }: { kind: StudioShareKind; mode: ShareMode; cardId?: string; savedTitle: string },
): string => {
    const storedTitle = () =>
        data.widgets
            .map((widget) => (widget.kind === 'key_number' ? widget.label : widget.title))
            .find(Boolean) ?? data.textCards?.[0]?.title;
    const cardTitle =
        cardId && (data.titles?.[cardId] ?? (mode === 'live' ? LIVE_CARD_TITLE : storedTitle()));

    return (kind === 'card' && cardTitle) || savedTitle;
};

/** The create body of `POST /api/presentation/shares` for a Studio share. */
export type StudioShareBody = {
    kind: StudioShareKind;
    latest: boolean;
    title: string;
    cards: CardRef[];
    payload: Record<string, unknown>;
};

/**
 * What `POST /api/share` sends dfo-apis for a Studio share of `kind`, or
 * the ids of the data cards that keep it from being live. A card share
 * whose card has no ref has no slot, which dfo-apis refuses (a card share
 * takes 1 to 24 cards).
 */
export const studioShareBody = ({
    saved,
    kind,
    mode,
    cardId,
}: {
    saved: SavedConversation;
    kind: StudioShareKind;
    mode: ShareMode;
    cardId?: string;
}): StudioShareBody | { unslotted: string[] } => {
    const data = pruneForShare(saved, kind, cardId);
    const title = studioShareTitle(data, { kind, mode, cardId, savedTitle: saved.title });
    const latest = mode === 'live';

    if (kind === 'conversation') {
        return { kind, latest, title, cards: [], payload: viewerCopy(data) };
    }

    const slotted = slotCanvas(data, mode);

    if ('unslotted' in slotted) {
        return slotted;
    }

    return {
        kind,
        latest,
        title,
        cards: slotted.slots.map(({ component_id, revision }) => ({ component_id, revision })),
        payload: { ...viewerCopy(data), widgets: slotted.widgets },
    };
};
