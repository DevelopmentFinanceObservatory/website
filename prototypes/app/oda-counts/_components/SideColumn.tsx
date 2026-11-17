import type { ReactNode } from 'react';

import styles from './SideColumn.module.scss';

/** The disclosure caret every `<details>` on the page uses; it turns when the details open. */
export const Caret = () => (
    <svg
        className={styles.caret}
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M4.5 2.5 8 6l-3.5 3.5" />
    </svg>
);

/**
 * A panel's body: the chart on the left and a side column of notes on the right, behind a
 * thin rule. Below 760px of panel width the side column stacks under the chart.
 */
export const WithSide = ({ children, side }: { children: ReactNode; side: ReactNode }) => (
    <div className={styles.frame}>
        <div className={styles.layout}>
            <div className={styles.main}>{children}</div>
            <div className={styles.side}>{side}</div>
        </div>
    </div>
);

/** One note in the side column, closed unless `open`. */
export const SideDetails = ({
    title,
    open = false,
    children,
}: {
    title: string;
    open?: boolean;
    children: ReactNode;
}) => (
    <details className={styles.details} open={open}>
        <summary className={styles.summary}>
            <Caret />
            {title}
        </summary>
        <div className={styles.body}>{children}</div>
    </details>
);
