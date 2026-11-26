import classNames from 'classnames';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Chevron } from './Glyphs';
import styles from './parts.module.scss';

type FoldProps = {
    open: boolean;
    onToggle: () => void;
    /** The id of the region the fold opens. */
    controls: string;
    children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>;

/** A disclosure button: its words, then a chevron pointing right when shut
 *  and down when open. */
export const Fold = ({ open, onToggle, controls, children, className, ...rest }: FoldProps) => (
    <button
        type="button"
        {...rest}
        className={classNames(styles.fold, className)}
        aria-expanded={open}
        aria-controls={controls}
        onClick={onToggle}
    >
        {children}
        <Chevron direction="down" />
    </button>
);
