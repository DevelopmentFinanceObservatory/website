import type { ReactNode } from 'react';

import styles from './Reserved.module.scss';

/**
 * Text that takes the room of the largest of its `variants` at any width, so changing it
 * never moves what follows. The variants sit in the same grid cell as the text, hidden;
 * the text remounts when it changes and fades in.
 */
export const Reserved = ({
    text,
    variants,
    render = (value) => value,
    block = false,
    className,
}: {
    text: string;
    /** Every text this place can show; `text` need not be among them. */
    variants: readonly string[];
    /** How a text is drawn, the same for the variants and the text. */
    render?: (value: string) => ReactNode;
    /** A block that fills the line, for a paragraph; inline otherwise. */
    block?: boolean;
    className?: string;
}) => (
    <span
        className={[styles.reserved, block ? styles.block : '', className ?? '']
            .filter(Boolean)
            .join(' ')}
    >
        {[...new Set(variants)].map((variant) => (
            <span key={variant} className={styles.variant} aria-hidden="true">
                {render(variant)}
            </span>
        ))}
        <span key={text} className={styles.text}>
            {render(text)}
        </span>
    </span>
);
