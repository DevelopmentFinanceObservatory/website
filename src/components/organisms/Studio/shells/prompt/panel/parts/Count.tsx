import type { ReactNode } from 'react';

import styles from './parts.module.scss';

/** A count after a heading's or button's words. A hidden space keeps it
 *  apart from them in the accessible name (`Cards 5`, not `Cards5`). */
export const Count = ({ children }: { children: ReactNode }) => (
    <span className={styles.count}>
        <span className={styles.vh}> </span>
        {children}
    </span>
);
