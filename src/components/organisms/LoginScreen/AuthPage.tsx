import { redirect } from 'next/navigation';

import LoginScreen from './LoginScreen';

import { emailSignIn, providersEnabled } from '@/lib/auth/auth';
import { CODE_MINUTES } from '@/lib/auth/emailSignIn';
import { safeNext } from '@/lib/auth/nextPath';
import { getSession } from '@/lib/auth/session';

/**
 * The server half of /login: reads `next` (only same-site paths — no open
 * redirect) and a possible OAuth `error`, and sends a signed-in visitor
 * straight on. Hands the page the providers this deployment has keys for,
 * and email sign-in's settings when it is on.
 */
export type AuthPageProps = {
    searchParams: Promise<{ next?: string; error?: string }>;
};

const AuthPage = async ({ searchParams }: AuthPageProps) => {
    const { next, error } = await searchParams;
    const target = safeNext(next);

    if (await getSession()) {
        redirect(target);
    }

    return (
        <LoginScreen
            next={target}
            error={error}
            providers={providersEnabled}
            emailSignIn={emailSignIn && { ...emailSignIn, codeMinutes: CODE_MINUTES }}
        />
    );
};

export default AuthPage;
