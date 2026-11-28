'use client';

import * as Dialog from '@radix-ui/react-dialog';
import classNames from 'classnames';
import { ReactNode, useRef, useState } from 'react';

import styles from './Modal.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { PopupContainer } from '@/components/molecules/HoverPopup/popupContainer';

export type ModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    // Extra controls in the head, left of the close button (e.g. Reset).
    actions?: ReactNode;
    // 'panel' docks to the right edge (the Customize drawer, Text Card);
    // 'center' floats mid-screen (confirmations, forms).
    placement?: 'panel' | 'center';
    // Panels size to their content instead of stretching to the page bottom.
    fit?: boolean;
    // Pinned under the scrolling body (a dialog's main action). The body
    // then shades its edges while more of it lies beyond them.
    footer?: ReactNode;
    // Move focus into the dialog when it opens (Radix's first tabbable
    // element). Off, focus stays on the control that opened it, which suits
    // a drawer opened beside the content it edits; a keyboard user then
    // cannot Tab into the dialog until they click it.
    autoFocus?: boolean;
    // A CSS selector for the element inside the dialog that takes focus when
    // it opens, in place of the first tabbable element (the close button).
    initialFocus?: string;
    // The element that takes focus on close when the one that opened the
    // dialog has left the page, as a canvas card's source line does when
    // its card moves over the dim.
    returnFocus?: () => HTMLElement | null | undefined;
    className?: string;
    children: ReactNode;
};

/**
 * The house dialog shell (Radix Dialog): a dimming overlay (click to close),
 * white face on the canvas' rounded corners, title row with optional
 * actions + close, scrollable body, optional pinned footer. One component
 * for drawers and centered dialogs alike.
 */
const Modal = ({
    open,
    onOpenChange,
    title,
    actions,
    placement = 'panel',
    fit = false,
    footer,
    autoFocus = false,
    initialFocus,
    returnFocus,
    className,
    children,
}: ModalProps) => {
    // The element focused when the dialog opened, which takes focus back on
    // close. Radix returns focus to a Dialog.Trigger, and these dialogs open
    // from plain buttons, so without this focus falls to the page body.
    const openerRef = useRef<HTMLElement | null>(null);
    // The dialog's content, where a HoverPopup inside it renders its popup.
    const [content, setContent] = useState<HTMLDivElement | null>(null);

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                {/* The dim covers everything; clicking it closes the dialog. */}
                <Dialog.Overlay className={styles.overlay} />
                <Dialog.Content
                    ref={setContent}
                    className={classNames(
                        styles.modal,
                        placement === 'panel' ? styles.panel : styles.center,
                        fit && styles.fit,
                        className,
                    )}
                    onOpenAutoFocus={(event) => {
                        // The body means the opener left the page as the
                        // dialog opened.
                        openerRef.current =
                            document.activeElement instanceof HTMLElement &&
                            document.activeElement !== document.body
                                ? document.activeElement
                                : null;

                        if (initialFocus) {
                            event.preventDefault();
                            content?.querySelector<HTMLElement>(initialFocus)?.focus();
                        } else if (!autoFocus) {
                            event.preventDefault();
                        }
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();

                        const opener = openerRef.current;

                        (opener?.isConnected ? opener : returnFocus?.())?.focus();
                    }}
                >
                    <header className={styles.head}>
                        <Dialog.Title className={styles.title}>{title}</Dialog.Title>
                        <div className={styles.headActions}>
                            {actions}
                            <Dialog.Close className={styles.close} aria-label="Close">
                                <Icon name="closer" />
                            </Dialog.Close>
                        </div>
                    </header>
                    <PopupContainer value={content}>
                        <div className={classNames(styles.body, !!footer && styles.bodyFooted)}>
                            {children}
                        </div>
                        {footer && <footer className={styles.foot}>{footer}</footer>}
                    </PopupContainer>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

export default Modal;
