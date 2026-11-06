'use client';

import { useEffect, useState } from 'react';

import {
    type DataAvailability,
    EMPTY_DATA_AVAILABILITY,
    fetchDataAvailability,
} from '@/lib/studio/dataAvailability';

/**
 * The "What data is available?" overview, read from the site's route the
 * first time `wanted` is true (the drawer opening) and kept for the rest of
 * the visit. `pending` while the read is on its way. A failed read gives
 * the empty overview, so the drawer shows the scope line and the ways on.
 */
export const useDataAvailability = (wanted: boolean) => {
    const [availability, setAvailability] = useState<DataAvailability | null>(null);

    useEffect(() => {
        if (!wanted || availability) {
            return;
        }

        const controller = new AbortController();

        void fetchDataAvailability(controller.signal).then((read) => {
            if (!controller.signal.aborted) {
                setAvailability(read ?? EMPTY_DATA_AVAILABILITY);
            }
        });

        return () => controller.abort();
    }, [wanted, availability]);

    return { availability, pending: wanted && !availability };
};
