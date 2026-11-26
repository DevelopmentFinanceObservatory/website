'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import styles from './AdminApiKeys.module.scss';
import AdminKeyRow from './AdminKeyRow';
import AdminLimitInput from './AdminLimitInput';
import type { AdminAccountKeys, AdminActions, AdminRevealedKey, AdminUserView } from './AdminState';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Spinner from '@/components/atoms/Spinner/Spinner';
import UsageMeter from '@/components/atoms/UsageMeter/UsageMeter';

type AdminUserKeysProps = {
    user: AdminUserView;
    defaultLimit: number;
    defaultDailyLimit: number;
    actions: AdminActions;
};

type Revealed = { title: string; key: AdminRevealedKey };

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

/**
 * The opened part of a user's row: their keys, the account's daily quota and
 * what to do with them. The keys and the quota load when it mounts and again
 * after every change. A new key is held
 * here, in this component's state, and nowhere else: close the row or leave
 * the page and it is gone. Only a hash is stored.
 */
const AdminUserKeys = ({ user, defaultLimit, defaultDailyLimit, actions }: AdminUserKeysProps) => {
    const { loadKeys, createKey } = actions;
    const [loaded, setLoaded] = useState<AdminAccountKeys | null>(null);
    const keys = loaded?.keys ?? null;
    const quota = loaded?.quota ?? null;
    const [resetError, setResetError] = useState<string | null>(null);
    const [resetting, startReset] = useTransition();
    const [failed, setFailed] = useState(false);
    const [revealed, setRevealed] = useState<Revealed | null>(null);
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const keyText = useRef<HTMLElement>(null);
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, startCreate] = useTransition();

    // A server action that throws (a database error) rejects; it reads as a
    // failed load, so the row says so and a key just shown stays on screen.
    const load = useCallback(() => loadKeys(user.id).catch(() => null), [loadKeys, user.id]);

    const reload = useCallback(async () => {
        const list = await load();

        setLoaded(list);
        setFailed(list === null);
    }, [load]);

    useEffect(() => {
        let current = true;

        void load().then((list) => {
            if (current) {
                setLoaded(list);
                setFailed(list === null);
            }
        });

        return () => {
            current = false;
        };
    }, [load]);

    const reveal = (title: string, key: AdminRevealedKey) => {
        setCopyState('idle');
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

    const reset = () => {
        setResetError(null);
        startReset(async () => {
            const result = await actions.resetUsage(user.id);

            if (!result.ok) {
                setResetError(result.error);

                return;
            }

            await reload();
        });
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(revealed?.key.key ?? '');
            setCopyState('copied');
        } catch {
            // Clipboard access can be refused: select the key so it can be copied by hand.
            setCopyState('failed');
            window.getSelection()?.selectAllChildren(keyText.current as Node);
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
                        <code ref={keyText} className={styles.onceKey} data-testid="new-key">
                            {revealed.key.key}
                        </code>
                        <button
                            type="button"
                            className={styles.iconButton}
                            aria-label="Copy key"
                            title="Copy key"
                            onClick={copy}
                        >
                            <Icon name="copy-small" />
                        </button>
                        <span className={styles.copyNote} aria-live="polite">
                            {copyState === 'copied' && 'Copied'}
                            {copyState === 'failed' && 'Select and copy'}
                        </span>
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
            {quota && (
                <div className={styles.usage}>
                    <UsageMeter
                        used={quota.usedToday}
                        limit={quota.dailyLimit}
                        label="API calls today, all keys"
                        layout="inline"
                        className={styles.meter}
                    />
                    <span className={styles.of}>
                        of {quota.dailyLimit.toLocaleString('en-GB')} today, all keys
                    </span>
                    <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Reset today's usage for ${user.email}`}
                        title="Reset today's usage to 0"
                        disabled={resetting}
                        onClick={reset}
                    >
                        {resetting ? <Spinner size={16} label="Resetting usage" /> : <ResetIcon />}
                    </button>
                    {resetError && (
                        <span className={styles.noteError} role="alert">
                            {resetError}
                        </span>
                    )}
                </div>
            )}
            {keys?.length === 0 && <p className={styles.hint}>No keys yet.</p>}
            {keys && keys.length > 0 && (
                <table className={styles.keyTable}>
                    <thead className={styles.visuallyHidden}>
                        <tr>
                            <th scope="col">Key</th>
                            <th scope="col">Daily cap</th>
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
                {/* The account's limits are apart from the keys: every key's
                    calls count against them, and against a key's own cap. */}
                <label className={styles.accountLimit}>
                    <span className={styles.toolLabel}>Rate limit for this account</span>
                    <span className={styles.accountLimitRow}>
                        <AdminLimitInput
                            value={user.accountLimit}
                            placeholder={`${defaultLimit.toLocaleString('en-GB')} default`}
                            label={`Per-minute API call limit for ${user.email}`}
                            save={(limit) => actions.setAccountLimit(user.email, limit)}
                        />
                        <span className={styles.accountLimitUnit}>
                            calls a minute, shared by all of this account&apos;s keys
                        </span>
                    </span>
                </label>
                <label className={styles.accountLimit}>
                    <span className={styles.toolLabel}>Daily quota for this account</span>
                    <span className={styles.accountLimitRow}>
                        <AdminLimitInput
                            value={user.accountDailyLimit}
                            placeholder={`${defaultDailyLimit.toLocaleString('en-GB')} default`}
                            label={`Daily API call quota for ${user.email}`}
                            save={(limit) => actions.setAccountDailyLimit(user.email, limit)}
                            onSaved={() => void reload()}
                        />
                        <span className={styles.accountLimitUnit}>
                            calls a UTC day, shared by all of this account&apos;s keys
                        </span>
                    </span>
                </label>
            </div>
        </div>
    );
};

export default AdminUserKeys;
