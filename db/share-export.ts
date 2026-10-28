import type { Pool } from 'pg';

import { canvasWidgetsOf } from '../src/lib/chat/canvas.ts';
import type { SavedConversation } from '../src/lib/chat/history.ts';
import type { ShareMode } from '../src/lib/chat/shareMode.ts';
import type { ShareKind } from '../src/lib/chat/sharePrune.ts';

/**
 * The share export (scripts/export-shares.ts): every row of `share` made at
 * or after a moment, as the JSON lines docs/share-export.md defines, which
 * dfo-apis' `import-shares` reads. `placeShare` decides where each stored
 * share lands, and refuses a row it cannot place with the reason.
 * `share_card_result` rows are a cache of live refreshes and are not read.
 */

/** One data card of a share as dfo-apis holds it, in display order. */
export type ExportSlot = {
    component_id: string;
    revision: number;
    frame: { spec_id: string; content_version: string };
};

/** One line of the export. */
export type ExportLine = {
    id: string;
    kind: ShareKind;
    mode: ShareMode;
    owner: string | null;
    created_at: string;
    title: string;
    slots: ExportSlot[];
    payload: Record<string, unknown>;
};

/** One `share_ref` row, under its column names. */
export type StoredPart = {
    part_index: number;
    spec_id: string;
    identity: unknown;
    entity_groups: unknown;
    variable_text: string | null;
    content_version: string | null;
    artifact_digest: string | null;
    operations: unknown;
    assumptions: unknown;
};

/** One `share` row with its `share_ref` rows in part order. `created_at`
 *  is the stored moment in UTC to the microsecond. */
export type StoredShare = {
    id: string;
    kind: string;
    mode: string | null;
    user_id: string | null;
    created_at: string;
    title: string;
    data: unknown;
    parts: StoredPart[];
};

export type Placement = { line: ExportLine } | { refusal: string };

type LineBase = Pick<ExportLine, 'id' | 'owner' | 'created_at' | 'title'>;

type StoredWidget = SavedConversation['widgets'][number];

const COMPONENT_ID = /^cmp_[A-Za-z0-9_-]{1,64}$/;
const FRAME_SPEC_ID = /^(spec|ops)_[A-Za-z0-9_-]+$/;
const SHARE_ID = /^[A-Za-z0-9]{8}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

// The slot of a data card whose `ref` names a component revision in
// dfo-apis' form and whose `frame` names a dataset or derived frame, or
// null when either is absent or malformed.
const slotOf = (widget: StoredWidget): ExportSlot | null => {
    if (widget.kind === 'text') {
        return null;
    }

    const { ref, frame } = widget;

    if (
        !isRecord(ref) ||
        typeof ref.component_id !== 'string' ||
        !COMPONENT_ID.test(ref.component_id) ||
        !Number.isSafeInteger(ref.revision) ||
        ref.revision < 1 ||
        !isRecord(frame) ||
        typeof frame.spec_id !== 'string' ||
        !FRAME_SPEC_ID.test(frame.spec_id) ||
        typeof frame.content_version !== 'string' ||
        frame.content_version === ''
    ) {
        return null;
    }

    return {
        component_id: ref.component_id,
        revision: ref.revision,
        frame: { spec_id: frame.spec_id, content_version: frame.content_version },
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

const isCanvasState = (data: unknown): data is SavedConversation =>
    isRecord(data) &&
    Array.isArray(data.widgets) &&
    Array.isArray(data.pinnedIds) &&
    Array.isArray(data.removedIds);

// A stored copy as a viewer reads it: no owner's harness session and no
// inherited refs (src/lib/chat/sharePrune.ts, shareForViewer).
const viewerCopy = (data: Record<string, unknown>): Record<string, unknown> => ({
    ...data,
    sessionId: null,
    componentRefs: [],
});

const placeSearch = (row: StoredShare, base: LineBase): Placement => {
    if (row.mode !== null && row.mode !== 'live' && row.mode !== 'snapshot') {
        return { refusal: `mode ${JSON.stringify(row.mode)} is not live or snapshot` };
    }

    // A search share with no stored mode is live (searchShareMode).
    const mode: ShareMode = row.mode ?? 'live';
    const unpinned = row.parts.find((part) => part.content_version === null);

    if (mode === 'snapshot' && unpinned) {
        return { refusal: `snapshot part ${unpinned.part_index} has no content_version` };
    }

    const query = isRecord(row.data) && typeof row.data.query === 'string' ? row.data.query : null;

    return {
        line: {
            ...base,
            kind: 'search',
            mode,
            slots: [],
            payload: { query: query ?? row.title, parts: row.parts },
        },
    };
};

const placeStudio = (
    row: StoredShare,
    kind: 'conversation' | 'canvas' | 'card',
    base: LineBase,
): Placement => {
    if (row.parts.length > 0) {
        return { refusal: `a ${kind} share has ${row.parts.length} share_ref rows` };
    }

    if (row.mode !== null && row.mode !== 'live' && row.mode !== 'snapshot') {
        return { refusal: `mode ${JSON.stringify(row.mode)} is not live or snapshot` };
    }

    // A Studio share with no stored mode is a snapshot (isLiveStudioShare).
    const mode: ShareMode = row.mode ?? 'snapshot';

    if (kind === 'conversation') {
        if (mode === 'live') {
            return { refusal: 'a conversation share cannot be live' };
        }

        if (!isRecord(row.data)) {
            return { refusal: 'data is not a saved conversation' };
        }

        return { line: { ...base, kind, mode, slots: [], payload: viewerCopy(row.data) } };
    }

    if (!isCanvasState(row.data)) {
        return { refusal: 'data has no widgets, pinnedIds and removedIds arrays' };
    }

    const saved = row.data;
    const slots: ExportSlot[] = [];
    const slotIndex = new Map<StoredWidget, number>();

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
        } else if (mode === 'live') {
            return {
                refusal: `live card ${widget.id} has no component ref and frame in dfo-apis' form`,
            };
        }
    }

    // A live share shows none of the numbers stored with it, as the live
    // share pages withhold them today (withholdCardData), so a data card
    // the canvas does not show is held too, with no slot.
    const widgets = saved.widgets.map((widget) => {
        const slot = slotIndex.get(widget);
        const held = slot !== undefined || (mode === 'live' && widget.kind !== 'text');

        return held ? heldCard(widget, slot) : widget;
    });

    return { line: { ...base, kind, mode, slots, payload: { ...viewerCopy(saved), widgets } } };
};

