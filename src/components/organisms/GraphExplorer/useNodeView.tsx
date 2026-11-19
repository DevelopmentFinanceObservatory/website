'use client';

import { useCallback, useEffect } from 'react';

import { useNodeViews } from './useExplorerData';

import type { NodeViewState } from '@/lib/graphExplorer/load';
import type { NodeViewFailure } from '@/lib/graphExplorer/nodeView';

export type NodeView = {
    /**
     * The view's state: null for no dcid, or for the render before its load
     * starts. A refusal is final, and `retry` leaves it.
     */
    readonly state: NodeViewState | null;
    /** The view's last failure while a retry loads it again, else null. */
    readonly lastFailure: NodeViewFailure | null;
    /** Loads the view again after a failure. */
    readonly retry: () => void;
};

/**
 * The node view of `dcid` from GET /api/graph/schema/node/{dcid}. Null asks
 * for nothing. Each dcid loads once per visit, shared by every component
 * that asks for it, and a load still running stops when the last of them
 * unmounts or moves to another dcid. A 503 is waited out as every load's is.
 */
export const useNodeView = (dcid: string | null): NodeView => {
    const { states, failures, loads } = useNodeViews();

    useEffect(() => {
        if (dcid === null) return undefined;
        return loads.hold(dcid);
    }, [dcid, loads]);

    const retry = useCallback(() => {
        if (dcid !== null) loads.retry(dcid);
    }, [dcid, loads]);

    const state = dcid === null ? null : (states.get(dcid) ?? null);
    const lastFailure = dcid === null ? null : (failures.get(dcid) ?? null);
    return { state, lastFailure, retry };
};
