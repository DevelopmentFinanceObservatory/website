'use client';

import { useState, useTransition } from 'react';

import styles from './AdminApiKeys.module.scss';
import AdminLimitInput from './AdminLimitInput';
import { type AdminActions, type AdminRevealedKey, formatDay } from './AdminState';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import UsageMeter from '@/components/atoms/UsageMeter/UsageMeter';
import type { AdminKey } from '@/lib/apiKeys/service';

type AdminKeyRowProps = {
    keyData: AdminKey;
    actions: AdminActions;
    // Reloads the account's keys after a change.
    onChanged: () => void;
    // Hands the new key of a rotation up, to be shown once.
    onRevealed: (name: string, key: AdminRevealedKey) => void;
};

const RotateIcon = () => (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.iconSvg}>
        <path
            d="M15.5 10a5.5 5.5 0 1 1-1.8-4.07M15 3.5v3h-3"
            stroke="currentColor"
            strokeLinecap="square"
            strokeWidth="1.2"
        />
    </svg>
);

/** One key of an account: its name, today's MCP use against its daily limit, and rotate and delete. */
const AdminKeyRow = ({ keyData, actions, onChanged, onRevealed }: AdminKeyRowProps) => {
    const name = keyData.name || 'Unnamed';
    const [asking, setAsking] = useState<'rotate' | 'delete' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const confirm = () => {
        const kind = asking;

        startTransition(async () => {
            const result =
                kind === 'rotate'
                    ? await actions.rotateKey(keyData.id)
                    : await actions.deleteKey(keyData.id);

            if (!result.ok) {
                setError(result.error);
                setAsking(null);

                return;
            }

            if ('created' in result) {
                onRevealed(name, result.created);
            }

            onChanged();
        });
    };

    return (
        <tr className={styles.keyRow}>
            <td>
                <span className={styles.keyName}>{name}</span>
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
                        label="MCP calls today"
                        className={styles.meter}
                    />
                    <span className={styles.of}>of</span>
                    <AdminLimitInput
                        value={keyData.customDailyLimit}
                        placeholder={String(keyData.dailyLimit)}
                        label={`Daily MCP call limit for ${name}`}
                        save={(limit) => actions.setKeyLimit(keyData.id, limit)}
                        onSaved={onChanged}
                    />
                </div>
            </td>
            <td className={styles.keyActions}>
                {asking ? (
                    <span
                        className={styles.confirm}
                        role="group"
                        aria-label={`Confirm for ${name}`}
                    >
                        <span className={styles.confirmText}>
                            {asking === 'rotate'
                                ? 'Replace this key? The old one stops working.'
                                : 'Delete this key for good?'}
                        </span>
                        <Button
                            type="button"
                            variant="dark"
                            small
                            disabled={pending}
                            onClick={confirm}
                        >
                            {asking === 'rotate' ? 'Rotate' : 'Delete'}
                        </Button>
                        <Button
                            type="button"
                            variant="bordered"
                            small
                            disabled={pending}
                            onClick={() => setAsking(null)}
                        >
                            Cancel
                        </Button>
                    </span>
                ) : (
                    <>
                        <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={`Rotate ${name}`}
                            title="Rotate: make a new key and stop this one"
                            onClick={() => {
                                setError(null);
                                setAsking('rotate');
                            }}
                        >
                            <RotateIcon />
                        </button>
                        <button
                            type="button"
                            className={styles.iconButtonDanger}
                            aria-label={`Delete ${name}`}
                            title="Delete this key"
                            onClick={() => {
                                setError(null);
                                setAsking('delete');
                            }}
                        >
                            <Icon name="remove" />
                        </button>
                    </>
                )}
                {error && (
                    <span className={styles.noteError} role="alert">
                        {error}
                    </span>
                )}
            </td>
        </tr>
    );
};

export default AdminKeyRow;
