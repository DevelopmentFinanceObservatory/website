import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';

import { BigQuery, type TableField } from '@google-cloud/bigquery';
import type { Pool } from 'pg';

import type { GalleryKind } from '../src/components/organisms/Gallery/galleryData.ts';
import type { CardTarget } from '../src/components/organisms/Studio/hooks/useChat.ts';
import type { ShareMode } from '../src/lib/chat/shareMode.ts';
import type { ShareKind } from '../src/lib/chat/sharePrune.ts';
import type { Widget } from '../src/lib/chat/widgets.ts';
import type { EventName } from '../src/lib/events/track.ts';
import type { DatasetFormat } from '../src/lib/search/searchClient.ts';
import type {
    AbandonReason,
    EditKind,
    SearchOutcome,
    SearchSource,
} from '../src/lib/search/searchEvents.ts';
import type { SearchShareMode } from '../src/lib/search/searchShareRequest.ts';
import type { DeclinedReason, Known, ResolveResponse } from '../src/lib/search/types.ts';

import { requiredEnv } from './connection.ts';

/**
 * The event export (db/export-events.ts): copies the `event` table into the
 * BigQuery table `event`, one day partition per UTC day of `created_at`.
 * Each run replaces every day from the latest day in BigQuery minus one
 * through today, every day from the first event on when the table is
 * empty, every earlier day whose event count differs from its partition's
 * row count, and every day holding a row exported under other rules
 * (exportRules). A day is read whole before its partition is replaced, so
 * a failed read leaves BigQuery as it was.
 *
 * Rows keep no raw ids and no free text. `visitor_id` and `user_id` become
 * HMAC-SHA256 digests under EXPORT_ID_HMAC_KEY, as does the `shareId` prop,
 * since a share id opens its share. `page` keeps a site path only
 * (PAGE_PATH), with the share id in /s/<id> and /embed/<id> written `:id`.
 * `props` keeps only the keys PROP_RULES names for the event, each only
 * when its value passes the key's rule. POST /api/events takes
 * any page and props from the browser, so each value is checked.
 */

/** A value is kept when it passes its key's rule. */
type PropRule =
    // true or false
    | 'boolean'
    // a non-negative integer
    | 'count'
    // one id or code without spaces: a UUID, a share or spec id, a dcid, a
    // problem code, a hostname
    | 'token'
    // a token that leaves as its HMAC-SHA256 digest
    | 'digest'
    // one of these strings
    | readonly string[];

const TOKEN = /^[A-Za-z0-9][\w.:/-]{0,127}$/;

// Every member of the union T, so tsc fails when the site adds a member
// that the list lacks and the export would drop. Known<> keeps the named
// members of an API union that also admits any string.
const every =
    <T extends string>() =>
    <const L extends readonly T[]>(list: L & ([T] extends [L[number]] ? unknown : never)) =>
        list;

const SEARCH_SOURCES = every<SearchSource>()([
    'typed',
    'example',
    'catalogue',
    'refine',
    'retry',
    'permalink',
    'share',
    'version_link',
]);
const EDIT_KINDS = every<EditKind>()([
    'slot',
    'entity',
    'window',
    'facet',
    'pick',
    'measure',
    'parsed',
    'shared',
    'replay',
]);
const OUTCOMES = every<Known<SearchOutcome>>()([
    'definite',
    'candidates',
    'no_data',
    'unsupported',
    'mixed',
    'catalogue',
    'declined',
]);
const ANSWER_KINDS = every<ResolveResponse['kind']>()(['resolution', 'catalogue', 'declined']);
const DECLINED_REASONS = every<Known<DeclinedReason>>()(['out_of_scope', 'requires_analysis']);
const ABANDON_REASONS = every<AbandonReason>()(['hidden', 'superseded', 'reset', 'left']);
const SHARE_KINDS = every<ShareKind>()(['conversation', 'canvas', 'card', 'search']);
// share.create and share.open send Studio's ShareMode, search.action the search's.
const SHARE_MODES = every<SearchShareMode | ShareMode>()(['live', 'snapshot']);
// A prompt with no card target is `new` on the first turn.
const PROMPT_INTENTS = every<'new' | CardTarget['intent']>()(['new', 'follow_up', 'edit']);
const CARD_KINDS = every<Widget['kind']>()(['key_number', 'chart', 'table', 'text']);
const GALLERY_KINDS = every<GalleryKind>()(['conversation', 'canvas', 'card', 'dataset']);
const DATASET_FORMATS = every<DatasetFormat>()(['csv', 'xlsx', 'parquet']);

