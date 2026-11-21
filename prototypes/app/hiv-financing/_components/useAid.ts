'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import liveRefs from '../_data/live-refs.json';
import names from '../_data/names.json';
import type { HivData } from '../_data/types.ts';
import { aidFromRows, aidSources } from '../_lib/aid.ts';

import { readLive, type ReadTier, type ReadTierAttribute } from '#lib/liveRead.ts';

/**
 * Whether the page reads the aid figures live. Off, it shows hiv.json's figures and makes no
 * request for them. Each stored read runs one of DFO's analysis recipes, so this waits on their
 * timing against DFO; the page's prose outside the island also prints hiv.json's figures.
 */
export const READ_AID_LIVE = false;

export type Aid = {
    data: HivData;
    /** `loading` until the live read settles, while `data` holds the committed figures */
    tier: ReadTier | 'loading';
};

/**
 * The aid figures: hiv.json's on the server render and until the read settles, then, with
 * `READ_AID_LIVE`, the figures DFO's recipes give on the newest stored versions of the aid
 * reads in live-refs.json. When a stored read fails, takes too long, or gives rows `aidFromRows`
 * refuses, the committed figures stay, with the tier `committed`. The read runs once per mount.
 */
export const useAid = (committed: HivData): Aid => {
    const [aid, setAid] = useState<Aid>({
        data: committed,
        tier: READ_AID_LIVE ? 'loading' : 'committed',
    });
    const load = useEffectEvent((signal: AbortSignal) =>
        readLive(
            aidSources(liveRefs.data, [committed.years[0]!, committed.years.at(-1)!]),
            (rows) =>
                aidFromRows(rows, {
                    years: committed.years,
                    priceBase: committed.priceBase,
                    names: names.data,
                }),
            { fallback: { tier: 'committed', value: committed }, signal },
        ).then(
            ({ value, tier }) => {
                if (!signal.aborted) {
                    setAid({ data: value, tier });
                }
            },
            (error: unknown) => {
                if (!signal.aborted) {
                    console.error('HIV aid: the live read failed', error);
                    setAid({ data: committed, tier: 'committed' });
                }
            },
        ),
    );

    useEffect(() => {
        if (!READ_AID_LIVE) {
            return;
        }

        const controller = new AbortController();

        void load(controller.signal);

        return () => controller.abort();
    }, []);

    return aid;
};

const RANK: Record<ReadTier, number> = { committed: 0, pinned: 1, stored: 2 };

/**
 * The island's `data-read-tier`. With `READ_AID_LIVE` off it is the UNAIDS read's. With it on,
 * `failed` when the UNAIDS read failed, `loading` while either read loads, and otherwise the
 * older of the two tiers, so `stored` means every figure came from DFO's newest stored data.
 */
export const islandTier = (aid: Aid['tier'], unaids: ReadTierAttribute): ReadTierAttribute => {
    if (!READ_AID_LIVE || unaids === 'failed' || unaids === 'loading') {
        return unaids;
    }

    if (aid === 'loading') {
        return 'loading';
    }

    return RANK[aid] < RANK[unaids] ? aid : unaids;
};
