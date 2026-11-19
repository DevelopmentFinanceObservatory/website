'use client';

import { useEffect, useId, useRef, useState } from 'react';

import styles from './JoinPhrase.module.scss';

import Button from '@/components/atoms/Button/Button';

type JoinPhraseProps = {
    /** The words on the join. */
    phrase: string;
    /** The link written out, shown in the bubble. */
    triple: string;
    note: string | null;
};

/** Closes the open bubble, so only one shows at a time. */
let closeOpen: (() => void) | null = null;

/**
 * A join's words as a button. Hovering it previews a bubble above it with the
 * link written out, and a press pins the bubble open or unpins it. Escape, a
 * press outside the words and their bubble, moving focus outside them or
 * opening another join's bubble closes it. The bubble describes the button,
 * so a screen reader reads the link on focus.
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
        closeOpen?.();
        closeOpen = close;
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
            if (closeOpen === close) closeOpen = null;
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onPointer);
        };
    }, [open]);

    // Touch input emits pointer events too, and a tap toggles through onClick alone.
    const onHover = (event: React.PointerEvent, entering: boolean) => {
        if (event.pointerType === 'mouse') setHovered(entering);
    };

    // Focus that moves into the bubble, as a press on its text does, keeps it pinned.
    const onBlur = (event: React.FocusEvent) => {
        if (event.relatedTarget instanceof Node && root.current?.contains(event.relatedTarget))
            return;
        setHeld(false);
    };

    return (
        <span
            ref={root}
            className={styles.root}
            onPointerEnter={(event) => onHover(event, true)}
            onPointerLeave={(event) => onHover(event, false)}
        >
            <Button
                variant="inline"
                className={styles.phrase}
                aria-expanded={open}
                aria-controls={bubble}
                aria-describedby={bubble}
                onBlur={onBlur}
                onClick={() => setHeld(!held)}
            >
                {phrase}
            </Button>
            <span id={bubble} className={styles.bubble} tabIndex={-1} hidden={!open}>
                <span>{triple}</span>
                {note !== null && <span className={styles.note}>{note}</span>}
            </span>
        </span>
    );
};
