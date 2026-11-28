// No path-alias or server-only imports, so src/proxy.ts, db/event-export.ts
// and node --test import it directly.

/** The Studio layouts: today's chat column (`classic`) and the prompt box
 *  over the canvas (`prompt`). */
export const STUDIO_VARIANTS = ['classic', 'prompt'] as const;

export type StudioVariant = (typeof STUDIO_VARIANTS)[number];

/** The query parameter that picks a variant: `/studio?studio=prompt`. */
export const VARIANT_PARAM = 'studio';

/** The session cookie that carries the picked variant across Studio pages. */
export const VARIANT_COOKIE = 'studio_variant';

/** The variant a parameter or cookie value names: anything but `prompt` is
 *  `classic`. */
export const variantOf = (value: string | undefined): StudioVariant =>
    value === 'prompt' ? 'prompt' : 'classic';

/** Whether STUDIO_PROMPT_ENABLED (`value`) lets a page show the prompt
 *  variant. On unless set to `false`, `0`, `off` or `no`. */
export const promptEnabled = (value: string | undefined): boolean =>
    !['false', '0', 'off', 'no'].includes(value?.trim().toLowerCase() ?? '');

/** The variant a Studio page draws from its `studio_variant` cookie, or
 *  `classic` whatever the cookie says while the switch is off. */
export const pageVariant = (cookie: string | undefined, enabled: boolean): StudioVariant =>
    enabled ? variantOf(cookie) : 'classic';

/** The `studio_variant` cookie, in the shape Next's `response.cookies.set`
 *  takes. A session cookie (no `maxAge`), scoped to the Studio pages. */
export type VariantCookie = {
    name: typeof VARIANT_COOKIE;
    value: StudioVariant;
    path: '/studio';
    sameSite: 'lax';
    secure: boolean;
};

/** Where a flagged Studio request goes instead, and the cookie it sets
 *  (null leaves the cookie as it is). */
export type VariantRedirect = { location: string; cookie: VariantCookie | null };

// /studio and /studio/<id>, the pages that render the Studio and read the
// cookie. A share always shows the classic layout.
const STUDIO_PAGE = /^\/studio(?:\/[^/]+)?$/;

/**
 * The redirect for a request to `pathname` with query `search` (`?…` or
 * empty), or null when none is due. A Studio page carrying the `studio`
 * parameter answers with the same path and every other parameter, in
 * order, so the address bar and every copied link stay free of it. The
 * value `prompt` or `classic` sets the cookie to it; any other value is
 * dropped and leaves the cookie alone. `secure` marks the cookie Secure.
 */
export const variantRedirect = (
    pathname: string,
    search: string,
    { secure }: { secure: boolean },
): VariantRedirect | null => {
    if (!STUDIO_PAGE.test(pathname)) {
        return null;
    }

    const params = new URLSearchParams(search);

    if (!params.has(VARIANT_PARAM)) {
        return null;
    }

    const named = params.getAll(VARIANT_PARAM).at(-1);

    params.delete(VARIANT_PARAM);

    const rest = params.toString();
    const picked = STUDIO_VARIANTS.find((variant) => variant === named);

    return {
        location: rest ? `${pathname}?${rest}` : pathname,
        cookie: picked
            ? { name: VARIANT_COOKIE, value: picked, path: '/studio', sameSite: 'lax', secure }
            : null,
    };
};
