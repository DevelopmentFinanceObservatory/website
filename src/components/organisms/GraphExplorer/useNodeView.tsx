'use client';

import { useCallback, useEffect } from 'react';

import { useExplorerData, useNodeViews } from './useExplorerData';

import type { NodeViewState } from '@/lib/graphExplorer/load';
import type { Model } from '@/lib/graphExplorer/model';
import { centreModel } from '@/lib/graphExplorer/nodeView';

export type NodeView = {
    /**
     * The view's state: null for no dcid, or for the render before its load
     * starts. `notHeld` and `notServed` are final, and `retry` leaves them.
     */
    readonly state: NodeViewState | null;
    /** The centre's model, built by centreModel over the full model, once the view and the full model are in. */
    readonly model: Model | null;
    /** Loads the view again after a failure. */
    readonly retry: () => void;
};

/**
 * The node view of `dcid` from GET /api/graph/schema/node/{dcid}, and the
 * model centred on it. Null asks for nothing. Each dcid loads once per
 * visit, shared by every component that asks for it, and a load still
 * running stops when the last of them unmounts or moves to another dcid.
 * A 503 is waited out as every load's is.
 */
export const useNodeView = (dcid: string | null): NodeView => {
    const { states, loads } = useNodeViews();
    const { full } = useExplorerData();

    useEffect(() => {
        if (dcid === null) return undefined;
        return loads.hold(dcid);
    }, [dcid, loads]);

    const retry = useCallback(() => {
        if (dcid !== null) loads.retry(dcid);
    }, [dcid, loads]);

    const state = dcid === null ? null : (states.get(dcid) ?? null);
    const model =
        state?.status === 'ready' && full !== null ? centreModel(full, state.value) : null;
    return { state, model, retry };
};
