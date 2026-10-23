const FALLBACK = '/studio';
const PLACEHOLDER_ORIGIN = 'https://dfo.invalid';

// Backslash, which browsers read as a slash, and every C0 control character
// plus DEL. URL parsers strip tab and newline, so `/\t/host` becomes `//host`.
const UNSAFE = /[\\\u0000-\u001f\u007f]/;

/**
 * The on-site path a visitor goes to after sign-in. `next` must start with
 * `/`, hold no backslash and no control character, and still resolve against
 * a placeholder origin to that same origin. Anything else, including a
 * missing or empty value, gives `/studio`.
 */
export const safeNext = (next?: string): string => {
    if (!next?.startsWith('/') || UNSAFE.test(next)) {
        return FALLBACK;
    }

    const url = new URL(next, PLACEHOLDER_ORIGIN);

    return url.origin === PLACEHOLDER_ORIGIN ? url.pathname + url.search + url.hash : FALLBACK;
};
