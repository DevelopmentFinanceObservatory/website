/**
 * The site-visitor token, so the rate limiter can count a reader's page
 * calls per visitor rather than per address (src/lib/proxy/access).
 *
 * The `dfo_v` cookie holds `<id>.<expires>.<tag>`: 16 random bytes as
 * base64url, the expiry in Unix seconds, and an HMAC-SHA-256 of
 * `<id>.<expires>` as base64url. The HMAC key is HMAC-SHA-256 of the label
 * `visitor-token` keyed by CALLER_HMAC_KEY, so the token needs no secret of
 * its own and its tags never match the caller digests made under that key.
 * Rotating CALLER_HMAC_KEY voids every token, and the next page load issues
 * a new one.
 *
 * src/proxy.ts issues the cookie on any GET its matcher runs on (page loads,
 * App Router navigations and prefetches) that carries no valid token, or one
 * past half its life, so a reader who stays on the site keeps one. The token
 * says only that this server issued it to someone who
 * loaded a page: any client can get one, so the per-address backstop is the
 * ceiling.
 *
 * No Next.js imports, so `node --test` and src/instrumentation.ts can load it.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const VISITOR_COOKIE = 'dfo_v';
/** How long a token lasts, in seconds: a day, so a tab left open overnight keeps it. */
export const VISITOR_TOKEN_TTL = 24 * 60 * 60;

const LABEL = 'visitor-token';
const ID_BYTES = 16;
const TAG_BYTES = 32;
const TOKEN = /^([A-Za-z0-9_-]{22})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export type VisitorToken = { id: string; expires: number };

/** The key that signs visitor tokens, derived from CALLER_HMAC_KEY. */
export const visitorKey = (callerKey: string): Buffer =>
    createHmac('sha256', callerKey).update(LABEL).digest();

const tagFor = (key: Buffer, signed: string): Buffer =>
    createHmac('sha256', key).update(signed).digest();

/** A new token for `key`, expiring VISITOR_TOKEN_TTL seconds after `now` (ms). */
export const mintVisitorToken = (key: Buffer, now: number): string => {
    const id = randomBytes(ID_BYTES).toString('base64url');
    const signed = `${id}.${Math.floor(now / 1000) + VISITOR_TOKEN_TTL}`;

    return `${signed}.${tagFor(key, signed).toString('base64url')}`;
};

/**
 * The id and expiry of `token` when `key` signed it and it has not expired at
 * `now` (ms), or null. The tag is compared in constant time.
 */
export const verifyVisitorToken = (
    token: string,
    key: Buffer,
    now: number,
): VisitorToken | null => {
    const match = TOKEN.exec(token);

    if (!match) {
        return null;
    }

    const [, id = '', expiresText = '', tagText = ''] = match;
    const tag = Buffer.from(tagText, 'base64url');
    const expected = tagFor(key, `${id}.${expiresText}`);

    if (tag.length !== TAG_BYTES || !timingSafeEqual(tag, expected)) {
        return null;
    }

    const expires = Number(expiresText);

    return expires * 1000 > now ? { id, expires } : null;
};

/** Every `dfo_v` value in a Cookie header, in the order sent. */
const visitorCookies = (cookieHeader: string | null): string[] =>
    (cookieHeader ?? '').split(';').flatMap((pair) => {
        const at = pair.indexOf('=');

        return at !== -1 && pair.slice(0, at).trim() === VISITOR_COOKIE
            ? [pair.slice(at + 1).trim()]
            : [];
    });

/** The first valid token among the `dfo_v` cookies in `headers`, or null. */
const readToken = (headers: Headers, key: Buffer, now: number): VisitorToken | null => {
    for (const value of visitorCookies(headers.get('cookie'))) {
        const token = verifyVisitorToken(value, key, now);

        if (token) {
            return token;
        }
    }

    return null;
};

// The derived key for the CALLER_HMAC_KEY last seen, so a call derives it
// once per key. Read per call, so a test can change the env.
let derived: { callerKey: string; key: Buffer } | undefined;

