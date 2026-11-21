'use client';

import { useEffect, useState } from 'react';

import { readLiveRefs } from '#lib/liveRef.ts';

import liveRefs from '../_data/live-refs.json';
import {
    transfersByCountry,
    type TransfersData,
    type TransfersMembers,
} from '../_lib/transfers.ts';

export type TransfersState =
    | { status: 'loading' }
    | { status: 'error'; error: Error }
    | { status: 'ready'; data: TransfersData };

/**
 * Reads the transfers ref in the browser and joins its rows to `members`. The server
 * renders and the first client render show `loading`. Nothing on the page derives from
 * the rows before this resolves. A failure goes to `console.error` in full. When DFO
 * serves another version than the ref's, the release label says so, since the step
 * named only the release it read.
 */
export const useTransfers = (members: TransfersMembers): TransfersState => {
    const [state, setState] = useState<TransfersState>({ status: 'loading' });

    useEffect(() => {
        const controller = new AbortController();

        readLiveRefs(
            { transfers: liveRefs.data.transfers },
            (rows) => transfersByCountry(rows.transfers, members),
            { signal: controller.signal },
        )
            .then(({ value, asCommitted }) => {
                const data = asCommitted
                    ? value
                    : {
                          ...value,
                          release: `the DFO's newest version, which can differ from the ${value.release} release this page was checked on`,
                      };

                setState({ status: 'ready', data });
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted) {
                    console.error('Net transfers did not load from the transfers ref.', error);
                    setState({
                        status: 'error',
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            });

        return () => controller.abort();
    }, [members]);

    return state;
};
