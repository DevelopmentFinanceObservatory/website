'use client';

import { useEffect, useState } from 'react';

import liveRefs from '../_data/live-refs.json';
import type { CountsData } from '../_data/types.ts';
import { countsFromRows, READ_KEYS, type ReadKey } from '../_lib/derive.ts';

import { readLive, type LiveSource, type ReadTier } from '#lib/liveRead.ts';

export type Counts = { data: CountsData; tier: ReadTier };

const sources = Object.fromEntries(
    READ_KEYS.map((key) => [key, { ref: liveRefs.data[key] }]),
) as Record<ReadKey, LiveSource>;

/**
 * The page's figures: `committed`, from counts.json, on the server render and the first client
 * render, then the figures derived from DFO's newest stored versions of the 19 refs in
 * live-refs.json once they arrive. When the stored reads fail, take too long, or give rows
 * `countsFromRows` refuses, the committed figures stay.
 */
export const useCounts = (committed: CountsData): Counts => {
    const [counts, setCounts] = useState<Counts>({ data: committed, tier: 'committed' });

    useEffect(() => {
        const controller = new AbortController();

        readLive(sources, (rows) => countsFromRows(rows, committed), {
            fallback: { tier: 'committed', value: committed },
            signal: controller.signal,
        })
            .then(({ value, tier }) => setCounts({ data: value, tier }))
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    console.error('ODA counts: the live read failed', error);
                }
            });

        return () => controller.abort();
    }, [committed]);

    return counts;
};
