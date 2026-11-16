'use client';

import { useActionState, useState } from 'react';

import styles from './ApiKeys.module.scss';
import type { CreatedState } from './state';

type CreateKeyFormProps = {
    // A server action: the account's own, or the admin's.
    action: (previous: CreatedState, formData: FormData) => Promise<CreatedState>;
    // The admin form names the account to make the key for.
    withEmail?: boolean;
    // Why a key cannot be made now, which disables the form.
    blocked?: string;
};

/**
 * The create form. The key the action answers with is held here, in this
 * component's state, and nowhere else: reload or leave the page and it is
 * gone, as the note beside it says. Only a hash is stored.
 */
const CreateKeyForm = ({ action, withEmail, blocked }: CreateKeyFormProps) => {
    const [state, submit, pending] = useActionState(action, null);
    const [copied, setCopied] = useState(false);
    const key = state?.created?.key;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(key ?? '');
            setCopied(true);
        } catch {
            // Clipboard access can be refused; the key is selectable below.
            setCopied(false);
        }
    };

    return (
        <div>
            <form
                className={styles.form}
                action={(formData) => {
                    setCopied(false);
                    submit(formData);
                }}
            >
                {withEmail && (
                    <label className={styles.field}>
                        <span className={styles.label}>Account email</span>
                        <input
                            className={styles.input}
                            type="email"
                            name="email"
                            required
                            autoComplete="off"
                            placeholder="name@example.org"
                        />
                    </label>
                )}
                <label className={styles.field}>
                    <span className={styles.label}>Label</span>
                    <input
                        className={styles.input}
                        type="text"
                        name="label"
                        required
                        maxLength={32}
                        autoComplete="off"
                        placeholder="e.g. my notebook"
                    />
                </label>
                <button type="submit" className={styles.primary} disabled={pending || !!blocked}>
                    {pending ? 'Creating…' : 'Create key'}
                </button>
            </form>
            {blocked && <p className={styles.note}>{blocked}</p>}
            {state?.error && (
                <p className={styles.error} role="alert">
                    {state.error}
                </p>
            )}
            {key && (
                <div className={styles.once} role="status">
                    <p className={styles.onceTitle}>
                        Copy this key now. You won&apos;t see it again.
                    </p>
                    <div className={styles.keyRow}>
                        <code className={styles.keyValue} data-testid="new-key">
                            {key}
                        </code>
                        <button type="button" className={styles.secondary} onClick={copy}>
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <p className={styles.note}>
                        Only a fingerprint of the key is stored, so it cannot be shown again. If you
                        lose it, delete it and make a new one.
                    </p>
                </div>
            )}
        </div>
    );
};

export default CreateKeyForm;
