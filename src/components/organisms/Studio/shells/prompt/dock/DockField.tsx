import classNames from 'classnames';
import type { ReactNode, RefObject } from 'react';

import styles from './PromptDock.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { useGrowFallback } from '@/hooks/useGrowFallback';

type DockFieldProps = {
    fieldRef: RefObject<HTMLTextAreaElement | null>;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder: string;
    label: string;
    /** A plan waits and the field is empty: the arrow is quiet and a
     *  submit does nothing. */
    quiet: boolean;
    /** The text is past the amendment cap. */
    invalid: boolean;
    describedBy?: string;
    /** The selected card's chip, before the typing area. */
    chip?: ReactNode;
};

/**
 * The input row: the selected card's chip, a textarea that grows with its
 * text up to five lines, then scrolls, and the send arrow on its last line.
 * The chip and the textarea share one wrapper whether or not a chip shows,
 * so the textarea keeps its element, and its focus, as the chip comes and
 * goes. Enter sends and
 * Shift+Enter breaks the line, which the field turns into a space, as the
 * chat's own field does.
 */
const DockField = ({
    fieldRef,
    value,
    onChange,
    onSubmit,
    placeholder,
    label,
    quiet,
    invalid,
    describedBy,
    chip,
}: DockFieldProps) => {
    useGrowFallback(fieldRef, value);

    const blocked = quiet || invalid;

    return (
        <form
            className={styles.input}
            onSubmit={(event) => {
                event.preventDefault();

                if (!blocked) {
                    onSubmit();
                }
            }}
        >
            <div className={styles.compose} data-chip={chip ? '' : undefined}>
                {chip}
                <textarea
                    ref={fieldRef}
                    className={styles.field}
                    rows={1}
                    value={value}
                    placeholder={placeholder}
                    aria-label={label}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, ' '))}
                    onKeyDown={(event) => {
                        if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();

                            if (!blocked) {
                                onSubmit();
                            }
                        }
                    }}
                />
            </div>
            <button
                type="submit"
                className={classNames(styles.send, quiet && styles.sendQuiet)}
                aria-label="Send"
                aria-disabled={blocked || undefined}
            >
                <Icon name="arrow" className={styles.sendIcon} />
            </button>
        </form>
    );
};

export default DockField;
