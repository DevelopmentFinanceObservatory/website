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
    type TermSources,
} from '@/lib/graphExplorer/lists';
import type { Model } from '@/lib/graphExplorer/model';
import type { ProvenanceUsage } from '@/lib/graphExplorer/wire';

/**
 * "All N" and `noun` under a long list's first entries, and "First N" (`LIST_HEAD`) and
 * `noun` once it is open, controlling the list whose id is `controls`.
 * Nothing for a list no longer than its head.
 */
export const ListToggle = ({
    head,
    open,
    onToggle,
    noun,
    controls,
}: {
    head: ListHead<unknown>;
    open: boolean;
    onToggle: () => void;
    noun: string;
    controls: string;
}) => {
    if (!head.long) return null;
    const words = open ? `First ${LIST_HEAD}` : `All ${count(head.total)}`;
    return (
        <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={controls}
            onClick={onToggle}
        >
            {`${words} ${noun}`}
        </button>
    );
};

/** Where a list's entries come from, as a node's `declared_by`, for their origin tags. */
export type ListOrigins = {
    readonly dataset: (dataset: ProvenanceUsage) => string | null;
    readonly term: (id: string) => string | null;
};

/** The outside usage documents landed and the terms lists the switches load, for termOrigin. */
export const useTermSources = (): TermSources => {
    const { usage, outside } = useExplorerData();
    const { base, un } = landedUsage(usage);
    return useMemo(() => ({ usage: { base, un }, terms: outside }), [base, un, outside]);
};

/**
 * The origin of a dataset, from the usage document that lists it, and of a
 * term, from the schema, the outside usage documents or the terms lists
 * the switches load (`termOrigin`).
 */
export const useListOrigins = (model: Model): ListOrigins => {
    const sources = useTermSources();
    return useMemo(
        () => ({
            dataset: (dataset) => datasetOrigin(dataset, sources.usage),
            term: (id) => termOrigin(model, sources, id),
        }),
        [model, sources],
    );
};
