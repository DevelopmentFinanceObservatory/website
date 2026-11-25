import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { auth } from '@/lib/auth/auth';
import { getUser } from '@/lib/auth/session';
import { db } from '@/lib/db';

import { tagSecrets } from '@/lib/auth/keyTag';
import { ACCOUNT_DAILY_LIMIT, KEYED_LIMIT } from '@/lib/proxy/rateLimit';

import { createKeyService } from './service';
import { adminFrom, maxKeysPerAccount } from './settings';

// Whether API_KEY_TAG_SECRETS holds a usable list. Without one, a key cannot
// be signed, and src/instrumentation.ts lets production start so while keys
// are switched off.
const tagSecretsSet = (): boolean => {
    try {
        tagSecrets();

        return true;
    } catch {
        return false;
    }
};

/** The API key service on the site's own auth instance and database. */
export const keyService = createKeyService({
    auth,
    db,
    maxPerAccount: () => maxKeysPerAccount(process.env.API_KEYS_MAX_PER_ACCOUNT),
    defaultDailyLimit: () => ACCOUNT_DAILY_LIMIT,
    defaultRateLimit: () => KEYED_LIMIT,
    canMint: tagSecretsSet,
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
 * else, signed out included, gets a 404 and none of the page. `notFound()`
 * thrown here answers with Next's error shell, whose server HTML differs from
 * the 404 of a URL that matches no route (it lacks the root layout's consent
 * scripts), so a visitor who compares the two can tell the route exists. The
 * list is read per call, so a change to it needs only a new revision.
 */
export const requireAdmin = async () => {
    const admin = adminFrom(await getUser(), process.env.ADMIN_EMAILS);

    if (!admin) {
        notFound();
    }

    return admin;
};
