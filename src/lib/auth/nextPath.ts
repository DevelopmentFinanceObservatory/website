const FALLBACK = '/studio';
const PLACEHOLDER_ORIGIN = 'https://dfo.invalid';

// Backslash, which browsers read as a slash, and every C0 control character
// plus DEL. URL parsers strip tab and newline, so `/\t/host` becomes `//host`.
const UNSAFE = /[\\\u0000-\u001f\u007f]/;

/**
 * A path that starts with `/`, resolved against a placeholder origin, or
 * null when it does not start with `/`, does not parse, or resolves to
 * another origin. Dot segments are resolved, so the caller judges the path a
 * browser would request.
 */
export const resolveOnSite = (path: string | null | undefined): URL | null => {
    if (!path?.startsWith('/')) {
        return null;
    }

    const url = URL.parse(path, PLACEHOLDER_ORIGIN);

    return url?.origin === PLACEHOLDER_ORIGIN ? url : null;
};

/**
 * The on-site path a visitor goes to after sign-in. `next` must hold no
 * backslash and no control character, and resolve on this site
 * (resolveOnSite) to a path that does not begin with `//`. Dot segments can
 * resolve `/a/..//host` to `//host`, which a redirect reads as another host.
 * Anything else, including a missing or empty value, gives `/studio`. A
 * query that repeats `next` arrives as a list, and its first value is read.
 */
export const safeNext = (next?: string | readonly string[]): string => {
    const first = typeof next === 'string' ? next : next?.[0];
    const url = first === undefined || UNSAFE.test(first) ? null : resolveOnSite(first);

    if (url === null || url.pathname.startsWith('//')) {
        return FALLBACK;
    }

    return url.pathname + url.search + url.hash;
};