// The fields every search post's events carry (searchPostTracker in
// src/lib/search/searchEvents.ts).
const RUN: Record<string, PropRule> = {
    searchId: 'token',
    post: 'count',
    source: SEARCH_SOURCES,
    edited: 'boolean',
    editKind: EDIT_KINDS,
    traceId: 'token',
    ms: 'count',
    hidden: 'boolean',
};

// A settled post's fields. `byStep` is left out. It is a map of engine step
// timings that `engineMs` sums up.
const SETTLE: Record<string, PropRule> = {
    outcome: OUTCOMES,
    engineMs: 'count',
    timedOut: 'boolean',
};

// What searchEventProps() says about an answer. `query` and `refused` hold
// the visitor's text, `resolved` holds group labels and nested filters, and
// `operations` is a list.
const ANSWER: Record<string, PropRule> = {
    kind: ANSWER_KINDS,
    reason: DECLINED_REASONS,
    truncated: 'boolean',
};

/** The props each event keeps, from its emit sites (docs/analytics.md). */
export const PROP_RULES = {
    'search.query': { ...RUN, ...SETTLE, ...ANSWER },
    'search.empty': { ...RUN, ...SETTLE, ...ANSWER },
    'search.edit': { ...RUN, ...SETTLE, ...ANSWER },
    // `query` is left out.
    'search.error': { ...RUN, error: 'token', status: 'count' },
    'search.abandon': { ...RUN, reason: ABANDON_REASONS, step: 'token' },
    'search.start_point': { source: SEARCH_SOURCES },
    'search.studio_handoff': { ...ANSWER, searchId: 'token', traceId: 'token', seeds: 'count' },
    'search.action': {
        searchId: 'token',
        traceId: 'token',
        // DataSearch.tsx's SearchAction, which src/ does not export.
        action: ['pick_reading', 'download', 'share'],
        partIndex: 'count',
        specId: 'token',
        format: DATASET_FORMATS,
        bundle: 'boolean',
        mode: SHARE_MODES,
        shareId: 'digest',
    },
    'studio.prompt': {
        turn: 'count',
        intent: PROMPT_INTENTS,
        length: 'count',
        guest: 'boolean',
    },
    // `unit` is text built from labels, and `years` an object of two years.
    'studio.card': { kind: CARD_KINDS, turn: 'count', source: 'token', guest: 'boolean' },
    'studio.session_end': { turns: 'count', cards: 'count', pins: 'count', guest: 'boolean' },
    'auth.signin': { provider: 'token' },
    'guest.wall_hit': { prompts: 'count' },
    // Literals in src/app/api/feedback/route.ts, without a named type.
    'feedback.submit': { kind: ['chat', 'widget'] },
    'embed.view': { shareId: 'digest', kind: SHARE_KINDS, host: 'token' },
    'share.create': { shareId: 'digest', kind: SHARE_KINDS, mode: SHARE_MODES },
    'share.open': { shareId: 'digest', kind: SHARE_KINDS, mode: SHARE_MODES, host: 'token' },
    'gallery.open': { slug: 'token', kind: GALLERY_KINDS },
} satisfies Record<EventName, Record<string, PropRule>>;

// A change to digest, passes, exportProps, exportPage or exportRow bumps
// ROW_SHAPE_VERSION.
const digest = (key: string, id: string | null): string | null =>
    id === null ? null : createHmac('sha256', key).update(id).digest('hex');

