'use client';

import { useState, useTransition } from 'react';

import styles from './AdminApiKeys.module.scss';
import type { AdminDoneResult } from './AdminState';

type AdminLimitInputProps = {
    // The limit set now, or null when the default applies.
    value: number | null;
    // Shown while the field is empty: the default that applies.
    placeholder: string;
    // Names the field for a screen reader.
    label: string;
    save: (limit: string) => Promise<AdminDoneResult>;
    // Runs after a save went through, to reload what the limit changes.
    onSaved?: () => void;
};

/**
 * A small whole-number field that saves when it loses focus or on Enter.
 * Empty clears the limit. A refusal puts the old value back and says why.
 */
const AdminLimitInput = ({ value, placeholder, label, save, onSaved }: AdminLimitInputProps) => {
    const [note, setNote] = useState<{ text: string; failed: boolean } | null>(null);
    const [pending, startTransition] = useTransition();
    const current = value === null ? '' : String(value);

    const commit = (input: HTMLInputElement) => {
        const text = input.value.trim();

        if (text === current) {
            input.value = current;

            return;
        }

        startTransition(async () => {
            const result = await save(text);

            if (result.ok) {
                setNote(result.message ? { text: result.message, failed: false } : null);
                onSaved?.();
            } else {
                input.value = current;
                setNote({ text: result.error, failed: true });
            }
        });
    };

    return (
        <span className={styles.limit}>
            {/* Remounts on a new saved value, so the field shows what is stored. */}
            <input
                key={current}
                className={styles.limitInput}
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                defaultValue={current}
                placeholder={placeholder}
                aria-label={label}
                disabled={pending}
                onBlur={(event) => commit(event.currentTarget)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                    }
                }}
            />
            {note && (
                <span
                    className={note.failed ? styles.noteError : styles.noteOk}
                    role={note.failed ? 'alert' : 'status'}
                >
                    {note.text}
                </span>
            )}
        </span>
    );
};

export default AdminLimitInput;
