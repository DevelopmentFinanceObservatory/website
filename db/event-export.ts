import { createHmac } from 'node:crypto';
import fs from 'node:fs/promises';

import { BigQuery, type TableField } from '@google-cloud/bigquery';
import type { Pool } from 'pg';

import type { GalleryKind } from '../src/components/organisms/Gallery/galleryData.ts';
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
 * through today, and every day from the first event on when the table is
 * empty. A day is read whole before its partition is replaced, so a failed
 * read leaves BigQuery as it was.
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
const SHARE_MODES = every<SearchShareMode>()(['live', 'snapshot']);
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
        intent: ['new', 'follow_up', 'edit'],
        length: 'count',
        guest: 'boolean',
    },
    // `unit` is text built from labels, and `years` an object of two years.
    'studio.card': { kind: CARD_KINDS, turn: 'count', source: 'token', guest: 'boolean' },
    'studio.session_end': { turns: 'count', cards: 'count', pins: 'count', guest: 'boolean' },
    'auth.signin': { provider: 'token' },
    'guest.wall_hit': { prompts: 'count' },
    'feedback.submit': { kind: ['chat', 'widget'] },
    'embed.view': { shareId: 'digest', kind: SHARE_KINDS, host: 'token' },
    'share.create': { shareId: 'digest', kind: SHARE_KINDS, mode: SHARE_MODES },
    'share.open': { shareId: 'digest', kind: SHARE_KINDS, mode: SHARE_MODES, host: 'token' },
    'gallery.open': { slug: 'token', kind: GALLERY_KINDS },
} satisfies Record<EventName, Record<string, PropRule>>;

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

/** The props an event keeps. A name the site does not emit keeps none. */
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
};

