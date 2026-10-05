'use client';

import classNames from 'classnames';
import { type FormHTMLAttributes, type RefObject } from 'react';

import styles from './PromptForm.module.scss';

import Icon from '@/components/atoms/Icon/Icon';

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
    inputRef?: RefObject<HTMLInputElement | null>;
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
    inputRef,
    className,
    ...rest
}: PromptFormProps) => (
    <form
        className={classNames(styles.prompt, variant === 'chat' && styles.chatPrompt, className)}
        onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
        }}
        {...rest}
    >
        <input
            ref={inputRef}
            className={styles.promptInput}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-label={label}
        />
        <button type="submit" className={styles.promptSubmit} aria-label={submitLabel}>
            <Icon name="arrow" className={styles.promptSubmitIcon} />
        </button>
    </form>
);

export default PromptForm;
