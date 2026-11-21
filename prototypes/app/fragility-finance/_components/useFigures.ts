'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import type { Figures } from '../_lib/live.ts';

import { readLive, type ReadTier } from '#lib/liveRead.ts';

/**
 * Whether the page reads its DFO figures in the browser. Off, it shows the committed figures
 * and makes no request. The read is 12 analysis recipes. The two pillar filters, over all 62
 * places, take 70 to 90 seconds each on dev, past readLive's limit for one read.
 */
export const READ_LIVE = false;

export type LiveFigures = Figures & {
    /** `loading` until the read settles, while the figures are the committed ones */
    tier: ReadTier | 'loading';
};

/**
 * Runs fetch.py's recipes on DFO's newest stored data and derives the page's figures, each
 * place's tier taken from profiles.json. The refs, live.json and the derivation load with the
 * read, so a page with `READ_LIVE` off carries none of refs.json's 160 kB.
 */
const readFigures = async (committed: Figures, signal: AbortSignal) => {
    const [{ default: refs }, { default: live }, { figuresFromRows, recipes }] = await Promise.all([
        import('../_data/refs.json'),
        import('../_data/live.json'),
        import('../_lib/live.ts'),
    ]);
    const chains = recipes(
        refs.data,
        live.data,
        new Map(committed.contexts.map((context) => [`country/${context.iso3}`, context.tier])),
    );

    return readLive(
        Object.fromEntries(Object.entries(chains).map(([key, chain]) => [key, { recipe: chain }])),
        (rows) => figuresFromRows(rows, committed, live.data),
        { fallback: { tier: 'committed', value: committed }, signal },
    );
};

/**
 * The page's figures: the committed ones on the server render and until the read settles,
 * then, with `READ_LIVE` on, the figures DFO computes on its newest stored data for the
 * recipes fetch.py runs. When a read fails, takes too long, or gives rows `figuresFromRows`
 * refuses, the committed figures stay, with the tier `committed`. The read runs once per mount.
 */
export const useFigures = (committed: Figures): LiveFigures => {
    const [figures, setFigures] = useState<LiveFigures>({
        ...committed,
        tier: READ_LIVE ? 'loading' : 'committed',
    });
    const load = useEffectEvent((signal: AbortSignal) =>
        readFigures(committed, signal).then(
            ({ value, tier }) => {
                if (!signal.aborted) {
                    setFigures({ ...value, tier });
                }
            },
            (error: unknown) => {
                if (!signal.aborted) {
                    console.error('Fragility finance: the live read failed', error);
                    setFigures({ ...committed, tier: 'committed' });
                }
            },
        ),
    );

    useEffect(() => {
        if (!READ_LIVE) {
            return;
        }

        const controller = new AbortController();

        void load(controller.signal);

        return () => controller.abort();
    }, []);

    return figures;
};
