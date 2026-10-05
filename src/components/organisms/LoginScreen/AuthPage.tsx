import { redirect } from 'next/navigation';

import LoginScreen from './LoginScreen';

import { providersEnabled } from '@/lib/auth/auth';
import { getSession } from '@/lib/auth/session';

/**
 * The server half of /login: reads `next` (only same-site paths — no open
 * redirect) and a possible OAuth `error`, and sends a signed-in visitor
 * straight on. Hands the page the providers this deployment has keys for.
 */
export type AuthPageProps = {
    searchParams: Promise<{ next?: string; error?: string }>;
};

const safeNext = (next?: string) =>
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/studio';

const AuthPage = async ({ searchParams }: AuthPageProps) => {
    const { next, error } = await searchParams;
    const target = safeNext(next);

    if (await getSession()) {
        redirect(target);
    }

    return <LoginScreen next={target} error={error} providers={providersEnabled} />;
};

export default AuthPage;
