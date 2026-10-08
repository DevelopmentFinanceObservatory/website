import type { Pool } from 'pg';

import type { CardRef, FrameRef } from '../src/lib/chat/widgets';
import type { StoredCard } from '../src/lib/studio/cardRefMatch.ts';

/**
 * The database side of the card reference backfill
 * (scripts/backfill-card-refs.ts): the counts it reports, the stored
 * `widgets` arrays it reads, and the write that gives a matched card its
 * `ref` and `frame`. The matching itself is src/lib/studio/cardRefMatch.ts.
 */

/** The tables whose `data` holds Studio cards under `widgets`. */
export type CardTable = 'conversation' | 'share';

// A `search` share holds no cards, so only the Studio kinds are read.
const ROWS: Record<CardTable, string> = {
    conversation: 'conversation',
    share: `share WHERE kind IN ('conversation', 'canvas', 'card')`,
};

export type CardCounts = {
    // Shares by kind and mode.
    shares: { kind: string; mode: string | null; count: number }[];
    // Per table: data cards with no component reference, and cards drawn
    // from a derived (`ops_`) frame by the week the row was created.
    tables: Record<
        CardTable,
        { rows: number; withoutRef: number; derivedByWeek: { week: string; count: number }[] }
    >;
};

const tableCounts = async (
    pool: Pool,
    table: CardTable,
): Promise<CardCounts['tables'][CardTable]> => {
    const rows = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${ROWS[table]}`,
    );
    const withoutRef = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM (SELECT data FROM ${ROWS[table]}) s, jsonb_array_elements(s.data->'widgets') w
         WHERE w->>'kind' <> 'text' AND NOT (w ? 'ref')`,
    );
    const derived = await pool.query<{ week: string; count: number }>(
        `SELECT to_char(date_trunc('week', s.created_at), 'YYYY-MM-DD') AS week, count(*)::int AS count
         FROM (SELECT data, created_at FROM ${ROWS[table]}) s,
              jsonb_array_elements(s.data->'widgets') w
         WHERE w->'frame'->>'spec_id' LIKE 'ops\\_%'
         GROUP BY 1 ORDER BY 1`,
    );

    return {
        rows: rows.rows[0]?.count ?? 0,
        withoutRef: withoutRef.rows[0]?.count ?? 0,
        derivedByWeek: derived.rows,
    };
};

/** The counts that size the backfill, over `share` and `conversation`. */
export const readCardCounts = async (pool: Pool): Promise<CardCounts> => {
    const shares = await pool.query<CardCounts['shares'][number]>(
        'SELECT kind, mode, count(*)::int AS count FROM share GROUP BY 1, 2 ORDER BY 1, 2',
    );

    return {
        shares: shares.rows,
        tables: {
            share: await tableCounts(pool, 'share'),
            conversation: await tableCounts(pool, 'conversation'),
        },
    };
};

/** The ids of a table's rows that hold cards, in id order. */
export const readCardRowIds = async (pool: Pool, table: CardTable): Promise<string[]> => {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM ${ROWS[table]} ORDER BY id`);

    return rows.map((row) => row.id);
};

/** One row's stored `widgets`, or undefined when the row is gone. */
export const readWidgets = async (pool: Pool, table: CardTable, id: string): Promise<unknown> => {
    const { rows } = await pool.query<{ widgets: unknown }>(
        `SELECT data->'widgets' AS widgets FROM ${table} WHERE id = $1`,
        [id],
    );

    return rows[0]?.widgets;
};

/** A matched card of one row: where it sits in `widgets`, the card as it
 *  was read, and what the match gives it. */
export type CardPatch = { index: number; card: StoredCard; ref: CardRef; frame: FrameRef };

/**
 * Gives each patched card of one row its `ref` and `frame`, in one
 * transaction, and resolves how many cards it wrote.
 *
 * A card is written only while the stored card at its index still equals
 * the card the match read. That card had no `ref`, so a card that has one
 * is never written, a second run writes nothing, and a row saved again
 * since the read keeps the cards it changed. No other member of `data` and
 * no other column is written.
 */
export const writeCardRefs = async (
    pool: Pool,
    table: CardTable,
    id: string,
    patches: CardPatch[],
): Promise<number> => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        let written = 0;

        for (const { index, card, ref, frame } of patches) {
            const result = await client.query(
                `UPDATE ${table}
                 SET data = jsonb_set(data, ARRAY['widgets', ($2::int)::text],
                                      (data->'widgets'->$2::int) || $3::jsonb)
                 WHERE id = $1 AND data->'widgets'->$2::int = $4::jsonb`,
                [id, index, JSON.stringify({ ref, frame }), JSON.stringify(card)],
            );

            written += result.rowCount ?? 0;
        }

        await client.query('COMMIT');

        return written;
    } catch (error) {
        await client.query('ROLLBACK');

        throw error;
    } finally {
        client.release();
    }
};
