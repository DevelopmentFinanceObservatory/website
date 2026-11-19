'use client';

import { useState } from 'react';

import styles from './ApiKeysPanel.module.scss';

import Button from '@/components/atoms/Button/Button';
import { MAX_LABEL_LENGTH } from '@/lib/apiKeys/settings';

type NewKeyFormProps = {
    onCancel: () => void;
    // Answers the server's refusal, or null once the key is made.
    onCreate: (label: string) => Promise<string | null>;
};

/** The create step: a name for the key, with the server's refusals shown beneath it. */
const NewKeyForm = ({ onCancel, onCreate }: NewKeyFormProps) => {
    const [label, setLabel] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (busy || !label.trim()) {
            return;
        }

        setBusy(true);
        setError(null);
        setError(await onCreate(label));
        setBusy(false);
    };

    return (
        <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
                <span className={styles.fieldLabel}>Key name</span>
                <input
                    className={styles.input}
                    type="text"
                    maxLength={MAX_LABEL_LENGTH}
                    autoComplete="off"
                    autoFocus
                    required
                    value={label}
                    placeholder="For example, Claude Desktop"
                    onChange={(event) => setLabel(event.target.value)}
                />
            </label>
            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}
            <div className={styles.actions}>
                <Button small variant="paper" disabled={busy} onClick={onCancel}>
                    Cancel
                </Button>
                <Button small variant="dark" type="submit" disabled={busy || !label.trim()}>
                    {busy ? 'Creating…' : 'Create'}
                </Button>
            </div>
        </form>
    );
};

export default NewKeyForm;