const passes = (rule: PropRule, value: unknown): boolean => {
    switch (rule) {
        case 'boolean':
            return typeof value === 'boolean';
        case 'count':
            return Number.isSafeInteger(value) && (value as number) >= 0;
        case 'token':
        case 'digest':
            return typeof value === 'string' && TOKEN.test(value);
        default:
            return typeof value === 'string' && rule.includes(value);
    }
};

/**
 * The props an event keeps. A name the site does not emit keeps none. A
 * change here bumps ROW_SHAPE_VERSION.
 */
export const exportProps = (
    name: string,
    props: Record<string, unknown>,
    hmacKey: string,
): Record<string, unknown> => {
    const rules: Record<string, PropRule> = Object.hasOwn(PROP_RULES, name)
        ? PROP_RULES[name as EventName]
        : {};

    return Object.fromEntries(
        Object.entries(rules)
            .filter(([key, rule]) => Object.hasOwn(props, key) && passes(rule, props[key]))
            .map(([key, rule]) => [
                key,
                rule === 'digest' ? digest(hmacKey, String(props[key])) : props[key],
            ]),
    );
};

/** One `event` row as the export reads it. */
export type SourceEvent = {
    id: number;
    // UTC, microseconds: 2026-10-20T13:04:05.123456Z
    createdAt: string;
    name: string;
    userId: string | null;
    visitorId: string | null;
    page: string | null;
    props: Record<string, unknown>;
};

/** One row of the BigQuery table. */
export type ExportRow = {
    id: number;
    created_at: string;
    name: string;
    page: string | null;
    signed_in: boolean;
    visitor_hash: string | null;
    user_hash: string | null;
    props: Record<string, unknown>;
    export_rules: string;
};

// The columns the table was created with that are REQUIRED. A load's
// ALLOW_FIELD_ADDITION adds NULLABLE columns only, and a load whose schema
// adds a REQUIRED one fails, so a column added later must be NULLABLE and
// tsc refuses a REQUIRED one with another name.
type CreatedRequired = 'id' | 'created_at' | 'name' | 'signed_in' | 'props';

export type ExportField = TableField & ({ name: CreatedRequired } | { mode?: 'NULLABLE' });

export const EXPORT_SCHEMA: ExportField[] = [
    { name: 'id', type: 'INT64', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'page', type: 'STRING' },
    { name: 'signed_in', type: 'BOOL', mode: 'REQUIRED' },
    { name: 'visitor_hash', type: 'STRING' },
    { name: 'user_hash', type: 'STRING' },
    { name: 'props', type: 'JSON', mode: 'REQUIRED' },
    { name: 'export_rules', type: 'STRING' },
];

// A path on the site: a slash, then letters, digits and `_ - . : /`, up to
// the 300 characters POST /api/events keeps. The routes under src/app use
// fixed names plus dcids (/data/sources/<dcid>), doc slugs, gallery slugs,
// UUIDs (/studio/<id>) and share ids (/s/<id>, /embed/<id>), all within
// that set. Spaces, `@`, `,` and `%` escapes are refused, so text a visitor
// typed does not pass.
const PAGE_PATH = /^\/[\w.:/-]{0,299}$/;

// The share pages and everything under them, /s/<id>/download/preparing
// included. The id segment opens the share.
const SHARE_PATH = /^\/(s|embed)\/[^/]+/;

/**
 * The page's path without its query string or fragment and with any share
 * id written `:id`, null unless it is a site path. A change here bumps
 * ROW_SHAPE_VERSION.
 */
