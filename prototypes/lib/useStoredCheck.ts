// The React side of the browser's stored-data check (./storedCheck.ts): a page's figure provider
// starts from the built figures and the build's read time, which the static HTML holds, runs the
// check once after paint, and swaps in the figures read again, with the time of that read, when
// DFO stored newer data. The provider puts the check's state and the read time in
// `StoredCheckContext`, from which the page's island renders `data-stored-check` and the page
// prints when its figures were read.
import type { StoredVersionsJson } from '@developmentfinance/client/types';
import { createContext, use, useEffect, useState } from 'react';

import {
    type Checked,
    refreshIfNewer,
    type RefreshPlan,
    settledState,
    type StoredCheckState,
} from './storedCheck.ts';

/** The check's state and when the figures shown were read; null outside a checked page. */
export const StoredCheckContext = createContext<Omit<Checked<unknown>, 'value'> | null>(null);

/** The check's state of the page around the caller, or null on a page that checks nothing. */
export const useStoredCheckState = (): StoredCheckState | null =>
    use(StoredCheckContext)?.check ?? null;

/**
 * When the figures the page shows were read, as an ISO 8601 time: the build's read, or the read
 * again once the check refreshed them.
 *
 * @throws Outside a checked page's provider.
 */
export const useRetrieved = (): string => {
    const value = use(StoredCheckContext);

    if (value === null) {
        throw new Error('useRetrieved needs a StoredCheckContext above it');
    }

    return value.retrieved;
};

/**
 * The page's figures and when they were read: `built` and `retrieved` until the check after
 * paint finds newer stored data and the read again succeeds, then the figures read again and
 * that read's time. `load` gets the built figures, for what the page derives from them, and must
 * be stable across renders, such as a module-level function.
 */
export const useStoredCheck = <K extends string, T>(
    built: T,
    retrieved: string,
    stored: StoredVersionsJson,
    load: (built: T) => Promise<RefreshPlan<K, T>>,
): Checked<T> => {
    const [state, setState] = useState<Checked<T>>({
        value: built,
        retrieved,
        check: 'checking',
    });

    useEffect(() => {
        const controller = new AbortController();

        void refreshIfNewer({
            stored,
            load: () => load(built),
            signal: controller.signal,
        }).then((result) => {
            if (!controller.signal.aborted) {
                setState(settledState({ value: built, retrieved }, result));
            }
        });

        return () => controller.abort();
    }, [built, retrieved, stored, load]);

    return state;
};
