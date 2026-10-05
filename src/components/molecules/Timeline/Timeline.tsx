import { Fragment, type ReactNode } from 'react';

import styles from './Timeline.module.scss';

import { revealIndex } from '@/hooks/useReveal';

export type TimelineItem = {
    key: string;
    // The chip's text ("June 12, 2026").
    date: string;
    // With `yearRows`, a bold year row opens each new year (none above the
    // first) — the rail runs straight through it.
    year?: string;
    children: ReactNode;
};

/**
 * A dated timeline: a dot on a rail, the date chip, the entry glued to its
 * right — each item rem(10) under the last, the rail from dot to dot.
 */
const Timeline = ({ items, yearRows }: { items: TimelineItem[]; yearRows?: boolean }) => (
    <ol className={styles.timeline}>
        {items.map((item, index) => {
            const previous = items[index - 1];
            const newYear = yearRows && previous && previous.year !== item.year;

            return (
                <Fragment key={item.key}>
                    {newYear && (
                        <li className={styles.year} aria-hidden="true">
                            <span className={styles.yearLabel}>{item.year}</span>
                        </li>
                    )}
                    <li className={styles.item} style={revealIndex(index)}>
                        <span className={styles.dot} />
                        <span className={styles.date}>{item.date}</span>
                        {item.children}
                    </li>
                </Fragment>
            );
        })}
    </ol>
);

export default Timeline;
