'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type UrlParamOptions = {
    // How a write enters the history: 'replace' (the default) rewrites the
    // current entry, as suits text typed into a field; 'push' adds one, so
    // a chip picked by hand can be undone with Back.
    history?: 'replace' | 'push';
};

/**
 * A piece of page state that lives in the URL's query string (shareable,
 * survives a reload) without a navigation: read from the URL on mount, and
 * again whenever the router's view of the URL changes, which Back and
 * Forward do. Written back with history. `parse` turns the raw param (or
 * null) into the value; `serialize` turns the value into the param, or
 * null to drop it (the default state leaves the URL clean).
 */
export const useUrlParam = <T>(
    key: string,
    parse: (raw: string | null) => T,
    serialize: (value: T) => string | null,
    { history = 'replace' }: UrlParamOptions = {},
): [T, (next: T) => void] => {
    const params = useSearchParams();
    const raw = params.get(key);
    const [value, setValue] = useState<T>(() => parse(raw));

    // The latest parser, read by the sync below without re-running it on
    // every render: callers pass it inline.
    const parseRef = useRef(parse);

    useEffect(() => {
        parseRef.current = parse;
    }, [parse]);

    // The param as this hook last wrote it. The sync below skips it, so a
    // value whose round trip differs (text the serializer trims away) stays
    // as the reader typed it, and a late router commit of the hook's own
    // write does not flicker the value.
    const written = useRef<{ raw: string | null } | null>(null);

    // Next patches pushState and replaceState and listens to popstate, so
    // `params` follows every change to the URL, this hook's own writes
    // included. Back and Forward land on an entry a write made (or the one
    // the page opened on), and the value follows.
    useEffect(() => {
        if (written.current && written.current.raw === raw) {
            return;
        }

        written.current = null;
        setValue(parseRef.current(raw));
    }, [key, raw]);

    const set = useCallback(
        (next: T) => {
            setValue(next);

            const url = new URL(window.location.href);
            const serialized = serialize(next);

            if (serialized) {
                url.searchParams.set(key, serialized);
            } else {
                url.searchParams.delete(key);
            }

            written.current = { raw: serialized || null };

            // An unchanged URL takes no entry, so Back never lands where it
            // already is.
            if (url.href === window.location.href) {
                return;
            }

            if (history === 'push') {
                window.history.pushState(null, '', url);
            } else {
                window.history.replaceState(null, '', url);
            }
        },
        [key, serialize, history],
    );

    return [value, set];
};
