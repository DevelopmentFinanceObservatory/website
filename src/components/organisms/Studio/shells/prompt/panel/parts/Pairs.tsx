import classNames from 'classnames';
import type { ReactNode } from 'react';

import styles from './parts.module.scss';

export type PairRow = {
    key: string;
    label: string;
    /** The row is left out when this is null, empty or an empty list. */
    value: ReactNode;
    /** A control floated at the right of the value's first line. */
    action?: ReactNode;
    /** Content under the row across both columns, such as a picker. */
    below?: ReactNode;
};

const present = (value: ReactNode): boolean =>
    value !== null &&
    value !== undefined &&
    value !== false &&
    value !== '' &&
    !(Array.isArray(value) && value.length === 0);

/** Label and value rows on a 96 px label column. Nothing is drawn for an
 *  empty value. */
export const Pairs = ({ rows, className }: { rows: PairRow[]; className?: string }) => {
    const shown = rows.filter((row) => present(row.value));

    if (shown.length === 0) return null;

    return (
        <dl className={classNames(styles.pairs, className)}>
            {shown.map((row) => (
                <div key={row.key} className={styles.pair} data-sp-row={row.key}>
                    <dt className={styles.pairLabel}>{row.label}</dt>
                    <dd className={styles.pairValue}>
                        {row.action && <span className={styles.pairAction}>{row.action}</span>}
                        {row.value}
                    </dd>
                    {row.below && <dd className={styles.pairBelow}>{row.below}</dd>}
                </div>
            ))}
        </dl>
    );
};
