// The parsing half of POST /api/events/data-view, in its own module (no db or
// server-only imports) so src/lib/test/events-data-view.test.ts can run it
// under plain node.

import { requestCaller } from '../proxy/caller.ts';
import { MAX_LIST_IDS, MAX_PROPS_BYTES, NO_ID, PAGE_PATH, TOKEN_PATTERN } from './limits.ts';

/** The most a data.view body may weigh. The route answers 413 past it. */
export const MAX_DATA_VIEW_BODY = MAX_PROPS_BYTES;

/** The longest page path kept, as POST /api/events keeps. */
export const MAX_PAGE = 300;

/** The longest spec id or content version the route reads. A longer string
 *  is refused, where a shorter one failing TOKEN_PATTERN becomes NO_ID. */
export const MAX_ID_LENGTH = 256;

/** The longest `page` the route reads. A longer one is stored as null. */
export const MAX_PAGE_INPUT = 2048;

// Resolves a page path against a host nothing serves, so URL parsing reads
// the path alone.
const PATH_BASE = 'https://page.invalid';

/**
 * Returns the pathname of an http or https URL, or of a string starting
 * with `/`, without its query string, fragment or host, cut to MAX_PAGE
 * characters, and kept only when it matches PAGE_PATH, so no `@` or escaped
 * text reaches the table, the log line or PostHog. Null for
 * anything else, a protocol-relative `//host/path` included, since it names
 * a host, and a page over MAX_PAGE_INPUT characters.
 */
export const pagePath = (page: string | null | undefined): string | null => {
    if (page === undefined || page === null || page.length > MAX_PAGE_INPUT) {
        return null;
    }

    const absolute = /^https?:\/\//i.test(page);

    if (!absolute && (!page.startsWith('/') || page.startsWith('//'))) {
        return null;
    }

    const url = URL.parse(page, PATH_BASE);
    const path = url && /^https?:$/.test(url.protocol) ? url.pathname.slice(0, MAX_PAGE) : null;

    return path !== null && PAGE_PATH.test(path) ? path : null;
};

// The hostname of an http or https URL, when it passes TOKEN_PATTERN.
const hostOf = (value: string | null | undefined): string | null => {
    const url = URL.parse(value ?? '');
    const host = url && /^https?:$/.test(url.protocol) ? url.hostname : '';

    return TOKEN_PATTERN.test(host) ? host : null;
};

/** Where the page got the data it rendered. */
export const DATA_VIEW_VIA = ['pinned_ref', 'saved_file', 'share', 'baked'] as const;

export type DataViewVia = (typeof DATA_VIEW_VIA)[number];

/** The props a data.view event records. `internal_eng` is added by track(). */
export type DataViewProps = {
    specIds: string[];
    contentVersions: string[];
    via: DataViewVia;
    shareId?: string;
    surface: 'page';
    // The hostname of the page that sent the event, absent when unknown.
    host?: string;
    // Whether the request's Origin header is on DFO_CORS_ORIGINS, the list of
    // sites whose pages may read the route's answers. It says which site the
    // browser named, and is no evidence of a render: any non-browser client
    // can send any Origin.
    originAllowed: boolean;
    // The reader's `ip:<32 hex>` digest, as the proxy names the caller to
    // dfo-apis (requestCaller). Set by the server, never read from the body.
    // Null when no client address resolves.
    caller: string | null;
};

/** What parseDataView takes from the body and the Origin header. */
export type DataViewBodyProps = Omit<DataViewProps, 'caller'>;

/**
 * The props to record: the parsed ones plus the reader's caller digest from
 * `incoming`'s headers, null when no client address resolves.
 */
export const withCaller = (props: DataViewBodyProps, incoming: Headers): DataViewProps => ({
    ...props,
    caller: requestCaller(incoming) ?? null,
});

type Refusal = { ok: false; detail: string; pointer: string };

export type DataViewParse = { ok: true; props: DataViewBodyProps; page: string | null } | Refusal;

const refuse = (detail: string, pointer = ''): Refusal => ({ ok: false, detail, pointer });

const isVia = (value: unknown): value is DataViewVia =>
    (DATA_VIEW_VIA as readonly unknown[]).includes(value);

