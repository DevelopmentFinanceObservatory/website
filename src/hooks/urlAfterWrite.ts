/**
 * The URL a write of `serialized` under `key` leads to, or null when the
 * param already holds that value. Compared as parsed values, since
 * `URLSearchParams` re-encodes a space as `+` and the hrefs of an unchanged
 * param would differ.
 */
export const urlAfterWrite = (href: string, key: string, serialized: string | null): URL | null => {
    const url = new URL(href);

    if ((url.searchParams.get(key) || null) === (serialized || null)) {
        return null;
    }

    if (serialized) {
        url.searchParams.set(key, serialized);
    } else {
        url.searchParams.delete(key);
    }

    return url;
};
