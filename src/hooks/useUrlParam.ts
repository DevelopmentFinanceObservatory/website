'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

/**
 * A piece of page state that lives in the URL's query string (shareable,
 * survives a reload) without a navigation: read once from the URL on
 * mount, written back with history.replaceState. `parse` turns the raw
 * param (or null) into the value; `serialize` turns the value into the
 * param, or null to drop it (the default state leaves the URL clean).
 */
export const useUrlParam = <T>(
    key: string,
    parse: (raw: string | null) => T,
    serialize: (value: T) => string | null,
): [T, (next: T) => void] => {
    const params = useSearchParams();
    const [value, setValue] = useState<T>(() => parse(params.get(key)));

    const set = useCallback(
        (next: T) => {
            setValue(next);

            const url = new URL(window.location.href);
            const raw = serialize(next);

            if (raw) {
                url.searchParams.set(key, raw);
            } else {
                url.searchParams.delete(key);
            }

            window.history.replaceState(null, '', url);
        },
        [key, serialize],
    );

    return [value, set];
};
