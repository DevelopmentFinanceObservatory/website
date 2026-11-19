import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { auth } from '@/lib/auth/auth';
import { getUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

import { KEY_DAILY_LIMIT } from '@/lib/proxy/rateLimit';

import { createKeyService } from './service';
import { adminFrom, maxKeysPerAccount } from './settings';

/** The API key service on the site's own auth instance and database. */
export const keyService = createKeyService({
    auth,
    db,
    maxPerAccount: () => maxKeysPerAccount(process.env.API_KEYS_MAX_PER_ACCOUNT),
    defaultDailyLimit: () => KEY_DAILY_LIMIT,
});

/**
 * The signed-in user for an account page or action. A page sends a signed-out
 * visitor to sign in and back (`next`); an action has no page to send them
 * from, and answers null.
 */
export const requireUser = async (next: string) => {
    const user = await getUser();

    if (!user) {
        redirect(`/login?next=${encodeURIComponent(next)}`);
    }

    return user;
};

/**
 * The admin gate, checked on every admin page and every admin action, since
 * an action is a POST anyone can send. The admins are the signed-in users
 * whose verified email is in `ADMIN_EMAILS` (settings.isAdmin). Everyone
 * else, signed out included, gets the 404 page, not a 403, so a visitor
 * cannot tell the page exists. The list is read per call, so a change to it
 * needs only a new revision.
 */
export const requireAdmin = async () => {
    const admin = adminFrom(await getUser(), process.env.ADMIN_EMAILS);

    if (!admin) {
        notFound();
    }

    return admin;
};
