'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';

import styles from './CardNote.module.scss';

import Icon from '@/components/atoms/Icon/Icon';

// Clear of the window edge, and of the card itself.
const EDGE = 16;
const OFFSET = 10;

/**
 * The user's note, shown while the pointer rests anywhere on the card.
 *
 * It used to be a "User Note" tag in the chrome bar, which cost a line of a
 * card that has few to spare and hid the words behind a second hover. Now
 * the card's own mark beside the pin says a note exists (CardActions) and
 * this says what it is — and offers the one action that belongs with it.
 *
 * Radix positions against a trigger, so the trigger here is an inert sheet
 * over the card — the real hover lives on the card box in Whiteboard, which
 * is also where a drag is known about. Nothing opens mid-drag: a note
 * following a card across the sheet reads as a bug.
 *
 * `width` is the card's, in px. It comes down from the board rather than off
 * a measurement: the board sets that width in the first place, and measuring
 * it back would render the panel once at nothing before correcting itself.
 *
 * `open` is the card's hover, which the board holds a moment past its end so
 * the pointer can cross the gap down to here; from the panel's own edge on,
 * this keeps itself up.
 */
const CardNote = ({
    note,
    open,
    width,
    onRemove,
}: {
    note: string;
    open: boolean;
    width: number;
    onRemove: (() => void) | null;
}) => {
    const [over, setOver] = useState(false);

    return (
        <DropdownMenu.Root open={open || over} modal={false}>
            <DropdownMenu.Trigger asChild>
                <span className={styles.anchor} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.note}
                    // Always under the card. Radix still lifts it above one
                    // sitting at the very bottom of the window, which beats
                    // the alternative of a note nobody can read.
                    side="bottom"
                    align="center"
                    sideOffset={OFFSET}
                    collisionPadding={EDGE}
                    style={{ '--card-w': `${width}px` } as React.CSSProperties}
                    onMouseEnter={() => setOver(true)}
                    onMouseLeave={() => setOver(false)}
                    // A hover popup is not a menu: closing it must not pull
                    // the caret back to the card.
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    <div className={styles.noteHead}>
                        <p className={styles.noteLabel}>User note</p>
                        {onRemove && (
                            <button
                                type="button"
                                className={styles.noteRemove}
                                aria-label="Remove this note"
                                onClick={onRemove}
                            >
                                <Icon name="note-remove" className={styles.noteRemoveIcon} />
                            </button>
                        )}
                    </div>
                    <p className={styles.noteBody}>{note}</p>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};

export default CardNote;
