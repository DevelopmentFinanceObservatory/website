'use client';

import classNames from 'classnames';

import { useModel } from './ExploreContext';
import { TermLink } from './ExploreLink';
import styles from './FocusEntry.module.scss';
import { count } from './format';

import type { LensEntry, ValuesUsed } from '@/lib/graphExplorer/model';

/** "12 of 14", with a plus when the graph lists only part of the value list. */
export const ofMembers = (values: ValuesUsed): string =>
    `${count(values.used)} of ${count(values.of)}${values.truncated ? '+' : ''}`;

/** The dataset filter's answer for each id, or null when no single dataset is chosen. */
export const useLens = (
    datasetId: string | null,
    ids: readonly string[],
): ReadonlyMap<string, LensEntry> | null => {
    const model = useModel();
    if (datasetId === null) return null;
    return new Map(model.lens(datasetId, ids).map((entry) => [entry.id, entry]));
};

type FocusEntryProps = {
    id: string;
    /** The chosen dataset's use of the entry; null with no dataset chosen. */
    lens: LensEntry | null;
    datasetLabel: string | null;
    /** The members of the entry's value list a centred dataset uses. */
    values?: ValuesUsed | null;
};

/**
 * One entry of a box or list: a link that centres the term. With a dataset
 * chosen, an entry it uses is marked with its StatVar count there (or, for a value
 * list, how many members it uses) and an entry it does not use is dimmed.
 */
const FocusEntry = ({ id, lens, datasetLabel, values }: FocusEntryProps) => {
    const unused = lens !== null && !lens.used;

    return (
        <li className={classNames(styles.entry, unused && styles.dim)}>
            <TermLink id={id} />
            {values && <span className={styles.figure}>uses {ofMembers(values)}</span>}
            {lens?.used && (
                <span className={styles.mark}>
                    {lens.members ? (
                        `uses ${ofMembers(lens.members)}`
                    ) : (
                        <>
                            {count(lens.count)}
                            <span className={styles.hidden}> StatVars in {datasetLabel}</span>
                        </>
                    )}
                </span>
            )}
            {unused && <span className={styles.hidden}>, not used by {datasetLabel}</span>}
        </li>
    );
};

export default FocusEntry;
