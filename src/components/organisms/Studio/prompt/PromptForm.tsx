'use client';

import classNames from 'classnames';
import { type FormHTMLAttributes, type RefObject, useRef } from 'react';

import styles from './PromptForm.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { useGrowFallback } from '@/hooks/useGrowFallback';

export type PromptField = HTMLInputElement | HTMLTextAreaElement;

type PromptFormProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder: string;
    // The input's accessible name and the submit button's.
    label: string;
    submitLabel: string;
    // 'chat': the follow-up field inside the chat panel (quiet placeholder,
    // no bottom margin).
    variant?: 'landing' | 'chat';
    // Wrap and grow with the text instead of scrolling it sideways. Off by
    // default: the History page's search is a one-line field by nature, and
    // a growing one would push its results around as you type.
    grow?: boolean;
    inputRef?: RefObject<PromptField | null>;
} & Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'onChange'>;

/**
 * The prompt shell: a white bar with the text field and the arrow submit —
 * the landing's opener and the chat's follow-up field alike (the History
 * page's search wears the same styles).
 */
const PromptForm = ({
    value,
    onChange,
    onSubmit,
    placeholder,
    label,
    submitLabel,
    variant = 'landing',
    grow = false,
    inputRef,
    className,
    ...rest
}: PromptFormProps) => {
    const ownRef = useRef<PromptField>(null);
    const field = inputRef ?? ownRef;

    useGrowFallback(field, value, grow);

    const shared = {
        className: styles.promptInput,
        value,
        placeholder,
        'aria-label': label,
    };

    return (
        <form
            className={classNames(
                styles.prompt,
                variant === 'chat' && styles.chatPrompt,
                grow && styles.promptGrow,
                className,
            )}
            onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
            }}
            {...rest}
        >
            {grow ? (
                <textarea
                    {...shared}
                    ref={field as RefObject<HTMLTextAreaElement | null>}
                    rows={1}
                    // A question is one sentence: a pasted newline becomes a
                    // space rather than a line the field has to carry.
                    onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, ' '))}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            onSubmit();
                        }
                    }}
                />
            ) : (
                <input
                    {...shared}
                    ref={field as RefObject<HTMLInputElement | null>}
                    onChange={(event) => onChange(event.target.value)}
                />
            )}
            <button type="submit" className={styles.promptSubmit} aria-label={submitLabel}>
                <Icon name="arrow" className={styles.promptSubmitIcon} />
            </button>
        </form>
    );
};

export default PromptForm;