const currentKey = (): Buffer | null => {
    const callerKey = process.env.CALLER_HMAC_KEY;

    if (!callerKey) {
        return null;
    }

    if (derived?.callerKey !== callerKey) {
        derived = { callerKey, key: visitorKey(callerKey) };
    }

    return derived.key;
};

/**
 * The visitor id of a valid, unexpired `dfo_v` token in `headers`, or null.
 * Null too when CALLER_HMAC_KEY is unset. It does not read
 * VISITOR_LIMITS_ENABLED; callers check visitorLimitsOn.
 */
export const readVisitor = (headers: Headers, now: number = Date.now()): string | null => {
    const key = currentKey();

    return key ? (readToken(headers, key, now)?.id ?? null) : null;
};

/**
 * VISITOR_LIMITS_ENABLED is the switch: set to `false` (or `0`, `off`, `no`),
 * no anonymous call is counted per visitor and no cookie is issued.
 */
export const visitorLimitsEnabled = (): boolean =>
    !['false', '0', 'off', 'no'].includes(
        process.env.VISITOR_LIMITS_ENABLED?.trim().toLowerCase() ?? '',
    );

/** Whether anonymous calls are counted per visitor: the switch is on and CALLER_HMAC_KEY is set. */
export const visitorLimitsOn = (): boolean => visitorLimitsEnabled() && currentKey() !== null;

const KEY_PROBLEM =
    'CALLER_HMAC_KEY is unset: no visitor cookie is issued, and anonymous calls are counted per address';

/**
 * The start-up rule for src/instrumentation.ts. Without CALLER_HMAC_KEY no
 * token can be signed, so every reader would share an address's allowance:
 * a production server with visitor limits on throws, and refuses to start.
 * With the switch off, or outside production, it starts and warns once
 * through `log`.
 */
export const checkVisitorKey = (
    production: boolean,
    log: (message: string) => void = console.warn,
): void => {
    if (currentKey()) {
        return;
    }

    if (production && visitorLimitsEnabled()) {
        throw new Error(KEY_PROBLEM);
    }

    log(KEY_PROBLEM);
};

/** The attributes of a `dfo_v` cookie, in the shape Next's `response.cookies.set` takes. */
export type VisitorCookie = {
    name: typeof VISITOR_COOKIE;
    value: string;
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    maxAge: number;
};

export type PageRequest = { method: string; headers: Headers; url: string };

/**
 * The `dfo_v` cookie to set on the response to `request`, or null when none
 * is due. One is due on a GET while visitorLimitsOn holds and the request
 * carries no valid token or one with less than half its life left. The proxy
 * sees the GETs its matcher runs on: document loads, and the RSC requests of
 * App Router navigations and prefetches. Next strips the headers that would
 * tell a prefetch apart (`next-router-prefetch` and the other Flight
 * headers), so prefetches renew it too.
 *
 * The cookie is HttpOnly, SameSite=Lax and Path=/, and lasts as long as its
 * token. It is Secure except over plain http to localhost, so `next start`
 * on a laptop keeps it.
 */
export const issueVisitorCookie = (
    request: PageRequest,
    now: number = Date.now(),
): VisitorCookie | null => {
    if (request.method !== 'GET') {
        return null;
    }

    const key = visitorLimitsEnabled() ? currentKey() : null;

    if (!key) {
        return null;
    }

    const held = readToken(request.headers, key, now);

    if (held && held.expires * 1000 - now > (VISITOR_TOKEN_TTL * 1000) / 2) {
        return null;
    }

    const url = new URL(request.url);

    return {
        name: VISITOR_COOKIE,
        value: mintVisitorToken(key, now),
        httpOnly: true,
        secure: url.protocol === 'https:' || !LOCAL_HOSTS.has(url.hostname),
        sameSite: 'lax',
        path: '/',
        maxAge: VISITOR_TOKEN_TTL,
    };
};