// The query-string strip repeats eventLogEntry's in src/lib/events/eventLog.ts,
// which keeps it inline and exports no function for it.
const exportPage = (page: string | null): string | null => {
    const path = page?.split(/[?#]/, 1)[0];

    return path !== undefined && PAGE_PATH.test(path) ? path.replace(SHARE_PATH, '/$1/:id') : null;
};

// The version of the code that shapes a row: digest, passes, exportProps,
// exportPage and exportRow. Bumped by hand with any change to them, so the
// change reaches every day (exportRules).
const ROW_SHAPE_VERSION = 1;

/**
 * The digest every row carries in `export_rules`: SHA-256 over PROP_RULES,
 * TOKEN, PAGE_PATH, SHARE_PATH, EXPORT_SCHEMA, ROW_SHAPE_VERSION and an
 * HMAC of a fixed string under `hmacKey`, so a new key changes it too. A
 * day holding a row with another digest, or none, reloads (exportDays).
 */
export const exportRules = (hmacKey: string): string =>
    createHash('sha256')
        .update(
            JSON.stringify({
                PROP_RULES,
                TOKEN: TOKEN.source,
                PAGE_PATH: PAGE_PATH.source,
                SHARE_PATH: SHARE_PATH.source,
                EXPORT_SCHEMA,
                ROW_SHAPE_VERSION,
                key: createHmac('sha256', hmacKey).update('export_rules').digest('hex'),
            }),
        )
        .digest('hex');

// Every prop key some event keeps, the only keys readDay fetches.
const KEPT_PROPS = [...new Set(Object.values(PROP_RULES).flatMap((rules) => Object.keys(rules)))];

/**
 * The row BigQuery holds for an event, under `rules` from exportRules. A
 * change here bumps ROW_SHAPE_VERSION.
 */
export const exportRow = (row: SourceEvent, hmacKey: string, rules: string): ExportRow => ({
    id: row.id,
    created_at: row.createdAt,
    name: row.name,
    // Feedback sends its page with the query string, which can hold a search.
    page: exportPage(row.page),
    signed_in: row.userId !== null,
    visitor_hash: digest(hmacKey, row.visitorId),
    user_hash: digest(hmacKey, row.userId),
    props: exportProps(row.name, row.props, hmacKey),
    export_rules: rules,
});

const DAY_MS = 86_400_000;

/**
 * How long a run starts new days for, 20 minutes, well inside the Job's
 * 1800 s task timeout, so a run that has many days each waiting out a
 * statement timeout ends and reports before the platform kills it.
 */
export const EXPORT_BUDGET_MS = 20 * 60_000;

/** The most one BigQuery query may bill (`maximumBytesBilled`). */
const MAX_BYTES_BILLED = 1e9;

/** What the staleDays scan bills per event row, from its two columns. */
const STALE_BYTES_PER_ROW = 74;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Rows per UTC day (`YYYY-MM-DD`). A day without rows is absent. */
export type DayCounts = ReadonlyMap<string, number>;

/**
 * The UTC days a run replaces, oldest first. They run from the day before
 * the latest day BigQuery holds through `today`, or from the first event's
 * day when BigQuery holds nothing, and add every day whose `events` count
 * differs from its `partitions` count and every `stale` day. A day that
 * loaded short, or failed to load under new rules, thus stays in every run
 * until it matches, however many later days load. None when there is no
 * event and BigQuery holds nothing.
 */
export const exportDays = ({
    today,
    events,
    partitions,
    stale = new Set(),
}: {
    today: string;
    events: DayCounts;
    partitions: DayCounts;
    stale?: ReadonlySet<string>;
}): string[] => {
    const latest = [...partitions.keys()].sort().at(-1);
    const start =
        latest !== undefined ? dayOf(Date.parse(latest) - DAY_MS) : [...events.keys()].sort()[0];
    const days = new Set<string>(stale);

    if (start !== undefined) {
        for (let ms = Date.parse(start); ms <= Date.parse(today); ms += DAY_MS) {
            days.add(dayOf(ms));
        }
    }

    for (const day of new Set([...events.keys(), ...partitions.keys()])) {
        if ((events.get(day) ?? 0) !== (partitions.get(day) ?? 0)) {
            days.add(day);
        }
    }

    return [...days].sort();
};

/** The website database the rows come from. */
export type EventSource = {
    /** The events per UTC day of `created_at`, over the whole table. */
    dayCounts(): Promise<DayCounts>;
    /** One UTC day's events in `created_at`, then id, order, a page at a time. */
    readDay(day: string): AsyncIterable<SourceEvent[]>;
};

/** The BigQuery table the rows go to. */
export type Warehouse = {
    /** Creates the table when it does not exist. */
    ensureTable(): Promise<void>;
    /** The rows each day's partition holds. */
    dayCounts(): Promise<DayCounts>;
    /** The days holding a row whose `export_rules` is not `rules`, NULL included. */
    staleDays(rules: string): Promise<ReadonlySet<string>>;
    /** Replaces the day's partition with the rows in `file`, one JSON object a line. */
    replaceDay(day: string, file: string): Promise<void>;
};

const PAGE_SIZE = 5_000;

export const pgEventSource = (pool: Pool, pageSize = PAGE_SIZE): EventSource => ({
    async dayCounts() {
        // The UTC date of created_at, the same day readDay's range bounds.
        const { rows } = await pool.query<{ day: string; n: number }>(
            `SELECT to_char(day, 'YYYY-MM-DD') AS day, n
             FROM (SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS n
                   FROM event
                   GROUP BY 1) AS days`,
        );

        return new Map(rows.map(({ day, n }) => [day, n]));
    },
    async *readDay(day) {
        const to = `${dayOf(Date.parse(day) + DAY_MS)}T00:00:00Z`;
        // Keyset paging: each page starts after the last row of the one
        // before, so no page reads the rows before it. Ids start at 1, so
        // (midnight, 0) precedes the day's first row. `props` keeps only the keys some
        // event keeps; exportProps picks each event's own.
        let after = { createdAt: `${day}T00:00:00Z`, id: 0 };

        for (;;) {
            const { rows } = await pool.query<SourceEvent>(
                `SELECT id::float8 AS id,
                        to_char(created_at AT TIME ZONE 'UTC',
                                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
                        name, user_id AS "userId", visitor_id AS "visitorId", page,
                        coalesce((SELECT jsonb_object_agg(key, value)
                                  FROM jsonb_each(props)
                                  WHERE key = ANY($4::text[])), '{}') AS props
                 FROM event
                 WHERE created_at >= $1 AND created_at < $2 AND (created_at, id) > ($1, $3)
                 ORDER BY created_at, id
                 LIMIT $5`,
                [after.createdAt, to, after.id, KEPT_PROPS, pageSize],
            );

            if (rows.length === 0) {
                return;
            }

            yield rows;
            after = rows[rows.length - 1]!;
        }
    },
});

export const bigQueryWarehouse = ({
    projectId,
    datasetId,
    bigquery = new BigQuery({ projectId }),
}: {
    projectId: string;
    datasetId: string;
    bigquery?: BigQuery;
}): Warehouse => {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table('event');

    // A query job fails past 1 GB billed or past 2 minutes, well inside the
    // Job's 1800 s task timeout, and the run fails with it.
    const query = async <T>(sql: string, params?: Record<string, string>): Promise<T[]> => {
        try {
            const [rows] = await bigquery.query({
                query: sql,
                params,
                maximumBytesBilled: String(MAX_BYTES_BILLED),
                jobTimeoutMs: 120_000,
            });

            return rows;
        } catch (error) {
            if (/bytes billed/i.test(messageOf(error))) {
                throw new Error(
                    `a query exceeded the ${MAX_BYTES_BILLED / 1e9} GB maximumBytesBilled cap, ` +
                        `which staleDays reaches at about ${(MAX_BYTES_BILLED / STALE_BYTES_PER_ROW / 1e6).toFixed(1)} million event rows`,
                    { cause: error },
                );
            }

            throw error;
        }
    };

    const dayCounts = async (): Promise<DayCounts> => {
        // Each partition's row count from the table's metadata, which a
        // finished load updates, so the query scans no table data.
        // partition_id is the UTC day as YYYYMMDD, and the pattern leaves
        // out the special partitions such as __NULL__.
        const rows = await query<{ partition_id: string; total_rows: unknown }>(
            `SELECT partition_id, total_rows
             FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.PARTITIONS\`
             WHERE table_name = 'event' AND total_rows > 0
               AND REGEXP_CONTAINS(partition_id, r'^\\d{8}$')`,
        );

        return new Map(
            rows.map((row) => [
                row.partition_id.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
                Number(row.total_rows),
            ]),
        );
    };

    return {
        async ensureTable() {
            const [exists] = await table.exists();

            if (!exists) {
                await dataset.createTable('event', {
                    schema: { fields: EXPORT_SCHEMA },
                    timePartitioning: { type: 'DAY', field: 'created_at' },
                });
            }
        },
        dayCounts,
        async staleDays(rules) {
            const [metadata] = await table.getMetadata();
            const fields: TableField[] = metadata.schema?.fields ?? [];

            // A table created without the column holds no digest, so every
            // day with rows is stale. The next load adds the column.
            if (!fields.some((field) => field.name === 'export_rules')) {
                return new Set((await dayCounts()).keys());
            }

            // Scans the created_at and export_rules columns, about
            // STALE_BYTES_PER_ROW bytes a row.
            const rows = await query<{ day: string }>(
                `SELECT FORMAT_DATE('%F', DATE(created_at)) AS day
                 FROM \`${projectId}.${datasetId}.event\`
                 WHERE export_rules IS DISTINCT FROM @rules
                 GROUP BY day`,
                { rules },
            );

            return new Set(rows.map(({ day }) => day));
        },
        async replaceDay(day, file) {
            // Resolves once the load job is done, and throws if it failed.
            await dataset.table(`event$${day.replaceAll('-', '')}`).load(file, {
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                writeDisposition: 'WRITE_TRUNCATE',
                schema: { fields: EXPORT_SCHEMA },
                // A NULLABLE column added to EXPORT_SCHEMA reaches the table
                // on the next load (ExportField).
                schemaUpdateOptions: ['ALLOW_FIELD_ADDITION'],
            });
        },
    };
};

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * One export run over the days exportDays picks. Each day is written to
 * `scratchFile` page by page before its load, so memory holds one page of
 * rows plus the day's file, since Cloud Run's disk is in memory too. A
 * day's NDJSON runs to about 360 bytes an event. The partition is replaced
 * only once the day has been read to its end, and only when the read holds
 * at least as many rows as the partition. Nothing deletes `event` rows,
 * and they carry no foreign key to `user`, so deleting an account leaves
 * them. A shorter read is therefore a fault (a wrong database, an emptied
 * table, a lagging replica). Such a day keeps its partition, the other
 * days still load, and the run then rejects naming each short day with
 * both counts. Its counts still differ, so the day stays in every later
 * run and fails it until it matches. A read below the day's source count
 * from `source.dayCounts()` is a fault too, whatever the partition holds:
 * the day loads by the rule above, and the run then rejects naming it with
 * both counts. Today's count is taken before its read, so a read above the
 * count is normal. A day that reads no rows and holds none loads nothing.
 * A day whose read or load fails keeps its partition as it was, the later
 * days still load, and the run then rejects naming every such day with its
 * error. Each row carries the run's exportRules digest, so a day that
 * fails under new rules still holds the old digest and is the one day the
 * next run reloads for them. A run starts no new day once `budgetMs` has
 * passed since it began (`now` is its clock); it ends the day in hand, then
 * rejects naming the days it did not reach as well as the failed and short
 * ones, and the next run picks those days up. Logs each day as it is done
 * and returns the rows read per day.
 */
export const runExport = async ({
    source,
    warehouse,
    hmacKey,
    today,
    scratchFile,
    log,
    budgetMs = EXPORT_BUDGET_MS,
    now = Date.now,
}: {
    source: EventSource;
    warehouse: Warehouse;
    hmacKey: string;
    today: string;
    scratchFile: string;
    log: (line: string) => void;
    budgetMs?: number;
    now?: () => number;
}): Promise<{ day: string; rows: number }[]> => {
    const startedAt = now();
    const rules = exportRules(hmacKey);

    await warehouse.ensureTable();

    const [events, partitions, stale] = await Promise.all([
        source.dayCounts(),
        warehouse.dayCounts(),
        warehouse.staleDays(rules),
    ]);
    const days = exportDays({ today, events, partitions, stale });
    const read: { day: string; rows: number }[] = [];
    const failed: { day: string; error: unknown }[] = [];
    const short: string[] = [];
    const unreached: string[] = [];

    try {
        for (const day of days) {
            if (now() - startedAt >= budgetMs) {
                unreached.push(day);
                continue;
            }

            let rows = 0;
            const held = partitions.get(day) ?? 0;
            const counted = events.get(day) ?? 0;

            try {
                await fs.writeFile(scratchFile, '');

                for await (const page of source.readDay(day)) {
                    const lines = page.map(
                        (row) => `${JSON.stringify(exportRow(row, hmacKey, rules))}\n`,
                    );

                    await fs.appendFile(scratchFile, lines.join(''));
                    rows += page.length;
                }

                if (rows > 0 && rows >= held) {
                    await warehouse.replaceDay(day, scratchFile);
                }
            } catch (error) {
                log(`${day}: failed, partition kept: ${messageOf(error)}`);
                failed.push({ day, error });
                continue;
            }

            const belowSource = rows < counted ? `, source counts ${counted}` : '';

            if (rows < held) {
                log(
                    `${day}: ${rows} events read, partition holds ${held}, partition kept${belowSource}`,
                );
                short.push(`${day} read ${rows} of ${held} in BigQuery`);
            } else {
                log(
                    `${rows > 0 ? `${day}: ${rows} events loaded` : `${day}: no events`}${belowSource}`,
                );
            }

            if (rows < counted) {
                short.push(`${day} read ${rows} of source ${counted}`);
            }
            read.push({ day, rows });
        }
    } finally {
        await fs.rm(scratchFile, { force: true });
    }

    const faults = [
        ...failed.map(({ day, error }) => `${day}: ${messageOf(error)}`),
        ...(short.length > 0 ? [`short days: ${short.join(', ')}`] : []),
        ...(unreached.length > 0
            ? [
                  `days not reached in the ${budgetMs / 60_000} minute budget: ${unreached.join(', ')}`,
              ]
            : []),
    ];

    if (faults.length > 0) {
        throw new Error(`event export ${faults.join('; ')}`, {
            cause:
                failed.length > 0
                    ? new AggregateError(failed.map(({ error }) => error))
                    : undefined,
        });
    }

    return read;
};

/**
 * The export Job's run (db/export-events.ts): the account export, then the
 * event export, which runs whether or not the account export failed. Logs
 * an account export failure as it happens and rejects with it once the
 * event export is done, so a failing one leaves the other's tables
 * current. An event export failure rejects as it is.
 */
export const runExportJob = async ({
    exportAccounts,
    exportEvents,
    logError,
}: {
    exportAccounts: () => Promise<void>;
    exportEvents: () => Promise<unknown>;
    logError: (error: unknown) => void;
}): Promise<void> => {
    let accountFailure: Error | null = null;

    try {
        await exportAccounts();
    } catch (error) {
        accountFailure = new Error('account export failed', { cause: error });
        logError(error);
    }

    await exportEvents();

    if (accountFailure !== null) {
        throw accountFailure;
    }
};

/** The export's own settings. The database settings are the runtime's (db/connection.ts). */
export const readExportEnv = () => ({
    projectId: requiredEnv('EXPORT_BQ_PROJECT'),
    datasetId: requiredEnv('EXPORT_BQ_DATASET'),
    hmacKey: requiredEnv('EXPORT_ID_HMAC_KEY'),
});