/** Where one stored share lands in the export, or why it cannot. */
export const placeShare = (row: StoredShare): Placement => {
    if (!SHARE_ID.test(row.id)) {
        return { refusal: 'the id is not 8 letters and digits' };
    }

    const base: LineBase = {
        id: row.id,
        owner: row.user_id,
        created_at: row.created_at,
        title: row.title,
    };

    switch (row.kind) {
        case 'search':
            return placeSearch(row, base);
        case 'conversation':
        case 'canvas':
        case 'card':
            return placeStudio(row, row.kind, base);
        default:
            return { refusal: `kind ${JSON.stringify(row.kind)} is not a share kind` };
    }
};

/**
 * Every share made at or after `since` (an ISO timestamp with its offset),
 * by `created_at` then id, each with its `share_ref` rows in part order.
 */
export const readShares = async (pool: Pool, since: string): Promise<StoredShare[]> => {
    const shares = await pool.query<Omit<StoredShare, 'parts'>>(
        `SELECT id, kind, mode, user_id, title, data,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
         FROM share
         WHERE created_at >= $1::timestamptz
         ORDER BY share.created_at, id`,
        [since],
    );
    const parts = await pool.query<StoredPart & { share_id: string }>(
        `SELECT r.share_id, r.part_index, r.spec_id, r.identity, r.entity_groups,
                r.variable_text, r.content_version, r.artifact_digest, r.operations,
                r.assumptions
         FROM share_ref r JOIN share s ON s.id = r.share_id
         WHERE s.created_at >= $1::timestamptz
         ORDER BY r.share_id, r.part_index`,
        [since],
    );
    const partsOf = new Map<string, StoredPart[]>();

    for (const { share_id: shareId, ...part } of parts.rows) {
        partsOf.set(shareId, [...(partsOf.get(shareId) ?? []), part]);
    }

    return shares.rows.map((row) => ({ ...row, parts: partsOf.get(row.id) ?? [] }));
};

/** The export of `rows`: one JSON line each, or every refusal by share id. */
export const exportShares = (
    rows: StoredShare[],
): { lines: ExportLine[]; refusals: { id: string; reason: string }[] } => {
    const lines: ExportLine[] = [];
    const refusals: { id: string; reason: string }[] = [];

    for (const row of rows) {
        const placement = placeShare(row);

        if ('line' in placement) {
            lines.push(placement.line);
        } else {
            refusals.push({ id: row.id, reason: placement.refusal });
        }
    }

    return { lines, refusals };
};
