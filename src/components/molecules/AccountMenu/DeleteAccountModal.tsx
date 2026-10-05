'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from './DeleteAccountModal.module.scss';
// The modals' shared field styles (label / input) — same face everywhere.
import form from '@/components/organisms/Studio/modals/TextCardModal.module.scss';

import Modal from '@/components/molecules/Modal/Modal';
import { deleteUser } from '@/lib/auth/client';

// What the user types to confirm — there is no password to ask for.
const CONFIRM_WORD = 'DELETE';

/**
 * Delete account — the house panel with the consequences spelled out and a
 * typed confirmation. Accounts are social-only, so Better Auth guards the
 * deletion with session freshness instead of a password: a sign-in from
 * long ago has to be renewed first, and the page says so.
 * On success the session is gone; we land on the homepage.
 */
type DeleteAccountModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const ERRORS: Record<string, string> = {
    SESSION_EXPIRED: 'Please sign out and sign in again, then delete your account.',
};

const DeleteAccountModal = ({ open, onOpenChange }: DeleteAccountModalProps) => {
    const router = useRouter();
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);
    const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (busy || !confirmed) {
            return;
        }

        setBusy(true);
        setFailed(null);

        const { error } = await deleteUser({});

        if (error) {
            setBusy(false);
            setFailed(ERRORS[error.code ?? ''] ?? error.message ?? 'Something went wrong.');

            return;
        }

        // The account (and its session) is gone — home, with the header re-read.
        onOpenChange(false);
        router.push('/');
        router.refresh();
    };

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Delete account" fit>
            <form className={form.form} onSubmit={submit}>
                <p className={styles.copy}>
                    This removes your account, every conversation and canvas saved to it, and every
                    share link you created. It can&apos;t be undone.
                </p>
                <label className={form.field}>
                    <span className={form.label}>Type {CONFIRM_WORD} to confirm</span>
                    <input
                        className={form.input}
                        type="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        required
                        value={typed}
                        placeholder={CONFIRM_WORD}
                        onChange={(event) => setTyped(event.target.value)}
                    />
                </label>
                {failed && (
                    <p className={styles.error} role="alert">
                        {failed}
                    </p>
                )}
                <button type="submit" className={styles.danger} disabled={busy || !confirmed}>
                    {busy ? 'Deleting…' : 'Delete my account'}
                </button>
            </form>
        </Modal>
    );
};

export default DeleteAccountModal;
