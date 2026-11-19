'use client';

import { useEffect, useState } from 'react';

import { readPinnedRef } from '#lib/pinnedRef.ts';

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
 * renders and the first client render show `loading`; nothing on the page derives from
 * the rows before this resolves. A failure goes to `console.error` in full.
 */
export const useTransfers = (members: TransfersMembers): TransfersState => {
    const [state, setState] = useState<TransfersState>({ status: 'loading' });

    useEffect(() => {
        const controller = new AbortController();

        readPinnedRef(liveRefs.data.transfers, { signal: controller.signal })
            .then(({ rows }) => {
                setState({ status: 'ready', data: transfersByCountry(rows, members) });
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
