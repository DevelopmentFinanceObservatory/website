'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import liveRefs from '../_data/live-refs.json';
import type { CountsData } from '../_data/types.ts';
import { countsFromRows, READ_KEYS } from '../_lib/derive.ts';

import { readLive, type ReadTier } from '#lib/liveRead.ts';
import { recordOf } from '#lib/record.ts';

export type Counts = {
    data: CountsData;
    /** `loading` until the read settles, while `data` holds the committed figures */
    tier: ReadTier | 'loading';
    /** every dataset is the version its ref pins, so counts.json's provenance describes `data` */
    asCommitted: boolean;
};

const sources = recordOf(READ_KEYS, (key) => ({ ref: liveRefs.data[key] }));

/**
 * The page's figures: counts.json's on the server render and until the read settles, with the
 * tier `loading`, then the figures derived from DFO's newest stored versions of the 19 refs in
 * live-refs.json. When the stored reads fail, take too long, or give rows `countsFromRows`
 * refuses, the committed figures stay, with the tier `committed`. The read runs once per mount.
 */
export const useCounts = (committed: CountsData): Counts => {
    const [counts, setCounts] = useState<Counts>({
        data: committed,
        tier: 'loading',
        asCommitted: true,
    });
    const load = useEffectEvent((signal: AbortSignal) =>
        readLive(
            sources,
            (rows, datasets) =>
                countsFromRows(rows, {
                    years: committed.years,
                    baseYear: committed.baseYear,
                    members: recordOf(READ_KEYS, (key) => datasets[key].members.length),
                }),
            { fallback: { tier: 'committed', value: committed }, signal },
        ).then(
            ({ value, tier, asCommitted }) => {
                if (!signal.aborted) {
                    setCounts({ data: value, tier, asCommitted });
                }
            },
            (error: unknown) => {
                if (!signal.aborted) {
                    console.error('ODA counts: the live read failed', error);
                    setCounts({ data: committed, tier: 'committed', asCommitted: true });
                }
            },
        ),
    );

    useEffect(() => {
        const controller = new AbortController();

        void load(controller.signal);

        return () => controller.abort();
    }, []);

    return counts;
};
