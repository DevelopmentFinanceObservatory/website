'use client';

import { useEffect, useRef, useState } from 'react';

import type { CatalogueCounts } from '@/lib/search/catalogue';
import {
    type DataSource,
    fetchCounts,
    fetchSources,
    type Half,
    needsRead,
    READING,
    settledHalf,
    UNREAD,
} from '@/lib/studio/dataAvailability';

/**
 * The "What data is available?" drawer's open state and its two halves. Each
 * half is read when the drawer opens, unless it is already read or on its
 * way, and kept once read for as long as the landing stays mounted. A failed half is read
 * again on the next open. Reads start from the open itself, so nothing
 * re-reads while the drawer sits open, however the halves change.
 */
export const useDataAvailability = () => {
    const [open, setOpen] = useState(false);
    const [counts, setCounts] = useState<Half<CatalogueCounts>>(UNREAD);
    const [sources, setSources] = useState<Half<DataSource[]>>(UNREAD);
    // Aborts the reads in flight when the landing unmounts.
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(
        () => () => {
            controllerRef.current?.abort();
            controllerRef.current = null;
        },
        [],
    );

    const read = <T>(
        half: Half<T>,
        setHalf: (half: Half<T>) => void,
        fetchHalf: (signal: AbortSignal) => Promise<T | null>,
    ) => {
        if (!needsRead(half)) {
            return;
        }

        controllerRef.current ??= new AbortController();
        const { signal } = controllerRef.current;

        setHalf(READING);
        void fetchHalf(signal).then((value) => {
            if (!signal.aborted) {
                setHalf(settledHalf(value));
            }
        });
    };

    const onOpenChange = (next: boolean) => {
        setOpen(next);

        if (next) {
            read(counts, setCounts, fetchCounts);
            read(sources, setSources, fetchSources);
        }
    };

    return { open, onOpenChange, counts, sources };
};
