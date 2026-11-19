'use client';

import { createContext, useContext, useMemo } from 'react';

import { useExplorerData } from './useExplorerData';
import styles from './ListToggle.module.scss';

import { count } from '@/lib/graphExplorer/counts';
import {
    datasetOrigin,
    filterNote,
    landedUsage,
    LIST_HEAD,
    termOrigin,
    type ListHead,
    type Matches,
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

/**
 * "The first N of M." and any `then` under a list cut at its ceiling
 * (LIST_CEILING), as firstMatches gives it. Nothing when every entry is on
 * show.
 */
export const CeilingNote = ({
    matches,
    then,
}: {
    matches: Matches<unknown>;
    /** What the reader can do to reach the rest, as a sentence, where there is a way. */
    then?: string;
}) => {
    if (matches.total <= matches.hits.length) return null;
    return (
        <p className={styles.note} role="status">
            The first {count(matches.hits.length)} of {count(matches.total)}.
            {then !== undefined && ` ${then}`}
        </p>
    );
};

/** A box that filters a list as the reader types. */
export const FilterBox = ({
    value,
    onChange,
    label,
    placeholder = 'Filter by name or dcid',
}: {
    value: string;
    onChange: (value: string) => void;
    /** The box's accessible name. */
    label: string;
    /** What the box matches, for a list that matches more than name and dcid. */
    placeholder?: string;
}) => (
    <input
        type="search"
        className={styles.filter}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
    />
);

/** The note under a list with a FilterBox (filterNote): no match, or the ceiling and how to reach the rest. */
export const FilterNoteLine = ({
    text,
    matches,
    also,
}: {
    text: string;
    matches: Matches<unknown>;
    /** A sentence after the ceiling note's own, such as where the full list is. */
    also?: string;
}) => {
    const note = filterNote(text, matches);
    if (note === null) return null;
    if (note.kind === 'noMatch') {
        return (
            <p className={styles.note} role="status">
                No entry matches “{note.text}”.
            </p>
        );
    }
    return (
        <CeilingNote
            matches={matches}
            then={also === undefined ? note.then : `${note.then} ${also}`}
        />
    );
};

/** Where a list's entries come from, as a node's `declared_by`, for their origin tags. */
export type ListOrigins = {
    readonly dataset: (dataset: ProvenanceUsage) => string | null;
    readonly term: (id: string) => string | null;
};

const TermSourcesContext = createContext<TermSources | null>(null);

/**
 * Provides the outside usage documents landed and the terms lists the
 * switches load, merged once (`ExplorerData.outside`), to every origin tag
 * on a screen. The merged list keeps its identity while the lists do, so
 * outsideTerm indexes it once however many links read it.
 */
export const TermSourcesProvider = ({ children }: { children: React.ReactNode }) => {
    const { usage, outside } = useExplorerData();
    const { base, un } = landedUsage(usage);
    const sources = useMemo(() => ({ usage: { base, un }, terms: outside }), [base, un, outside]);
    return <TermSourcesContext.Provider value={sources}>{children}</TermSourcesContext.Provider>;
};

/** The term sources for termOrigin. Only under TermSourcesProvider. */
export const useTermSources = (): TermSources => {
    const sources = useContext(TermSourcesContext);
    if (!sources) throw new Error('useTermSources is used outside TermSourcesProvider');
    return sources;
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
