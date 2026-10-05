'use client';

import { useRouter } from 'next/navigation';

import styles from './GuestWall.module.scss';

import Button from '@/components/atoms/Button/Button';

// Free prompts before a guest has to sign in.
export const GUEST_LIMIT = 5;

/**
 * What a guest sees in place of the prompt once the free prompts are spent:
 * the count and the way in. Replaces the landing prompt and the chat's
 * follow-up input alike.
 */
const GuestWall = () => {
    const router = useRouter();

    return (
        <div className={styles.wall} role="status">
            <p className={styles.copy}>
                You&apos;ve used your {GUEST_LIMIT} free prompts. Sign in to keep exploring
                Studio.
            </p>
            <Button
                variant="dark"
                icon="arrow-up-right"
                onClick={() => router.push('/login?next=/studio')}
            >
                Sign in
            </Button>
        </div>
    );
};

export default GuestWall;
