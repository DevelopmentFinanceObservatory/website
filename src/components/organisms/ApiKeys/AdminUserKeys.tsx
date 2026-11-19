'use client';

import { type FormEvent, useCallback, useEffect, useState, useTransition } from 'react';

import styles from './AdminApiKeys.module.scss';
import AdminKeyRow from './AdminKeyRow';
import AdminLimitInput from './AdminLimitInput';
import type { AdminActions, AdminRevealedKey, AdminUserView } from './AdminState';

import Button from '@/components/atoms/Button/Button';
import type { AdminKey } from '@/lib/apiKeys/service';

type AdminUserKeysProps = {
    user: AdminUserView;
    defaultLimit: number;
    actions: AdminActions;
};

type Revealed = { title: string; key: AdminRevealedKey };

/**
 * The opened part of a user's row: their keys and what to do with them. The
 * keys load when it mounts and again after every change. A new key is held
 * here, in this component's state, and nowhere else: close the row or leave
 * the page and it is gone. Only a hash is stored.
 */
const AdminUserKeys = ({ user, defaultLimit, actions }: AdminUserKeysProps) => {
    const { loadKeys, createKey } = actions;
    const [keys, setKeys] = useState<AdminKey[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [revealed, setRevealed] = useState<Revealed | null>(null);
    const [copied, setCopied] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, startCreate] = useTransition();

    const reload = useCallback(async () => {
        const list = await loadKeys(user.id);

        setKeys(list);
        setFailed(list === null);
    }, [loadKeys, user.id]);

    useEffect(() => {
        let current = true;

        void loadKeys(user.id).then((list) => {
            if (current) {
                setKeys(list);
                setFailed(list === null);
            }
        });

        return () => {
            current = false;
        };
    }, [loadKeys, user.id]);

    const reveal = (title: string, key: AdminRevealedKey) => {
        setCopied(false);
        setRevealed({ title, key });
    };

    const create = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const form = event.currentTarget;
        const label = new FormData(form).get('label');

        setCreateError(null);
        startCreate(async () => {
            const result = await createKey(user.email, typeof label === 'string' ? label : '');

            if (!result.ok) {
                setCreateError(result.error);

                return;
            }

            form.reset();
            reveal(`New key for ${user.email}`, result.created);
            await reload();
        });
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(revealed?.key.key ?? '');
            setCopied(true);
        } catch {
            // Clipboard access can be refused; the key is selectable where it is shown.
            setCopied(false);
        }
    };

    return (
        <div className={styles.keys}>
            {revealed && (
                <div className={styles.once} role="status">
                    <p className={styles.onceTitle}>
                        {revealed.title}. Copy it now, it is shown once.
                    </p>
                    <div className={styles.onceRow}>
                        <code className={styles.onceKey} data-testid="new-key">
                            {revealed.key.key}
                        </code>
                        <Button type="button" variant="dark" small icon="copy-small" onClick={copy}>
                            {copied ? 'Copied' : 'Copy'}
                        </Button>
                        <Button
                            type="button"
                            variant="bordered"
                            small
                            onClick={() => setRevealed(null)}
                        >
                            Done
                        </Button>
                    </div>
                </div>
            )}

            {keys === null && !failed && <p className={styles.hint}>Loading keys…</p>}
            {failed && (
                <p className={styles.noteError} role="alert">
                    The keys did not load. Close the row and open it again.
                </p>
            )}
            {keys?.length === 0 && <p className={styles.hint}>No keys yet.</p>}
            {keys && keys.length > 0 && (
                <table className={styles.keyTable}>
                    <thead>
                        <tr>
                            <th scope="col">Key</th>
                            <th scope="col">MCP calls today</th>
                            <th scope="col">
                                <span className={styles.visuallyHidden}>Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map((key) => (
                            <AdminKeyRow
                                key={key.id}
                                keyData={key}
                                actions={actions}
                                onChanged={() => void reload()}
                                onRevealed={reveal}
                            />
                        ))}
                    </tbody>
                </table>
            )}

            <div className={styles.tools}>
                <form className={styles.create} onSubmit={create}>
                    <label className={styles.toolField}>
                        <span className={styles.toolLabel}>Create key</span>
                        <input
                            className={styles.toolInput}
                            type="text"
                            name="label"
                            required
                            maxLength={32}
                            autoComplete="off"
                            placeholder="Key name, e.g. notebook"
                        />
                    </label>
                    <Button type="submit" variant="dark" small disabled={creating}>
                        {creating ? 'Creating…' : 'Create'}
                    </Button>
                    {createError && (
                        <span className={styles.noteError} role="alert">
                            {createError}
                        </span>
                    )}
                </form>
                <label className={styles.toolField}>
                    <span className={styles.toolLabel}>Per-minute limit (all keys)</span>
                    <AdminLimitInput
                        value={user.accountLimit}
                        placeholder={`${defaultLimit.toLocaleString('en-GB')} default`}
                        label={`Per-minute MCP call limit for ${user.email}`}
                        save={(limit) => actions.setAccountLimit(user.email, limit)}
                    />
                </label>
            </div>
        </div>
    );
};

export default AdminUserKeys;
