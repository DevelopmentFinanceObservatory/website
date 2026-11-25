'use client';

import { useState, useTransition } from 'react';

import styles from './AdminApiKeys.module.scss';
import AdminLimitInput from './AdminLimitInput';
import { type AdminActions, formatDateTime, formatDay } from './AdminState';
import { keySnippet } from './format';

import Button from '@/components/atoms/Button/Button';
import UsageMeter from '@/components/atoms/UsageMeter/UsageMeter';
import type { AdminKey } from '@/lib/apiKeys/service';

type AdminKeyRowProps = {
    keyData: AdminKey;
    actions: AdminActions;
    // Reloads the account's keys after a change.
    onChanged: () => void;
};

const TrashIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.iconSvg}>
        <path
            d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6M8.75 8.5v4.5M11.25 8.5v4.5"
            stroke="currentColor"
            strokeLinecap="square"
            strokeWidth="1.2"
        />
    </svg>
);

/** One key of an account: its name, its own daily cap and today's use of it, with delete. */
const AdminKeyRow = ({ keyData, actions, onChanged }: AdminKeyRowProps) => {
    const name = keyData.name || 'Unnamed';
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const confirm = () => {
        startTransition(async () => {
            const result = await actions.deleteKey(keyData.id);

            if (!result.ok) {
                setError(result.error);
                setAsking(false);

                return;
            }

            onChanged();
        });
    };

    const open = asking || error !== null;

    return (
        <>
            <tr className={styles.keyRow}>
                <td className={styles.keyCell}>
                    <span className={styles.keyName}>
                        {name}
                        <code className={styles.keySnippet}>
                            {keySnippet(keyData.start, keyData.tail)}
                        </code>
                    </span>
                    <span className={styles.keyCreated}>
                        <time dateTime={keyData.createdAt.toISOString()}>
                            {formatDateTime(keyData.createdAt)}
                        </time>
                        {' · '}
                        {keyData.lastRequest ? (
                            <>
                                last used{' '}
                                <time dateTime={keyData.lastRequest.toISOString()}>
                                    {formatDay(keyData.lastRequest)}
                                </time>
                            </>
                        ) : (
                            'never used'
                        )}
                    </span>
                </td>
                <td className={styles.usageCell}>
                    <div className={styles.usage}>
                        {keyData.dailyCap !== null && (
                            <>
                                <UsageMeter
                                    used={keyData.capUsedToday ?? 0}
                                    limit={keyData.dailyCap}
                                    label="API calls today with this key"
                                    layout="inline"
                                    className={styles.meter}
                                />
                                <span className={styles.of}>of</span>
                            </>
                        )}
                        <AdminLimitInput
                            value={keyData.dailyCap}
                            placeholder="No cap"
                            label={`Daily API call cap for ${name}`}
                            save={(limit) => actions.setKeyLimit(keyData.id, limit)}
                            onSaved={onChanged}
                        />
                    </div>
                </td>
                <td className={styles.keyActions}>
                    <button
                        type="button"
                        className={styles.iconButtonDanger}
                        aria-label={`Delete ${name}`}
                        title="Delete this key"
                        disabled={asking}
                        onClick={() => {
                            setError(null);
                            setAsking(true);
                        }}
                    >
                        <TrashIcon />
                    </button>
                </td>
            </tr>
            {/* The question and any refusal sit in a row of their own, so the
                columns above keep their widths while it is open. */}
            {open && (
                <tr className={styles.confirmRow}>
                    <td colSpan={3}>
                        {asking ? (
                            <span
                                className={styles.confirm}
                                role="group"
                                aria-label={`Confirm for ${name}`}
                            >
                                <span className={styles.confirmText}>
                                    Delete this key for good?
                                </span>
                                <Button
                                    type="button"
                                    variant="dark"
                                    small
                                    disabled={pending}
                                    onClick={confirm}
                                >
                                    Delete
                                </Button>
                                <Button
                                    type="button"
                                    variant="bordered"
                                    small
                                    disabled={pending}
                                    onClick={() => setAsking(false)}
                                >
                                    Cancel
                                </Button>
                            </span>
                        ) : (
                            error && (
                                <span className={styles.noteError} role="alert">
                                    {error}
                                </span>
                            )
                        )}
                    </td>
                </tr>
            )}
        </>
    );
};

export default AdminKeyRow;
