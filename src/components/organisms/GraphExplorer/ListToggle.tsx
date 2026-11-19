'use client';

import { useMemo } from 'react';

import { useExplorerData } from './useExplorerData';
import styles from './ListToggle.module.scss';

import { count } from '@/lib/graphExplorer/counts';
import {
    datasetOrigin,
    landedUsage,
    LIST_HEAD,
    termOrigin,
    type ListHead,
} from '@/lib/graphExplorer/lists';
import type { Model } from '@/lib/graphExplorer/model';
import type { ProvenanceUsage } from '@/lib/graphExplorer/wire';

/**
 * "All N" under a long list's first entries, and "First 8" once it is open,
 * each followed by `noun` when given. Nothing for a list no longer than its head.
 */
export const ListToggle = ({
    head,
    open,
    onToggle,
    noun,
}: {
    head: ListHead<unknown>;
    open: boolean;
    onToggle: () => void;
    noun?: string;
}) => {
    if (!head.long) return null;
    const words = open ? `First ${LIST_HEAD}` : `All ${count(head.total)}`;
    return (
        <button type="button" className={styles.toggle} aria-expanded={open} onClick={onToggle}>
            {noun === undefined ? words : `${words} ${noun}`}
        </button>
    );
};

/** Where a list's entries come from, as a node's `declared_by`, for their origin tags. */
export type ListOrigins = {
    readonly dataset: (dataset: ProvenanceUsage) => string | null;
    readonly term: (id: string) => string | null;
};

/**
 * The origin of a dataset, from the usage document that lists it, and of a
 * term, from the schema or the terms lists the switches load.
 */
export const useListOrigins = (model: Model): ListOrigins => {
    const { usage, outside } = useExplorerData();
    const { base, un } = landedUsage(usage);
    return useMemo(
        () => ({
            dataset: (dataset) => datasetOrigin(dataset, { base, un }),
            term: (id) => termOrigin(model, outside, id),
        }),
        [base, un, model, outside],
    );
};