// A list of 1 to MAX_LIST_IDS strings of at most MAX_ID_LENGTH characters.
// An entry the export would refuse becomes NO_ID, so the two lists stay one
// entry per part.
const readIds = (value: unknown, key: string): string[] | Refusal => {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LIST_IDS) {
        return refuse(`${key} needs 1 to ${MAX_LIST_IDS} entries.`, `/${key}`);
    }

    const at = value.findIndex((item) => typeof item !== 'string' || item.length > MAX_ID_LENGTH);

    if (at !== -1) {
        return refuse(
            `Each ${key} entry is a string of at most ${MAX_ID_LENGTH} characters.`,
            `/${key}/${at}`,
        );
    }

    return value.map((item: string) => (TOKEN_PATTERN.test(item) ? item : NO_ID));
};

/**
 * Reads a data.view body of JSON text holding `specIds` and `contentVersions`
 * (1 to MAX_LIST_IDS entries each, the same count), `via`, `shareId` when
 * `via` is `share` and only then, and an optional `page` (null reads as
 * absent). A key outside those is refused. The refusal names the failing
 * field as a JSON pointer, or the whole body (an empty pointer) for a key
 * it does not take. `origin` is the request's Origin header. Its hostname,
 * else the page URL's, becomes `host`, and `originAllowed` says whether it is
 * on `allowed`.
 */
export const parseDataView = (
    text: string,
    { origin, allowed }: { origin: string | null; allowed: readonly string[] },
): DataViewParse => {
    let body: unknown;

    try {
        body = JSON.parse(text);
    } catch {
        return refuse('The body is not JSON.');
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return refuse('The body is a JSON object.');
    }

    const fields = body as Record<string, unknown>;
    const { via } = fields;

    if (!isVia(via)) {
        return refuse(`via is one of ${DATA_VIEW_VIA.join(', ')}.`, '/via');
    }

    const keys = [
        'specIds',
        'contentVersions',
        'via',
        'page',
        ...(via === 'share' ? ['shareId'] : []),
    ];
    const unknown = Object.keys(fields).find((key) => !keys.includes(key));

    if (unknown !== undefined) {
        return refuse(`The body takes no ${unknown} here.`);
    }

    const specIds = readIds(fields.specIds, 'specIds');

    if (!Array.isArray(specIds)) {
        return specIds;
    }

    const contentVersions = readIds(fields.contentVersions, 'contentVersions');

    if (!Array.isArray(contentVersions)) {
        return contentVersions;
    }

    if (contentVersions.length !== specIds.length) {
        return refuse('contentVersions needs one entry per spec id.', '/contentVersions');
    }

    const { shareId, page } = fields;

    let share: { shareId: string } | undefined;

    if (via === 'share') {
        if (typeof shareId !== 'string' || !TOKEN_PATTERN.test(shareId)) {
            return refuse('A share view needs the share id.', '/shareId');
        }

        share = { shareId };
    }

    if (page !== undefined && page !== null && typeof page !== 'string') {
        return refuse('page is a string.', '/page');
    }

    const host = hostOf(origin) ?? hostOf(page);

    return {
        ok: true,
        props: {
            specIds,
            contentVersions,
            via,
            ...share,
            surface: 'page',
            ...(host !== null && { host }),
            originAllowed: origin !== null && allowed.includes(origin),
        },
        page: pagePath(page),
    };
};

/**
 * The browser origins allowed to read the route's answers, from a
 * comma-separated list such as DFO_CORS_ORIGINS. Each entry is normalised to
 * its origin. An entry that is not an http or https origin, `*` included,
 * is dropped.
 */
export const parseCorsOrigins = (value: string | undefined): readonly string[] =>
    (value ?? '').split(',').flatMap((entry) => {
        const url = URL.parse(entry.trim());

        return url && /^https?:$/.test(url.protocol) ? [url.origin] : [];
    });

/**
 * The CORS headers for a request from `origin`. An origin on `allowed` gets
 * the allow set, and any other gets only `Vary: Origin`, so the browser
 * refuses a preflight and withholds the answer. The allow set omits
 * Access-Control-Allow-Credentials, so no page on another origin reads an
 * answer to a request that carried its cookies.
 */
export const corsHeaders = (
    origin: string | null,
    allowed: readonly string[],
): Record<string, string> =>
    origin !== null && allowed.includes(origin)
        ? {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Methods': 'POST',
              'Access-Control-Allow-Headers': 'content-type',
              'Access-Control-Max-Age': '86400',
              'Access-Control-Expose-Headers':
                  'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, x-dfo-trace-id',
              Vary: 'Origin',
          }
        : { Vary: 'Origin' };
