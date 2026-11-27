import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';

import type { GalleryKind } from '../src/components/organisms/Gallery/galleryData.ts';
import type { PromptIntent } from '../src/lib/studio/promptAllowance.ts';
import type { StudioVariant } from '../src/lib/studio/variant.ts';
import type { PromptSource } from '../src/lib/studio/wire.ts';
import type { ShareMode } from '../src/lib/chat/shareMode.ts';
import type { ShareKind } from '../src/lib/chat/sharePrune.ts';
import type { Widget } from '../src/lib/chat/widgets.ts';
import type { ShareCopied } from '../src/lib/events/shareCopy.ts';
import type { DataViewVia } from '../src/lib/events/dataView.ts';
import type { ShareViewer } from '../src/lib/events/shareView.ts';
import type { StudioDownloadSource } from '../src/lib/events/studioDownload.ts';
import type { EventName } from '../src/lib/events/track.ts';
import { exportDigest } from '../src/lib/proxy/account.ts';
import type { DatasetFormat } from '../src/lib/search/searchClient.ts';
import type {
    AbandonReason,
    EditKind,
    SearchOutcome,
    SearchSource,
} from '../src/lib/search/searchEvents.ts';
import type { SearchShareMode } from '../src/lib/search/searchShareRequest.ts';
import type { DeclinedReason, Known, ResolveResponse } from '../src/lib/search/types.ts';

import {
    CONNECTION_TIMEOUT_MS,
    type ExportBigQuery,
    type ExportDb,
    type FailedLoad,
    type Load,
    LOAD_SLOT_MS,
    MAX_BYTES_BILLED,
    QUERY_GRACE_MS,
    settleLoad,
    type TableField,
    TIMED_OUT,
    within,
} from './bounded.ts';
import { requiredEnv } from './connection.ts';
import {
    MAX_LIST_IDS,
    MEASURE_PATTERN,
    NO_ID,
    PAGE_PATH,
    TOKEN_PATTERN,
} from '../src/lib/events/limits.ts';

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
 * since a share id opens its share. `day_visitor` is copied as it is: it is
 * already a digest under a salt deleted once its day has passed
 * (src/lib/events/dayVisitor.ts). `page` keeps a site path only
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
    // the caller digest `ip:` plus 32 lower-case hex, kept as it is
    | 'caller'
    // a list of up to MAX_LIST_IDS tokens, each a token or NO_ID
    | 'tokens'
    // a list of up to MAX_LIST_IDS measure tokens (MEASURE_PATTERN, which
    // admits `|`), each one or NO_ID
    | 'measures'
    // one of these strings
    | readonly string[];

const TOKEN = TOKEN_PATTERN;
const MEASURE = MEASURE_PATTERN;
const CALLER = /^ip:[0-9a-f]{32}$/;

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
// share.create, share.copy and share.open send Studio's ShareMode, search.action the search's.
const SHARE_MODES = every<SearchShareMode | ShareMode>()(['live', 'snapshot']);
// A prompt with no card target is `new` on the first turn; a chip pick is
// `apply_choice`, a card's Change unit `apply_unit`, and a card page's change
// of years or places `apply_years` or `apply_places`.
const PROMPT_INTENTS = every<PromptIntent>()([
    'new',
    'follow_up',
    'edit',
    'apply_choice',
    'apply_unit',
    'apply_years',
    'apply_places',
]);
// A typed prompt has no `source`.
const PROMPT_SOURCES = every<PromptSource>()(['example', 'availability', 'search_example']);
const CARD_KINDS = every<Widget['kind']>()(['key_number', 'chart', 'table', 'text']);
const GALLERY_KINDS = every<GalleryKind>()(['conversation', 'canvas', 'card', 'dataset']);
const DATASET_FORMATS = every<DatasetFormat>()(['csv', 'xlsx', 'parquet']);
const DATA_VIEW_VIA = every<DataViewVia>()(['share']);
const SHARE_VIEWERS = every<ShareViewer>()(['owner', 'other', 'signed_out', 'unknown']);
const SHARE_COPIED = every<ShareCopied>()(['link', 'embed_code', 'download_link', 'query_link']);
const DOWNLOAD_SOURCES = every<StudioDownloadSource>()(['card', 'share_dialog']);
// The Studio layout the event came from; absent on rows recorded before the prop.
const STUDIO_VARIANTS = every<StudioVariant>()(['classic', 'prompt']);

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
    // Flat copies of the nested `resolved` list, which is not exported, holding
    // each resolved part's spec id and measure token (measureToken).
    specIds: 'tokens',
    measures: 'measures',
};