export const EXPORT_SCHEMA: TableField[] = [
    { name: 'id', type: 'INT64', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'name', type: 'STRING', mode: 'REQUIRED' },
    { name: 'page', type: 'STRING' },
    { name: 'signed_in', type: 'BOOL', mode: 'REQUIRED' },
    { name: 'visitor_hash', type: 'STRING' },
    { name: 'user_hash', type: 'STRING' },
    { name: 'props', type: 'JSON', mode: 'REQUIRED' },
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
 * id written `:id`, null unless it is a site path.
 */
const exportPage = (page: string | null): string | null => {
    const path = page?.split(/[?#]/, 1)[0];

    return path !== undefined && PAGE_PATH.test(path) ? path.replace(SHARE_PATH, '/$1/:id') : null;
};

export const exportRow = (row: SourceEvent, hmacKey: string): ExportRow => ({
    id: row.id,
    created_at: row.createdAt,
    name: row.name,
    // Feedback sends its page with the query string, which can hold a search.
    page: exportPage(row.page),
    signed_in: row.userId !== null,
    visitor_hash: digest(hmacKey, row.visitorId),
    user_hash: digest(hmacKey, row.userId),
    props: exportProps(row.name, row.props, hmacKey),
});

const DAY_MS = 86_400_000;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The UTC days a run replaces, oldest first: from the day before `latest`
 * (the latest day in BigQuery) through `today`, or from `first` (the first
 * event's day) when BigQuery holds nothing. None when there is no event.
 */
export const exportDays = ({
    latest,
    first,
    today,
}: {
    latest: string | null;
    first: string | null;
    today: string;
}): string[] => {
    const start = latest !== null ? dayOf(Date.parse(latest) - DAY_MS) : first;

    if (start === null) {
        return [];
    }

    const days: string[] = [];

    for (let ms = Date.parse(start); ms <= Date.parse(today); ms += DAY_MS) {
        days.push(dayOf(ms));
    }

    return days;
};

/** The website database the rows come from. */
export type EventSource = {
    /** The UTC day of the first event, null when the table is empty. */
    firstDay(): Promise<string | null>;
    /** One UTC day's events in id order, a page at a time. */
    readDay(day: string): AsyncIterable<SourceEvent[]>;
};

/** The BigQuery table the rows go to. */
export type Warehouse = {
    /** Creates the table when it does not exist. */
    ensureTable(): Promise<void>;
    /** The latest UTC day the table holds, null when it is empty. */
    latestDay(): Promise<string | null>;
    /** The rows the day's partition holds. */
    dayRows(day: string): Promise<number>;
    /** Replaces the day's partition with the rows in `file`, one JSON object a line. */
    replaceDay(day: string, file: string): Promise<void>;
};

const PAGE_SIZE = 5_000;

export const pgEventSource = (pool: Pool, pageSize = PAGE_SIZE): EventSource => ({
    async firstDay() {
        const { rows } = await pool.query<{ day: string | null }>(
            `SELECT to_char(min(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day FROM event`,
        );

        return rows[0]?.day ?? null;
    },
    async *readDay(day) {
        const from = `${day}T00:00:00Z`;
        const to = `${dayOf(Date.parse(day) + DAY_MS)}T00:00:00Z`;
        let after = 0;

        for (;;) {
            const { rows } = await pool.query<SourceEvent>(
                `SELECT id::float8 AS id,
                        to_char(created_at AT TIME ZONE 'UTC',
                                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
                        name, user_id AS "userId", visitor_id AS "visitorId", page, props
                 FROM event
                 WHERE created_at >= $1 AND created_at < $2 AND id > $3
                 ORDER BY id
                 LIMIT $4`,
                [from, to, after, pageSize],
            );

            if (rows.length === 0) {
                return;
            }

            yield rows;
            after = rows[rows.length - 1]!.id;
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
        async latestDay() {
            const [rows] = await bigquery.query({
                query: `SELECT FORMAT_DATE('%F', DATE(MAX(created_at))) AS day
                        FROM \`${projectId}.${datasetId}.event\``,
            });

            return (rows[0]?.day as string | null | undefined) ?? null;
        },
        async dayRows(day) {
            // A range on created_at, so the query scans the one partition.
            const [rows] = await bigquery.query({
                query: `SELECT COUNT(*) AS n
                        FROM \`${projectId}.${datasetId}.event\`
                        WHERE created_at >= TIMESTAMP(@day)
                          AND created_at < TIMESTAMP_ADD(TIMESTAMP(@day), INTERVAL 1 DAY)`,
                params: { day },
            });

            return Number(rows[0]?.n ?? 0);
        },
        async replaceDay(day, file) {
            // Resolves once the load job is done, and throws if it failed.
            await dataset.table(`event$${day.replaceAll('-', '')}`).load(file, {
                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                writeDisposition: 'WRITE_TRUNCATE',
                schema: { fields: EXPORT_SCHEMA },
                // A column added to EXPORT_SCHEMA reaches the table on the next load.
                schemaUpdateOptions: ['ALLOW_FIELD_ADDITION'],
            });
        },
    };
};

/**
 * One export run. Each day is written to `scratchFile` page by page, so
 * memory holds one page. The partition is replaced only once the day has
 * been read to its end, and only when the read holds at least as many rows
 * as the partition. Nothing deletes `event` rows, so a shorter read is a
 * fault (a wrong database, an emptied table, a lagging replica). Such a day
 * keeps its partition, the other days still load, and the run then rejects
 * naming each short day with both counts. A day that reads no rows and
 * holds none loads nothing. Logs each day as it is done, names the day in
 * a failure, and returns the rows read per day.
 */
export const runExport = async ({
    source,
    warehouse,
    hmacKey,
    today,
    scratchFile,
    log,
}: {
    source: EventSource;
    warehouse: Warehouse;
    hmacKey: string;
    today: string;
    scratchFile: string;
    log: (line: string) => void;
}): Promise<{ day: string; rows: number }[]> => {
    await warehouse.ensureTable();

    const latest = await warehouse.latestDay();
    const days = exportDays({
        latest,
        first: latest === null ? await source.firstDay() : null,
        today,
    });
    const read: { day: string; rows: number }[] = [];
    const short: string[] = [];
    const shortDays = () => `read fewer rows than BigQuery holds: ${short.join(', ')}`;

    try {
        for (const day of days) {
            let rows = 0;
            let held = 0;

            try {
                await fs.writeFile(scratchFile, '');

                for await (const page of source.readDay(day)) {
                    const lines = page.map((row) => `${JSON.stringify(exportRow(row, hmacKey))}\n`);

                    await fs.appendFile(scratchFile, lines.join(''));
                    rows += page.length;
                }

                held = await warehouse.dayRows(day);

                if (rows > 0 && rows >= held) {
                    await warehouse.replaceDay(day, scratchFile);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const earlier = short.length > 0 ? `; earlier days ${shortDays()}` : '';

                throw new Error(`event export ${day}: ${message}${earlier}`, { cause: error });
            }

            if (rows < held) {
                log(`${day}: ${rows} events read, partition holds ${held}, partition kept`);
                short.push(`${day} read ${rows} of ${held}`);
            } else {
                log(rows > 0 ? `${day}: ${rows} events loaded` : `${day}: no events`);
            }
            read.push({ day, rows });
        }
    } finally {
        await fs.rm(scratchFile, { force: true });
    }

    if (short.length > 0) {
        throw new Error(`event export ${shortDays()}`);
    }

    return read;
};

/** The export's own settings. The database settings are the runtime's (db/connection.ts). */
export const readExportEnv = () => ({
    projectId: requiredEnv('EXPORT_BQ_PROJECT'),
    datasetId: requiredEnv('EXPORT_BQ_DATASET'),
    hmacKey: requiredEnv('EXPORT_ID_HMAC_KEY'),
});
