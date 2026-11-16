import type { ReactNode } from 'react';

import styles from './CardFoot.module.scss';

import BuiltWithMark from '@/components/organisms/Studio/canvas/cards/BuiltWithMark';

/** A chart card's foot, as in Studio's cards: the source on the left, Built with on the right. */
export const CardFoot = ({ children }: { children: ReactNode }) => (
    <div className={styles.foot}>
        <p className={styles.source}>{children}</p>
        <BuiltWithMark />
    </div>
);
