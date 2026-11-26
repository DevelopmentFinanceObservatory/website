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
