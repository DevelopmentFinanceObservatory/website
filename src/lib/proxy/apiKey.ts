/**
 * Where an API key is read from on a call to the platform proxy, kept apart
 * from the route so `node --test` can load it.
 *
 * A key is `Authorization: Bearer dfo_…` or `X-API-Key: dfo_…`. A value in
 * either header that does not start with `dfo_` is not a key, whatever else
 * it is (the harness token on /mcp, another service's key), so the call is
 * handled as an anonymous call. A call that sends two key values that
 * differ is refused, and a key past MAX_KEY_LENGTH is refused unread. The
 * key is never put in a query string.
 */

/** The prefix every key carries (API_KEY_PREFIX in src/lib/auth/apiKeyOptions). */
const KEY_PREFIX = 'dfo_';

/** Keys are 52 characters (src/lib/auth/keyTag); this leaves room and no more. */
export const MAX_KEY_LENGTH = 128;

export const API_KEY_HEADER = 'x-api-key';

export type KeyRead =
    // No key on the call.
    | { kind: 'none' }
    | { kind: 'key'; key: string }
    // Both headers, with different values.
    | { kind: 'conflict' }
    // A value past MAX_KEY_LENGTH.
    | { kind: 'too-long' };

const BEARER = /^bearer\s+(\S.*)$/i;

/** The `dfo_…` token in an Authorization value, or undefined when it is anything else. */
export const bearerKey = (authorization: string | null): string | undefined => {
    const token = authorization?.trim().match(BEARER)?.[1]?.trim();

    return token?.startsWith(KEY_PREFIX) ? token : undefined;
};

/** An X-API-Key value when it has our prefix, or undefined when it is blank or foreign. */
const aliasKey = (value: string | null): string | undefined => {
    const trimmed = value?.trim();

    return trimmed?.startsWith(KEY_PREFIX) ? trimmed : undefined;
};

/** The key a call carries, if any. */
export const readApiKey = (headers: Headers): KeyRead => {
    const bearer = bearerKey(headers.get('authorization'));
    const alias = aliasKey(headers.get(API_KEY_HEADER));

    if (bearer !== undefined && alias !== undefined && bearer !== alias) {
        return { kind: 'conflict' };
    }

    const key = bearer ?? alias;

    if (key === undefined) {
        return { kind: 'none' };
    }

    return key.length > MAX_KEY_LENGTH ? { kind: 'too-long' } : { kind: 'key', key };
};

/**
 * Whether a header value holds one of our keys anywhere, whatever the scheme
 * (`Token dfo_k_…`, a bare key), so the proxy never passes it on.
 */
export const carriesKey = (value: string): boolean => /(?:^|[^A-Za-z0-9_])dfo_/.test(value);

/** Whether `key` has the shape of one of ours, so a lookup could find it. */
export const hasKeyPrefix = (key: string): boolean => key.startsWith(KEY_PREFIX);
