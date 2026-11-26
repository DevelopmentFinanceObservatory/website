import classNames from 'classnames';
import type { ReactNode } from 'react';

import { usePanelNav } from '../panelNav';
import styles from './parts.module.scss';

/** A row of chips that wraps. */
export const Chips = ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={classNames(styles.chips, className)}>{children}</div>
);

/** A card's title as a chip; a press moves the canvas to the card. */
export const CardChip = ({ id, title }: { id: string; title: string }) => {
    const { fly } = usePanelNav();

    return (
        <button
            type="button"
            className={styles.chip}
            title={title}
            aria-label={`${title}. Show on the canvas`}
            data-sp-fly={id}
            data-sp-key={`chip:${id}`}
            onClick={() => fly(id)}
        >
            <span className={styles.chipText}>{title}</span>
        </button>
    );
};

/** `N cards` in place of chips, when there are too many to list. */
export const CountChip = ({ count }: { count: number }) => (
    <span className={classNames(styles.chip, styles.countChip)}>
        {count} {count === 1 ? 'card' : 'cards'}
    </span>
);
