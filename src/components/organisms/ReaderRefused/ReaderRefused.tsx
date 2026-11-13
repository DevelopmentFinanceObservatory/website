import styles from './ReaderRefused.module.scss';
import SignOutButton from './SignOutButton';

import { REFUSAL_MESSAGES } from '@/lib/auth/reader';

type ReaderRefusedProps = {
    email: string;
    reason: 'email_not_verified' | 'domain_not_allowed';
};

/**
 * What a signed-in visitor the Graph Explorer refuses sees: who they are
 * signed in as, why they are refused, and a way to sign out and back in
 * with another account.
 */
const ReaderRefused = ({ email, reason }: ReaderRefusedProps) => (
    <main className={styles.section}>
        <div className={styles.box}>
            <h1 className={styles.title}>Team accounts only</h1>
            <p className={styles.lead}>
                {REFUSAL_MESSAGES[reason]} You are signed in as{' '}
                <span className={styles.email}>{email}</span>.
            </p>
            <div className={styles.actions}>
                <SignOutButton />
            </div>
        </div>
    </main>
);

export default ReaderRefused;
