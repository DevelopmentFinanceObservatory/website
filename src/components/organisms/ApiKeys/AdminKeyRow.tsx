'use client';

import classNames from 'classnames';
import { useState, useTransition } from 'react';

import styles from './AdminApiKeys.module.scss';
import AdminLimitInput from './AdminLimitInput';
import { type AdminActions, formatDay } from './AdminState';
import { keySnippet } from './format';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Spinner from '@/components/atoms/Spinner/Spinner';
import UsageMeter from '@/components/atoms/UsageMeter/UsageMeter';
import type { AdminKey } from '@/lib/apiKeys/service';

type AdminKeyRowProps = {
    keyData: AdminKey;
    actions: AdminActions;
    // Reloads the account's keys after a change.
    onChanged: () => void;
    // Reloads all of the account's keys from the server, usage and limits included.
    reload: () => Promise<void>;
};

const ResetIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.iconSvg}>
        <path
            d="M15.5 10a5.5 5.5 0 1 1-1.8-4.07M15 3.5v3h-3"
            stroke="currentColor"
            strokeLinecap="square"
            strokeWidth="1.2"
        />
    </svg>
);

/** One key of an account: its name, today's API use against its daily limit, with reset and delete. */
const AdminKeyRow = ({ keyData, actions, onChanged, reload }: AdminKeyRowProps) => {
    const name = keyData.name || 'Unnamed';
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [resetting, startReset] = useTransition();

    const reset = () => {
        setError(null);
        startReset(async () => {
            const result = await actions.resetKeyUsage(keyData.id);

            if (!result.ok) {
                setError(result.error);

                return;
            }

            await reload();
        });
    };

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
            <tr className={classNames(styles.keyRow, open && styles.keyRowOpen)}>
                <td className={styles.keyCell}>
                    <span className={styles.keyName}>{name}</span>
                    <code className={styles.keySnippet}>
                        {keySnippet(keyData.start, keyData.tail)}
                    </code>
                    <span className={styles.keyCreated}>
                        <time dateTime={keyData.createdAt.toISOString()}>
                            {formatDay(keyData.createdAt)}
                        </time>
                    </span>
                </td>
                <td>
                    <div className={styles.usage}>
                        <UsageMeter
                            used={keyData.usedToday}
                            limit={keyData.dailyLimit}
                            label="API calls today"
                            className={styles.meter}
                        />
                        <span className={styles.of}>of</span>
                        <AdminLimitInput
                            value={keyData.customDailyLimit}
                            placeholder={String(keyData.dailyLimit)}
                            label={`Daily API call limit for ${name}`}
                            save={(limit) => actions.setKeyLimit(keyData.id, limit)}
                            onSaved={onChanged}
                        />
                    </div>
                </td>
                <td className={styles.keyActions}>
                    <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Reset today's usage for ${name}`}
                        title="Reset today's usage to 0"
                        disabled={resetting}
                        onClick={reset}
                    >
                        {resetting ? <Spinner size={16} label="Resetting usage" /> : <ResetIcon />}
                    </button>
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
                        <Icon name="remove" />
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
