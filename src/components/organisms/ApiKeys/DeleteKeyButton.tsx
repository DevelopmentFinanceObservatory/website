'use client';

import { useActionState, useState } from 'react';

import styles from './ApiKeys.module.scss';
import type { DeleteState } from './state';

type DeleteKeyButtonProps = {
    action: (previous: DeleteState, formData: FormData) => Promise<DeleteState>;
    keyId: string;
    // What the confirmation names: the key's label.
    label: string;
};

/** Delete in two steps: the button asks, then a second press deletes. */
const DeleteKeyButton = ({ action, keyId, label }: DeleteKeyButtonProps) => {
    const [state, submit, pending] = useActionState(action, null);
    const [asking, setAsking] = useState(false);

    if (!asking) {
        return (
            <button
                type="button"
                className={styles.danger}
                aria-label={`Delete ${label}`}
                onClick={() => setAsking(true)}
            >
                Delete
            </button>
        );
    }

    return (
        <form className={styles.confirm} action={submit}>
            <input type="hidden" name="keyId" value={keyId} />
            <span className={styles.confirmText}>Delete &ldquo;{label}&rdquo; for good?</span>
            <button type="submit" className={styles.dangerSolid} disabled={pending}>
                {pending ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
                type="button"
                className={styles.secondary}
                disabled={pending}
                onClick={() => setAsking(false)}
            >
                Cancel
            </button>
            {state?.error && (
                <span className={styles.errorInline} role="alert">
                    {state.error}
                </span>
            )}
        </form>
    );
};

export default DeleteKeyButton;
