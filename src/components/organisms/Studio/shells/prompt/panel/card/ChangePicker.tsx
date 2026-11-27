import { type ReactNode, useEffect, useRef } from 'react';

import styles from './CardPage.module.scss';

import Button from '@/components/atoms/Button/Button';

type ChangePickerProps = {
    id: string;
    /** The row's key, such as `unit`. */
    rowKey: string;
    /** The row's label, which names the picker. */
    label: string;
    /** Whether the selection differs from the row's value and can be sent. */
    canApply: boolean;
    onApply: () => void;
    onCancel: () => void;
    /** The choices: the unit, the years, the places or the split. The element
     *  carrying `data-pick-focus` takes focus when the picker opens. */
    children: ReactNode;
};

/**
 * The bordered box a row's `Change` opens under the row: the choices, then
 * `Cancel` and `Apply`. It takes focus as it opens; the row returns focus to
 * its `Change` when it closes.
 */
const ChangePicker = ({
    id,
    rowKey,
    label,
    canApply,
    onApply,
    onCancel,
    children,
}: ChangePickerProps) => {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current;
        const target =
            box?.querySelector<HTMLElement>('[data-pick-focus]') ??
            box?.querySelector<HTMLElement>('input, select, button');

        target?.focus({ preventScroll: true });

        // Brings the frame, with its `Apply`, into the panel's view, and
        // again when it changes size (a places list that loads). Only the
        // panel's own scroller moves. The back row pinned over its top hides
        // the first rows of its content, and the foot fade the last 40 px.
        const scroller = box?.closest<HTMLElement>('[data-sp-scroll]');
        const pinned = scroller?.querySelector<HTMLElement>('[data-sp-backrow]');

        if (!box || !scroller) return;

        const reveal = () => {
            const frame = scroller.getBoundingClientRect();
            const at = box.getBoundingClientRect();
            const top = frame.top + (pinned?.offsetHeight ?? 0);
            const foot = frame.bottom - 44;

            if (at.top < top) scroller.scrollTop += at.top - top;
            else if (at.bottom > foot) {
                scroller.scrollTop += Math.min(at.bottom - foot, at.top - top);
            }
        };
        const watch = new ResizeObserver(reveal);

        watch.observe(box);

        return () => watch.disconnect();
    }, []);

    return (
        <div
            ref={boxRef}
            id={id}
            className={styles.picker}
            role="group"
            aria-label={`Change ${label}`}
            data-sp-picker={rowKey}
        >
            {children}
            <div className={styles.pickerFoot}>
                <Button variant="bordered" small data-sp-pickcancel onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    variant="dark"
                    small
                    disabled={!canApply}
                    data-sp-pickapply
                    onClick={onApply}
                >
                    Apply
                </Button>
            </div>
        </div>
    );
};

export default ChangePicker;
