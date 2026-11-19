import type { ReactNode } from 'react';

import styles from './WithSide.module.scss';

/** A chart with its key on the right, stacked under it in a box narrower than 720px. */
export const WithSide = ({ children, side }: { children: ReactNode; side: ReactNode }) => (
    <div className={styles.frame}>
        <div className={styles.layout}>
            <div className={styles.main}>{children}</div>
            <div className={styles.side}>{side}</div>
        </div>
    </div>
);
