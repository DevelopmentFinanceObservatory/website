'use client';

import { useEffect, useEffectEvent, useState } from 'react';

import liveRefs from '../_data/live-refs.json';
import type { Country, UnaidsFigures } from '../_data/types.ts';
import { readingOf, unaidsByCountry } from '../_lib/unaids.ts';

import { readLive, type ReadTier } from '#lib/liveRead.ts';

export type UnaidsState =
    | { status: 'loading' }
    | { status: 'error'; error: Error }
    | { status: 'ready'; figures: Record<string, UnaidsFigures>; tier: ReadTier };

type Reading = { figures: Record<string, UnaidsFigures>; tier: ReadTier };

const readings = new Map<string, Promise<Reading>>();

/** The figures for `iso3s` over `years`, read once per page load for each pair and shared by
 *  every caller. The three reads are all stored versions or all pinned ones. DFO refreshes each
 *  series on its own, so for a while after a UNAIDS release a row can join a new release of one
 *  series with the old release of another. A failed read is forgotten, so the next caller tries
 *  again. */
const readFigures = (codes: readonly string[], years: readonly number[]): Promise<Reading> => {
    const { iso3s, key } = readingOf(codes, years);
    let reading = readings.get(key);

    if (reading === undefined) {
        const { plhiv, art, deaths } = liveRefs.data;

        reading = readLive(
            { plhiv: { ref: plhiv }, art: { ref: art }, deaths: { ref: deaths } },
            (rows) => unaidsByCountry(iso3s, rows, years),
            { fallback: { tier: 'pinned' } },
        ).then(({ value, tier }) => ({ figures: value, tier }));
        readings.set(key, reading);
        reading.catch((error: unknown) => {
            console.error('The UNAIDS reads failed', error);
            readings.delete(key);
        });
    }

    return reading;
};

/**
 * Reads the UNAIDS refs in the browser and derives each country's figures. The server
 * render and the first client render show `loading`; nothing rendered on the server derives
 * from these figures. The read runs again only when the set of countries or the years change,
 * so new arrays holding the same countries, as a live aid read gives, do not rerun it.
 */
export const useUnaids = (
    countries: readonly Pick<Country, 'iso3'>[],
    years: readonly number[],
): UnaidsState => {
    const [state, setState] = useState<UnaidsState>({ status: 'loading' });
    const iso3s = countries.map(({ iso3 }) => iso3);
    const { key } = readingOf(iso3s, years);
    const read = useEffectEvent(() => readFigures(iso3s, years));

    useEffect(() => {
        let current = true;

        read()
            .then(({ figures, tier }) => {
                if (current) {
                    setState({ status: 'ready', figures, tier });
                }
            })
            .catch((error: unknown) => {
                if (current) {
                    setState({
                        status: 'error',
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            });

        return () => {
            current = false;
        };
    }, [key]);

    return state;
};
