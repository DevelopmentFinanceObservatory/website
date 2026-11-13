'use client';

import { useRouter } from 'next/navigation';

import Button from '@/components/atoms/Button/Button';
import { signOut } from '@/lib/auth/client';

/** Signs out and renders the page again, which now sends the visitor to sign in. */
const SignOutButton = () => {
    const router = useRouter();

    const leave = async () => {
        await signOut();
        router.refresh();
    };

    return (
        <Button variant="dark" icon="arrow" onClick={leave}>
            Sign Out
        </Button>
    );
};

export default SignOutButton;