// Set by track() on every event, true when the signed-in user's email is on
// INTERNAL_ENG_EMAILS (src/lib/events/internalEng.ts).
const EVERY_EVENT: Record<string, PropRule> = { internal_eng: 'boolean' };

/** The props each event keeps, from its emit sites (docs/analytics.md). */
export const PROP_RULES = {
    'search.query': { ...EVERY_EVENT, ...RUN, ...SETTLE, ...ANSWER },
    'search.empty': { ...EVERY_EVENT, ...RUN, ...SETTLE, ...ANSWER },
    'search.edit': { ...EVERY_EVENT, ...RUN, ...SETTLE, ...ANSWER },
    // `query` is left out.
    'search.error': { ...EVERY_EVENT, ...RUN, error: 'token', status: 'count' },
    'search.abandon': { ...EVERY_EVENT, ...RUN, reason: ABANDON_REASONS, step: 'token' },
    'search.start_point': { ...EVERY_EVENT, source: SEARCH_SOURCES },
    'search.studio_handoff': {
        ...EVERY_EVENT,
        ...ANSWER,
        searchId: 'token',
        traceId: 'token',
        seeds: 'count',
    },
    'search.action': {
        ...EVERY_EVENT,
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
        ...EVERY_EVENT,
        turn: 'count',
        intent: PROMPT_INTENTS,
        length: 'count',
        guest: 'boolean',
        source: PROMPT_SOURCES,
        variant: STUDIO_VARIANTS,
    },
    // `unit` is text built from labels, and `years` an object of two years.
    'studio.card': {
        ...EVERY_EVENT,
        kind: CARD_KINDS,
        turn: 'count',
        source: 'token',
        guest: 'boolean',
        variant: STUDIO_VARIANTS,
    },
    'studio.download': {
        ...EVERY_EVENT,
        format: DATASET_FORMATS,
        bundle: 'boolean',
        kind: CARD_KINDS,
        cardId: 'token',
        shared: 'boolean',
        source: DOWNLOAD_SOURCES,
        variant: STUDIO_VARIANTS,
    },
    'studio.session_end': {
        ...EVERY_EVENT,
        turns: 'count',
        cards: 'count',
        pins: 'count',
        guest: 'boolean',
        variant: STUDIO_VARIANTS,
    },
    'auth.signin': { ...EVERY_EVENT, provider: 'token' },
    'guest.wall_hit': { ...EVERY_EVENT, prompts: 'count', variant: STUDIO_VARIANTS },
    // Literals in src/app/api/feedback/route.ts, without a named type.
    'feedback.submit': { ...EVERY_EVENT, kind: ['chat', 'widget'] },
    'embed.view': {
        ...EVERY_EVENT,
        shareId: 'digest',
        kind: SHARE_KINDS,
        host: 'token',
        viewer: SHARE_VIEWERS,
    },
    'share.create': { ...EVERY_EVENT, shareId: 'digest', kind: SHARE_KINDS, mode: SHARE_MODES },
    'share.copy': {
        ...EVERY_EVENT,
        shareId: 'digest',
        kind: SHARE_KINDS,
        mode: SHARE_MODES,
        copied: SHARE_COPIED,
    },
    'share.open': {
        ...EVERY_EVENT,
        shareId: 'digest',
        kind: SHARE_KINDS,
        mode: SHARE_MODES,
        host: 'token',
        viewer: SHARE_VIEWERS,
    },
    'gallery.open': { ...EVERY_EVENT, slug: 'token', kind: GALLERY_KINDS },
    // An embed the site served (embedDataView in src/lib/events/dataView.ts).
    'data.view': {
        ...EVERY_EVENT,
        specIds: 'tokens',
        contentVersions: 'tokens',
        via: DATA_VIEW_VIA,
        host: 'token',
        caller: 'caller',
    },
    // A page shown (PageView in src/components/atoms/PageView), whose path is `page`.
    'page.view': { ...EVERY_EVENT },
} satisfies Record<EventName, Record<string, PropRule>>;

