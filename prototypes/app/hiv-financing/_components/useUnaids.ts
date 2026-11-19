'use client';

import { useEffect, useState } from 'react';

import liveRefs from '../_data/live-refs.json';
import type { Country, UnaidsFigures } from '../_data/types.ts';
import { unaidsByCountry, type UnaidsRows } from '../_lib/unaids.ts';

import { readPinnedRef } from '#lib/pinnedRef.ts';

export type UnaidsState =
    | { status: 'loading' }
    | { status: 'error'; error: Error }
    | { status: 'ready'; figures: Record<string, UnaidsFigures> };

let reading: Promise<UnaidsRows> | null = null;

/** The rows of the three UNAIDS reads, fetched once per page load and shared by every caller.
 *  A failed read is forgotten, so the next caller tries again. */
const readUnaidsRows = (): Promise<UnaidsRows> => {
    if (reading === null) {
        const { plhiv, art, deaths } = liveRefs.data;

        reading = Promise.all([
            readPinnedRef(plhiv),
            readPinnedRef(art),
            readPinnedRef(deaths),
        ]).then(([people, coverage, died]) => ({
            plhiv: people.rows,
            art: coverage.rows,
            deaths: died.rows,
        }));
        reading.catch((error: unknown) => {
            console.error('The UNAIDS reads failed', error);
            reading = null;
        });
    }

    return reading;
};

/**
 * Reads the pinned UNAIDS refs in the browser and derives each country's figures. The server
 * render and the first client render show `loading`; nothing rendered on the server derives
 * from these figures. `countries` and `years` should keep their identity between renders.
 */
export const useUnaids = (
    countries: readonly Pick<Country, 'iso3'>[],
    years: readonly number[],
): UnaidsState => {
    const [state, setState] = useState<UnaidsState>({ status: 'loading' });

    useEffect(() => {
        let current = true;

        readUnaidsRows()
            .then((rows) => {
                let figures: Record<string, UnaidsFigures>;

                try {
                    figures = unaidsByCountry(
                        countries.map(({ iso3 }) => iso3),
                        rows,
                        years,
                    );
                } catch (error) {
                    console.error('The UNAIDS rows did not give figures', error);
                    throw error;
                }

                if (current) {
                    setState({ status: 'ready', figures });
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
    }, [countries, years]);

    return state;
};
