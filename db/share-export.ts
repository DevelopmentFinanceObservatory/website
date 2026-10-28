import type { Pool, PoolClient } from 'pg';

import { asRecord } from '../src/lib/asRecord.ts';
import type { SavedConversation } from '../src/lib/chat/history.ts';
import type { ShareMode } from '../src/lib/chat/shareMode.ts';
import { slotCanvas, viewerCopy, type ShareSlot } from '../src/lib/chat/sharePayload.ts';
import type { ShareKind } from '../src/lib/chat/sharePrune.ts';

/**
 * The share export (scripts/export-shares.ts): every row of `share` made at
 * or after a moment, as the JSON lines docs/share-export.md defines, which
 * dfo-apis' `import-shares` reads. `placeShare` decides where each stored
 * share lands, and refuses a row it cannot place with the reason.
 * `share_card_result` rows are a cache of live refreshes and are not read.
 */

/** One data card of a share as dfo-apis holds it, in display order. */
export type ExportSlot = ShareSlot;

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

const SHARE_ID = /^[A-Za-z0-9]{8}$/;

const isCanvasState = (data: unknown): data is SavedConversation => {
    const state = asRecord(data);

    return (
        Array.isArray(state?.['widgets']) &&
        Array.isArray(state['pinnedIds']) &&
        Array.isArray(state['removedIds'])
    );
};

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

    const stored = asRecord(row.data)?.['query'];
    const query = typeof stored === 'string' ? stored : null;

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

        const data = asRecord(row.data);

        if (!data) {
            return { refusal: 'data is not a saved conversation' };
        }

        return { line: { ...base, kind, mode, slots: [], payload: viewerCopy(data) } };
    }

    if (!isCanvasState(row.data)) {
        return { refusal: 'data has no widgets, pinnedIds and removedIds arrays' };
    }

    const slotted = slotCanvas(row.data, mode);

    if ('unslotted' in slotted) {
        return {
            refusal: `live card ${slotted.unslotted[0]} has no component ref in dfo-apis' form`,
        };
    }

    const { slots, widgets } = slotted;

    return {
        line: { ...base, kind, mode, slots, payload: { ...viewerCopy(row.data), widgets } },
    };
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
 * Both reads run in one repeatable-read transaction, so they see the same
 * snapshot and a share changed between them still exports whole.
 */
export const readShares = async (pool: Pool, since: string): Promise<StoredShare[]> => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

        const rows = await readSharesIn(client, since);

        await client.query('COMMIT');

        return rows;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});

        throw error;
    } finally {
        client.release();
    }
};

const readSharesIn = async (client: PoolClient, since: string): Promise<StoredShare[]> => {
    const shares = await client.query<Omit<StoredShare, 'parts'>>(
        `SELECT id, kind, mode, user_id, title, data,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
         FROM share
         WHERE created_at >= $1::timestamptz
         ORDER BY share.created_at, id`,
        [since],
    );
    const parts = await client.query<StoredPart & { share_id: string }>(
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
