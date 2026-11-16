import type { ReactNode } from 'react';

import styles from './Summary.module.scss';
import { GROUP_COLOURS } from './ThresholdScatter';

import type { Group } from '../_lib/thresholds.ts';

const ITEMS = [
    { group: 'debt', text: 'above the debt threshold' },
    { group: 'service', text: 'above the debt-service threshold' },
    { group: 'below', text: 'below both' },
] as const satisfies { group: Group; text: string }[];

/**
 * The count of countries in each group for the view and capacity on screen, with the
 * view switch at the end of the line and, under it, `owner`: whose counts these are, on
 * which data, and whether a capacity what-if is applied. Countries without enough data
 * are counted only when there are some.
 */
export const Summary = ({
    counts,
    owner,
    viewSwitch,
}: {
    counts: Record<Group, number>;
    owner: ReactNode;
    viewSwitch: ReactNode;
}) => (
    <section className={styles.summary} aria-live="polite">
        {ITEMS.map(({ group, text }) => (
            <span key={group} className={styles.item}>
                <span className={styles.swatch} style={{ background: GROUP_COLOURS[group] }} />
                <b className={styles.count}>{counts[group]}</b> {text}
            </span>
        ))}
        {counts.nodata > 0 && (
            <span className={styles.item}>
                <span className={styles.swatch} style={{ background: GROUP_COLOURS.nodata }} />
                <b className={styles.count}>{counts.nodata}</b> without enough data
            </span>
        )}
        <span className={styles.year}>{viewSwitch}</span>
        <div className={styles.owner}>{owner}</div>
    </section>
);
