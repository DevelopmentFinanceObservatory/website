'use client';

import { useEffect, useId, useRef, useState } from 'react';

import styles from './JoinPhrase.module.scss';

type JoinPhraseProps = {
    /** The words on the join. */
    phrase: string;
    /** The link written out, shown in the bubble. */
    triple: string;
    note: string | null;
};

/**
 * A join's words as a button. Hovering it, focusing it from the keyboard or
 * tapping it opens a bubble above it with the link written out. Escape, a tap
 * elsewhere or moving focus away closes it.
 */
export const JoinPhrase = ({ phrase, triple, note }: JoinPhraseProps) => {
    const [hovered, setHovered] = useState(false);
    const [held, setHeld] = useState(false);
    const open = hovered || held;
    const root = useRef<HTMLSpanElement>(null);
    const bubble = useId();

    useEffect(() => {
        if (!open) return;
        const close = () => {
            setHovered(false);
            setHeld(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        const onPointer = (event: PointerEvent) => {
            if (event.target instanceof Node && root.current?.contains(event.target)) return;
            close();
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onPointer);
        };
    }, [open]);

    // Touch input emits pointer events too, and a tap toggles through onClick alone.
    const onHover = (event: React.PointerEvent, entering: boolean) => {
        if (event.pointerType === 'mouse') setHovered(entering);
    };

    return (
        <span
            ref={root}
            className={styles.root}
            onPointerEnter={(event) => onHover(event, true)}
            onPointerLeave={(event) => onHover(event, false)}
        >
            <button
                type="button"
                className={styles.phrase}
                aria-expanded={open}
                aria-controls={bubble}
                // A mouse click focuses the button too; only keyboard focus opens the bubble.
                onFocus={(event) => {
                    if (event.currentTarget.matches(':focus-visible')) setHeld(true);
                }}
                onBlur={() => setHeld(false)}
                onClick={() => setHeld((was) => !was)}
            >
                {phrase}
            </button>
            <span id={bubble} className={styles.bubble} hidden={!open}>
                <span>{triple}</span>
                {note !== null && <span className={styles.note}>{note}</span>}
            </span>
        </span>
    );
};
