'use client';

import * as Popover from '@radix-ui/react-popover';
import {
    type KeyboardEvent,
    type PointerEvent,
    type ReactNode,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';

import { PopupContainer } from './popupContainer';

// How long a hover-opened popup waits, once the mouse leaves both the
// trigger and the popup, before it closes, long enough to cross the gap
// between them.
const CLOSE_DELAY_MS = 200;

type HoverPopupProps = {
    // What the trigger button shows.
    trigger: ReactNode;
    // The popup's accessible name, such as the term it defines.
    label: string;
    triggerClassName?: string;
    contentClassName?: string;
    // What the popup shows.
    children: ReactNode;
};

/**
 * The house popup, a non-modal Radix popover with no shadow, opening beneath
 * its trigger. A mouse opens it on hover, and it stays open while the mouse
 * is over the trigger or the popup, so its text can be selected. It closes
 * a moment after the mouse leaves both. A click or tap, or Enter or Space
 * on the focused trigger, pins it open until the next one, Escape or a
 * press outside. A click on a hover-opened popup's trigger pins it.
 *
 * Pinning moves focus into the popup, which takes focus but sits outside
 * the tab order, so arrow and Page keys scroll a long popup. Tab or
 * Shift+Tab there closes it and moves on from the trigger, to the control
 * after it or before it. Hover leaves focus where it is. Closing returns
 * focus to the trigger only when focus was inside the popup, as after
 * Escape. The trigger's styling and the popup's are the caller's, including
 * a :focus-visible style for the popup.
 *
 * Inside the house Modal the popup renders into the dialog's content
 * (`PopupContainer`), where the dialog's scroll lock lets the wheel and
 * touch scroll it. Elsewhere it renders into the body.
 */
const HoverPopup = ({
    trigger,
    label,
    triggerClassName,
    contentClassName,
    children,
}: HoverPopupProps) => {
    const [open, setOpen] = useState(false);
    // Whether a click, tap or key opened it, so the mouse leaving does not
    // close it.
    const pinned = useRef(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const container = useContext(PopupContainer);
    // Whether focus was inside the popup when it closed, so closing hands
    // it back to the trigger.
    const returnFocus = useRef(false);

    const cancelClose = () => {
        clearTimeout(closeTimer.current);
        closeTimer.current = undefined;
    };

    const show = ({ pin }: { pin: boolean }) => {
        cancelClose();
        pinned.current ||= pin;
        setOpen(true);
    };

    const hide = () => {
        cancelClose();
        returnFocus.current = content.current?.contains(document.activeElement) ?? false;
        pinned.current = false;
        setOpen(false);
    };

    useEffect(() => cancelClose, []);

    // Tab from the popup moves on from the trigger. Focus goes back to the
    // trigger before the browser acts on the key, so its own Tab order takes
    // over, and Radix's focus scope, which would hold focus on a popup with
    // nothing to tab to, finds focus already outside it. The capture phase
    // runs this before that scope's handler.
    const onTab = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        triggerRef.current?.focus({ preventScroll: true });
        hide();
    };

    const onMouseLeave = (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && !pinned.current) {
            cancelClose();
            closeTimer.current = setTimeout(hide, CLOSE_DELAY_MS);
        }
    };

    return (
        <Popover.Root open={open} onOpenChange={(next) => (next ? show({ pin: true }) : hide())}>
            <Popover.Trigger
                ref={triggerRef}
                type="button"
                className={triggerClassName}
                onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') {
                        show({ pin: false });
                    }
                }}
                onPointerLeave={onMouseLeave}
                onClick={(event) => {
                    // A click on a hover-opened popup pins it.
                    // Radix skips its toggle for a prevented click.
                    if (open && !pinned.current) {
                        event.preventDefault();
                        show({ pin: true });
                        content.current?.focus({ preventScroll: true });
                    }
                }}
            >
                {trigger}
            </Popover.Trigger>
            <Popover.Portal container={container}>
                <Popover.Content
                    ref={content}
                    tabIndex={-1}
                    className={contentClassName}
                    aria-label={label}
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    collisionPadding={16}
                    onOpenAutoFocus={(event) => {
                        if (!pinned.current) {
                            event.preventDefault();
                        }
                    }}
                    onCloseAutoFocus={(event) => {
                        if (!returnFocus.current) {
                            event.preventDefault();
                        }
                    }}
                    onKeyDownCapture={onTab}
                    onPointerEnter={cancelClose}
                    onPointerLeave={onMouseLeave}
                >
                    {children}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

export default HoverPopup;