// A change to digest (or exportDigest), passes, exportProps, exportPage or
// exportRow bumps ROW_SHAPE_VERSION. exportDigest also names a Studio
// account to the harness, so a turn joins the account's events.
const digest = (key: string, id: string | null): string | null =>
    id === null ? null : exportDigest(id, key);

const listOf = (pattern: RegExp, value: unknown): boolean =>
    Array.isArray(value) &&
    value.length <= MAX_LIST_IDS &&
    value.every((item) => item === NO_ID || (typeof item === 'string' && pattern.test(item)));

const passes = (rule: PropRule, value: unknown): boolean => {
    switch (rule) {
        case 'boolean':
            return typeof value === 'boolean';
        case 'count':
            return Number.isSafeInteger(value) && (value as number) >= 0;
        case 'token':
        case 'digest':
            return typeof value === 'string' && TOKEN.test(value);
        case 'caller':
            return typeof value === 'string' && CALLER.test(value);
        case 'tokens':
            return listOf(TOKEN, value);
        case 'measures':
            return listOf(MEASURE, value);
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
    dayVisitor: string | null;
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
    day_visitor: string | null;
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
    { name: 'day_visitor', type: 'STRING' },
];

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
// change reaches every day (exportRules). READ_DAY_SQL, which shapes the
// rows they take, enters the digest as its text and needs no bump. The
// golden rows in db/test/event-export.test.ts pin each version's output.
export const ROW_SHAPE_VERSION = 4;

/**
 * One page of a UTC day's events (pgEventSource's readDay), with
 * `created_at` as UTC text to the microsecond, the id as a JSON number, and
 * `props` cut to the keys in $4. Parameters: the page's lower bound, the
 * next midnight, the id of the last row read, the kept prop keys, the page
 * size.
 */
const READ_DAY_SQL = `SELECT id::float8 AS id,
        to_char(created_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
        name, user_id AS "userId", visitor_id AS "visitorId",
        day_visitor AS "dayVisitor", page,
        coalesce((SELECT jsonb_object_agg(key, value)
                  FROM jsonb_each(props)
                  WHERE key = ANY($4::text[])), '{}') AS props
 FROM event
 WHERE created_at >= $1 AND created_at < $2 AND (created_at, id) > ($1, $3)
 ORDER BY created_at, id
 LIMIT $5`;

/** What shapes a row, the input exportRules digests. */
export const ROW_SHAPE = {
    PROP_RULES,
    TOKEN: TOKEN.source,
    MEASURE: MEASURE.source,
    CALLER: CALLER.source,
    PAGE_PATH: PAGE_PATH.source,
    SHARE_PATH: SHARE_PATH.source,
    EXPORT_SCHEMA,
    READ_DAY_SQL,
    MAX_LIST_IDS,
    NO_ID,
    ROW_SHAPE_VERSION,
};

/**
 * The digest every row carries in `export_rules`: SHA-256 over ROW_SHAPE
 * and an HMAC of a fixed string under `hmacKey`, so a new key changes it
 * too. A day holding a row with another digest, or none, reloads
 * (exportDays).
 */
export const exportRules = (hmacKey: string): string =>
    createHash('sha256')
        .update(
            JSON.stringify({
                ...ROW_SHAPE,
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
    day_visitor: row.dayVisitor,
});

const DAY_MS = 86_400_000;

/**
 * The statement bound of the event export's pool (exportPool): Postgres
 * stops each of its statements at it, and the Job stops waiting for one
 * QUERY_GRACE_MS later. Its longest statement is the day counts, one
 * `GROUP BY` over the whole `event` table. The bound is set wide, with no
 * measurement behind it, since the event export runs beside the account
 * export and no other time depends on it. runExport logs how long the day
 * counts took, so the bound can follow the measured times.
 */
export const EVENT_STATEMENT_MS = 5 * 60_000;

/**
 * The latest time after a day's start that one of its page queries may
 * start (pgEventSource). A page due later fails its day, and a page that
 * starts before then runs to its own bound, so the day's last page can end
 * past it, as DAY_WORST_MS counts. The busiest day so far holds 1,434
 * events, one page of an index range scan on `created_at`, so 90 s leaves
 * room for days a hundred times busier.
 */
const DAY_READ_MS = 90_000;

/**
 * When runAndExit stops a Job run, 28 minutes from its start, two before
 * the Job's 1800 s task timeout, so its report is out before the platform
 * kills it. The days not reached by then wait for the next hourly run.
 */
export const JOB_DEADLINE_MS = 28 * 60_000;

/**
 * The most one day can take once runExport starts it: its pages, 90 s
 * (DAY_READ_MS), plus the last page, which starts before then and may wait
 * 30 s for a connection (CONNECTION_TIMEOUT_MS) and 305 s for its answer
 * (EVENT_STATEMENT_MS and the grace), then its load to a confirmed outcome,
 * 150 s (LOAD_SLOT_MS), 575 s.
 */
export const DAY_WORST_MS =
    DAY_READ_MS + CONNECTION_TIMEOUT_MS + EVENT_STATEMENT_MS + QUERY_GRACE_MS + LOAD_SLOT_MS;

/**
 * How long before the Job's deadline the event export stops starting days,
 * so a day in flight ends with its outcome known and runAndExit's report
 * goes out before the deadline.
 */
export const REPORT_MARGIN_MS = 5_000;

/** What the days query bills per event row, from its two columns. */
const DAYS_BYTES_PER_ROW = 74;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Rows per UTC day (`YYYY-MM-DD`). A day without rows is absent. */
export type DayCounts = ReadonlyMap<string, number>;

/**
 * The UTC days a run replaces. First the window, oldest first: the day
 * before the latest day BigQuery holds through `today`, or the first
 * event's day through `today` when BigQuery holds nothing. Then the
 * backlog, oldest first: every other day whose `events` count differs from
 * its `partitions` count, and every other `stale` day. A day that loaded
 * short, or failed to load under new rules, thus stays in every run until
 * it matches, however many later days load, and a long backlog runs only
 * after yesterday and today. None when there is no event and BigQuery holds
 * nothing.
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
    const window = new Set<string>();

    if (start !== undefined) {
        for (let ms = Date.parse(start); ms <= Date.parse(today); ms += DAY_MS) {
            window.add(dayOf(ms));
        }
    }

    const mismatched = [...new Set([...events.keys(), ...partitions.keys()])].filter(
        (day) => (events.get(day) ?? 0) !== (partitions.get(day) ?? 0),
    );
    const backlog = new Set([...stale, ...mismatched].filter((day) => !window.has(day)));

    return [...window, ...[...backlog].sort()];
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
    /**
     * The rows each day's partition holds, and the days holding a row whose
     * `export_rules` is not `rules`, NULL included.
     */
    days(rules: string): Promise<{ counts: DayCounts; stale: ReadonlySet<string> }>;
    /**
     * Replaces the day's partition with the rows in `file`, one JSON object
     * a line, and resolves with what the load left in it.
     */
    replaceDay(day: string, file: string): Promise<Load>;
};

const PAGE_SIZE = 5_000;

/**
 * The event table over `db`, whose pool bounds each statement
 * (EVENT_STATEMENT_MS). A day's pages run as separate statements: events
 * are only ever added, and each page starts after the last row of the one
 * before, so the pages need no shared snapshot. `readMs` after the day's
 * start is the latest time a page may start, and a page due later fails
 * the read, so a day's read ends within `readMs` and one page's bound.
 */
export const pgEventSource = (
    db: ExportDb,
    { pageSize = PAGE_SIZE, readMs = DAY_READ_MS }: { pageSize?: number; readMs?: number } = {},
): EventSource => ({
    async dayCounts() {
        // The UTC date of created_at, the same day readDay's range bounds.
        const rows = await db.query<{ day: string; n: number }>(
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
        const deadline = Date.now() + readMs;

        for (;;) {
            if (Date.now() > deadline) {
                throw new Error(`read ran past its ${readMs / 1000} s deadline`);
            }

            const rows = await db.query<SourceEvent>(READ_DAY_SQL, [
                after.createdAt,
                to,
                after.id,
                KEPT_PROPS,
                pageSize,
            ]);

            if (rows.length > 0) {
                yield rows;
            }

            // A short page is the day's last.
            if (rows.length < pageSize) {
                return;
            }

            after = rows[rows.length - 1]!;
        }
    },
});

/**
 * The table `event` in the dataset `bigquery` reaches. A query past
 * MAX_BYTES_BILLED fails, and the run fails with it.
 */
export const bigQueryWarehouse = ({ bigquery }: { bigquery: ExportBigQuery }): Warehouse => ({
    async ensureTable() {
        if (!(await bigquery.tableExists('event'))) {
            await bigquery.createTable('event', {
                schema: { fields: EXPORT_SCHEMA },
                timePartitioning: { type: 'DAY', field: 'created_at' },
            });
        }
    },
    async days(rules) {
        const fields = await bigquery.tableFields('event');
        // A table created without the column holds no digest, so every
        // day with rows is stale. The next load adds the column.
        const stale = fields.some((field) => field.name === 'export_rules')
            ? 'LOGICAL_OR(export_rules IS DISTINCT FROM @rules)'
            : 'TRUE';

        try {
            // Counts the rows themselves, one group per partition day, and
            // scans the created_at and export_rules columns, about
            // DAYS_BYTES_PER_ROW bytes a row.
            const rows = await bigquery.query<{ day: string; n: unknown; stale: boolean }>(
                `SELECT FORMAT_DATE('%F', DATE(created_at)) AS day,
                        COUNT(*) AS n,
                        ${stale} AS stale
                 FROM event
                 GROUP BY day`,
                { rules },
            );

            return {
                counts: new Map(rows.map(({ day, n }) => [day, Number(n)])),
                stale: new Set(rows.filter((row) => row.stale).map(({ day }) => day)),
            };
        } catch (error) {
            if (/bytes billed/i.test(messageOf(error))) {
                throw new Error(
                    `a query exceeded the ${MAX_BYTES_BILLED / 1e9} GB maximumBytesBilled cap, ` +
                        `which the days query reaches at about ${(MAX_BYTES_BILLED / DAYS_BYTES_PER_ROW / 1e6).toFixed(1)} million event rows`,
                    { cause: error },
                );
            }

            throw error;
        }
    },
    replaceDay: (day, file) =>
        bigquery.load(`event$${day.replaceAll('-', '')}`, file, {
            sourceFormat: 'NEWLINE_DELIMITED_JSON',
            writeDisposition: 'WRITE_TRUNCATE',
            schema: { fields: EXPORT_SCHEMA },
            // A NULLABLE column added to EXPORT_SCHEMA reaches the
            // table on the next load (ExportField).
            schemaUpdateOptions: ['ALLOW_FIELD_ADDITION'],
        }),
});

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * What a Job run has in flight, which runAndExit names when its deadline
 * fires: each phase's step, `done` once the phase has ended, the loads in
 * flight, the days the event export has yet to start, and the faults so
 * far.
 */
export type JobProgress = {
    /** The event export's step, `done`, or `failed: ` and its error's message. */
    events: string;
    /** The account export's step, `done`, or `failed: ` and its error's message. */
    accounts: string;
    /** The Studio example export's step, `done`, or `failed: ` and its error's message. */
    examples: string;
    /** The error each phase that failed rejected with. */
    failures: Partial<Record<JobPhase, Error>>;
    /** The loads in flight, each by its day or table. */
    loading: Set<string>;
    unstarted: readonly string[];
    /** Each phase's failed and short days or failed tables so far, as the run's report names them. */
    faults: Record<JobPhase, () => readonly string[]>;
};

/** The export Job's three phases. */
export type JobPhase = 'events' | 'accounts' | 'examples';

export const jobProgress = (): JobProgress => ({
    events: 'the start',
    accounts: 'the start',
    examples: 'the start',
    failures: {},
    loading: new Set(),
    unstarted: [],
    faults: { events: () => [], accounts: () => [], examples: () => [] },
});

/** A day a run failed, and what its partition holds after it: `kept` after a failed read. */
export type FailedDay = { day: string; outcome: FailedLoad['outcome'] };

/** A day whose read held fewer rows than its partition or than the source counts for it. */
export type ShortDay = {
    day: string;
    read: number;
    count: number;
    countedIn: 'partition' | 'source';
};

/**
 * What a run with failed, short or left days throws, each failed day's
 * error in `errors`.
 */
export class EventExportError extends AggregateError {
    readonly failedDays: FailedDay[];
    readonly shortDays: ShortDay[];
    readonly daysLeft: string[];

    constructor(
        message: string,
        errors: Error[],
        {
            failedDays,
            shortDays,
            daysLeft,
        }: { failedDays: FailedDay[]; shortDays: ShortDay[]; daysLeft: string[] },
    ) {
        super(errors, message);
        this.name = 'EventExportError';
        this.failedDays = failedDays;
        this.shortDays = shortDays;
        this.daysLeft = daysLeft;
    }
}

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
 * A day whose read fails keeps its partition as it was. A day whose load
 * fails is logged with what its load returned the partition holds, `kept`
 * or `unknown` (Load), and a load that rejects leaves it `unknown`
 * (settleLoad). Either way the later days still load, and the run
 * then rejects naming every such day with its error. Each row carries the
 * run's exportRules digest, so a day that fails under new rules still holds
 * the old digest and is the one day the next run reloads for them. A read
 * past its bound fails its day the same way. A day starts only while
 * DAY_WORST_MS still fits before `stopAt` on `now`'s clock, so the run
 * ends by `stopAt` with no load in flight. The days left then are logged,
 * and the run rejects naming them, as a fault the next run makes up.
 * Each such rejection is an EventExportError listing the failed, short and
 * left days.
 * `progress` names the step and the load in flight, the days not yet
 * started and the faults so far, for runAndExit's deadline. Logs how long
 * the day counts took and each day as it is done, and returns the rows
 * read per day.
 */
export const runExport = async ({
    source,
    warehouse,
    hmacKey,
    today,
    scratchFile,
    log,
    progress = jobProgress(),
    stopAt = Number.POSITIVE_INFINITY,
    now = Date.now,
}: {
    source: EventSource;
    warehouse: Warehouse;
    hmacKey: string;
    today: string;
    scratchFile: string;
    log: (line: string) => void;
    progress?: JobProgress;
    /** When the run must be done by, in `now`'s milliseconds. */
    stopAt?: number;
    now?: () => number;
}): Promise<{ day: string; rows: number }[]> => {
    const rules = exportRules(hmacKey);

    progress.events = 'the event table check and day counts';
    await warehouse.ensureTable();

    // Logged on every run, so EVENT_STATEMENT_MS can follow the measured times.
    const dayCounts = async () => {
        const started = performance.now();

        try {
            return await source.dayCounts();
        } finally {
            log(`day counts took ${Math.round(performance.now() - started)} ms`);
        }
    };
    const [events, { counts: partitions, stale }] = await Promise.all([
        dayCounts(),
        warehouse.days(rules),
    ]);
    const days = exportDays({ today, events, partitions, stale });
    const read: { day: string; rows: number }[] = [];
    const failed: (FailedDay & { error: Error })[] = [];
    const short: ShortDay[] = [];
    let left: string[] = [];
    const faultsSoFar = () => [
        ...failed.map(({ day, error }) => `${day}: ${error.message}`),
        ...(short.length > 0
            ? [
                  `short days: ${short
                      .map(({ day, read, count, countedIn }) =>
                          countedIn === 'partition'
                              ? `${day} read ${read} of ${count} in BigQuery`
                              : `${day} read ${read} of source ${count}`,
                      )
                      .join(', ')}`,
              ]
            : []),
        ...(left.length > 0 ? [`days left for the next run: ${left.join(', ')}`] : []),
    ];
    progress.faults.events = faultsSoFar;

    try {
        for (const [index, day] of days.entries()) {
            if (now() + DAY_WORST_MS > stopAt) {
                left = days.slice(index);
                log(
                    `days left for the next run, as a day's worst case no longer fits before the run's stop: ${left.join(', ')}`,
                );
                break;
            }

            progress.unstarted = days.slice(index + 1);
            let rows = 0;
            let late: Extract<Load, { outcome: 'replaced' }>['late'] = null;
            const held = partitions.get(day) ?? 0;
            const counted = events.get(day) ?? 0;

            try {
                // Emptied, since the day's pages are appended to it.
                await fs.rm(scratchFile, { force: true });
                progress.events = `the read of ${day}`;

                for await (const page of source.readDay(day)) {
                    const lines = page.map(
                        (row) => `${JSON.stringify(exportRow(row, hmacKey, rules))}\n`,
                    );

                    await fs.appendFile(scratchFile, lines.join(''));
                    rows += page.length;
                }
            } catch (error) {
                // No load was sent, so the partition is as it was.
                log(`${day}: failed, partition kept: ${messageOf(error)}`);
                failed.push({
                    day,
                    outcome: 'kept',
                    error: error instanceof Error ? error : new Error(messageOf(error)),
                });
                continue;
            }

            if (rows > 0 && rows >= held) {
                progress.events = `the load of ${day}`;
                progress.loading.add(day);

                let loaded: Load;

                try {
                    loaded = await settleLoad(() => warehouse.replaceDay(day, scratchFile));
                } finally {
                    progress.loading.delete(day);
                }

                if (loaded.outcome !== 'replaced') {
                    log(`${day}: failed, partition ${loaded.outcome}: ${loaded.error.message}`);
                    failed.push({ day, outcome: loaded.outcome, error: loaded.error });
                    continue;
                }

                late = loaded.late;
            }

            const belowSource = rows < counted ? `, source counts ${counted}` : '';

            if (rows < held) {
                log(
                    `${day}: ${rows} events read, partition holds ${held}, partition kept${belowSource}`,
                );
                short.push({ day, read: rows, count: held, countedIn: 'partition' });
            } else {
                log(
                    `${rows > 0 ? `${day}: ${rows} events loaded` : `${day}: no events`}${late ? `, confirmed after the load's ${late}, partition replaced` : ''}${belowSource}`,
                );
            }

            if (rows < counted) {
                short.push({ day, read: rows, count: counted, countedIn: 'source' });
            }
            read.push({ day, rows });
        }
    } finally {
        progress.unstarted = [];
        await fs.rm(scratchFile, { force: true });
    }

    const faults = faultsSoFar();

    if (faults.length > 0) {
        throw new EventExportError(
            faults.join('; '),
            failed.map(({ error }) => error),
            {
                failedDays: failed.map(({ day, outcome }) => ({ day, outcome })),
                shortDays: short,
                daysLeft: left,
            },
        );
    }

    return read;
};

/**
 * The export Job's run (db/export-events.ts): the event export, the
 * account export and the Studio example export at once, the first two on
 * their own pool and scratch file, so none waits on another and a call that
 * stalls in one costs that one alone.
 * Each phase's step in `progress` turns `done` as it succeeds, or `failed: `
 * and its error's message as it rejects, its error kept in
 * `progress.failures`. Rejects once all are done with the one that failed,
 * or with every one that failed in one AggregateError.
 */
export const runExportJob = async ({
    exportAccounts,
    exportEvents,
    exportExamples = async () => undefined,
    progress = jobProgress(),
}: {
    exportAccounts: () => Promise<void>;
    exportEvents: () => Promise<unknown>;
    exportExamples?: () => Promise<void>;
    progress?: JobProgress;
}): Promise<void> => {
    const run = async (phase: JobPhase, work: () => Promise<unknown>) => {
        try {
            await work();
            progress[phase] = 'done';
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(messageOf(error));

            progress[phase] = `failed: ${failure.message}`;
            progress.failures[phase] = failure;
            throw failure;
        }
    };
    const [events, accounts, examples] = await Promise.allSettled([
        run('events', exportEvents),
        run('accounts', exportAccounts),
        run('examples', exportExamples),
    ]);
    // A phase's own error names no phase, so the run's error names it.
    const failures: { error: Error; line: string }[] = [];

    if (accounts.status === 'rejected') {
        const error = new Error(`account export failed: ${messageOf(accounts.reason)}`, {
            cause: accounts.reason,
        });

        failures.push({ error, line: error.message });
    }

    if (events.status === 'rejected') {
        const error =
            events.reason instanceof Error ? events.reason : new Error(messageOf(events.reason));

        failures.push({ error, line: `event export failed: ${error.message}` });
    }

    if (examples.status === 'rejected') {
        const error = new Error(`example export failed: ${messageOf(examples.reason)}`, {
            cause: examples.reason,
        });

        failures.push({ error, line: error.message });
    }

    if (failures.length > 1) {
        throw new AggregateError(
            failures.map(({ error }) => error),
            failures.map(({ line }) => line).join('; '),
        );
    }

    if (failures[0] !== undefined) {
        throw failures[0].error;
    }
};

/**
 * What runAndExit logs for a run that failed or met its deadline: each
 * phase's step then, the loads it stopped, whose outcome is unknown, the
 * days not started, and the faults so far of each phase that has not failed,
 * since a failed phase's error names its own. Its `cause` is what `main`
 * rejected with, or at the deadline the error of the phase that had
 * already failed.
 */
export class ExportJobError extends Error {
    readonly events: string;
    readonly accounts: string;
    readonly examples: string;
    readonly unknown: string[];
    readonly unstarted: string[];
    readonly faults: string[];

    constructor(lead: string, progress: JobProgress, { rejected }: { rejected?: unknown } = {}) {
        const unknown = [...progress.loading];
        const unstarted = [...progress.unstarted];
        const phases: JobPhase[] = ['events', 'accounts', 'examples'];
        const faults = phases
            .filter((phase) => progress.failures[phase] === undefined)
            .flatMap((phase) => progress.faults[phase]());
        const failures = phases.flatMap((phase) => progress.failures[phase] ?? []);
        const cause =
            rejected !== undefined
                ? rejected
                : failures.length > 1
                  ? new AggregateError(failures)
                  : failures[0];

        super(
            [
                lead,
                `event export: ${progress.events}`,
                `account export: ${progress.accounts}`,
                `example export: ${progress.examples}`,
                ...(unknown.length > 0
                    ? [`loads stopped, outcome unknown: ${unknown.join(', ')}`]
                    : []),
                ...(unstarted.length > 0 ? [`days not started: ${unstarted.join(', ')}`] : []),
                // A rejection's own message already names its faults.
                ...(rejected === undefined ? faults : []),
            ].join('; '),
            cause === undefined ? undefined : { cause },
        );
        this.name = 'ExportJobError';
        this.events = progress.events;
        this.accounts = progress.accounts;
        this.examples = progress.examples;
        this.unknown = unknown;
        this.unstarted = unstarted;
        this.faults = faults;
    }
}

/**
 * Runs the Job's `main` with the Job's deadline, `deadlineMs` from now on
 * Date.now's clock, then exits the process with 0, or with 1 after logging
 * one ExportJobError, so a socket left open, such as one of the pools' own
 * connections, cannot hold the Job to its task timeout. A rejection is logged with each phase's step. A `main` still
 * running at the deadline is stopped and logged with each phase's step, the
 * loads in flight, the days not started and the faults so far, after the
 * lines each finished day logged. Cloud Run's stdout and stderr are pipes,
 * which Node writes synchronously on Linux, so every logged line is out
 * before the exit.
 */
export const runAndExit = async (
    main: (progress: JobProgress, deadlineAt: number) => Promise<unknown>,
    {
        deadlineMs = JOB_DEADLINE_MS,
        exit = process.exit,
        logError,
    }: {
        deadlineMs?: number;
        exit?: (code: number) => void;
        logError: (error: unknown) => void;
    },
): Promise<void> => {
    const deadlineAt = Date.now() + deadlineMs;
    const progress = jobProgress();
    let code = 0;

    try {
        if ((await within(main(progress, deadlineAt), deadlineAt - Date.now())) === TIMED_OUT) {
            logError(
                new ExportJobError(
                    `export Job stopped at its deadline, ${deadlineMs / 1000} s from its start`,
                    progress,
                ),
            );
            code = 1;
        }
    } catch (error) {
        // A phase that failed names its error in its own line.
        const lead =
            Object.keys(progress.failures).length > 0
                ? 'export Job failed'
                : `export Job failed: ${messageOf(error)}`;

        logError(new ExportJobError(lead, progress, { rejected: error }));
        code = 1;
    }

    exit(code);
};

/** The export's own settings. The database settings are the runtime's (db/connection.ts). */
export const readExportEnv = () => ({
    projectId: requiredEnv('EXPORT_BQ_PROJECT'),
    datasetId: requiredEnv('EXPORT_BQ_DATASET'),
    // The dataset's location, which every load job runs in and is read back
    // from (loadWithin): a job looked up elsewhere reads as unknown. Unset,
    // exportBigQuery reads it from the dataset.
    location: process.env.EXPORT_BQ_LOCATION || undefined,
    hmacKey: requiredEnv('EXPORT_ID_HMAC_KEY'),
});
