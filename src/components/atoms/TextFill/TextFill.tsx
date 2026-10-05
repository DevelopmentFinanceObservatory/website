'use client';

import classNames from 'classnames';
import { Fragment, useRef } from 'react';

import styles from './TextFill.module.scss';

import { useFillProgress } from '@/hooks/useFillProgress';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type TextFillProps = {
    text: string;
    className?: string;
    // For texts sharing one progression (e.g. label + title): word slot offset,
    // total word count, and driven=false to read --fill-progress from an ancestor.
    offset?: number;
    total?: number;
    driven?: boolean;
};

export const fillSpan = (totalWords: number) => Math.max(totalWords, 2);

const TextFill = ({ text, className, offset = 0, total, driven = true }: TextFillProps) => {
    const ref = useRef<HTMLSpanElement>(null);
    const reducedMotion = usePrefersReducedMotion();
    const words = text.split(' ');
    const totalWords = total ?? words.length;
    const span = fillSpan(totalWords);
    const slotScale = 1 - 1 / span;

    useFillProgress(ref, driven && !reducedMotion);

    return (
        <span
            ref={ref}
            className={classNames(styles.wrapper, className)}
            style={driven ? ({ '--fill-span': span } as React.CSSProperties) : undefined}
        >
            {words.map((word, index) => (
                <Fragment key={`${word}-${index}`}>
                    <span
                        className={styles.word}
                        style={
                            {
                                '--w': ((offset + index) / Math.max(totalWords - 1, 1)) * slotScale,
                            } as React.CSSProperties
                        }
                    >
                        <span className={styles.wordFill} aria-hidden="true">
                            {word}
                        </span>
                        {word}
                    </span>{' '}
                </Fragment>
            ))}
        </span>
    );
};

export default TextFill;
