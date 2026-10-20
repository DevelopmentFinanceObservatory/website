import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';

import { db } from '@/lib/db';
import * as schema from '../../../db/schema';
import { track } from '@/lib/events/track';

/** The sign-in providers, in the order the login page lists them. */
export type Provider = 'google' | 'github' | 'microsoft';

const keys = (name: string) => {
    const clientId = process.env[`${name}_CLIENT_ID`];
    const clientSecret = process.env[`${name}_CLIENT_SECRET`];

    return clientId && clientSecret ? { clientId, clientSecret } : null;
};

const google = keys('GOOGLE');
const github = keys('GITHUB');
const microsoft = keys('MICROSOFT');

/** The providers whose OAuth keys are set — the login page shows only these,
 *  so a deployment missing a key degrades to fewer buttons, not a broken one. */
export const providersEnabled: Provider[] = [
    ...(google ? (['google'] as const) : []),
    ...(github ? (['github'] as const) : []),
    ...(microsoft ? (['microsoft'] as const) : []),
];

/**
 * Server-side auth (Better Auth on our own Postgres via Drizzle). Sign-in is
 * social only — Google, GitHub or Microsoft; there is no password, so
 * nothing to reset, verify or leak. Accounts still live in OUR database
 * (the `user` row plus one `account` row per provider); sessions are
 * httpOnly cookies handled by the /api/auth/* route.
 */
export const auth = betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    // Sign-in from a LAN device in dev (see DEV_ORIGINS in next.config): the
    // request origin isn't the baseURL, so it has to be trusted explicitly.
    trustedOrigins: (process.env.DEV_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((host) => `http://${host}:3000`),
    emailAndPassword: { enabled: false },
    socialProviders: {
        ...(google && { google }),
        ...(github && { github }),
        // 'common': personal and work/school Microsoft accounts alike.
        ...(microsoft && { microsoft: { ...microsoft, tenantId: 'common' } }),
    },
    account: {
        // The same person arriving through a second provider, or someone who
        // once had a password account under this email, gets the one user
        // row, not a duplicate. Google and GitHub return only verified emails,
        // so they link on email alone. Microsoft under 'common' passes through
        // whatever address an Entra tenant admin set, which can be anyone's,
        // so it links only when its ID token marks the email verified
        // (verified_primary_email / verified_secondary_email). Otherwise the
        // sign-in fails with account_not_linked.
        accountLinking: {
            enabled: true,
            trustedProviders: ['google', 'github'],
        },
    },
    user: {
        // Delete account (account menu). With no password to confirm with,
        // Better Auth asks for a fresh session instead (session.freshAge).
        deleteUser: { enabled: true },
    },
    // No cookie cache: every check hits the database, so a session removed
    // there (sign-out elsewhere, a wipe) is gone immediately — nothing to
    // wait out. Cheap on our own Postgres; revisit for scale.
    session: {
        cookieCache: { enabled: false },
    },
    hooks: {
        // A provider callback that ended in a session is a sign-in — the
        // usage event carries the provider, nothing else.
        after: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.newSession;

            if (session && ctx.path.startsWith('/callback/')) {
                await track(
                    'auth.signin',
                    { provider: ctx.params?.id ?? null },
                    { userId: session.user.id, headers: ctx.headers ?? null },
                );
            }
        }),
    },
    // Lets server actions / route handlers set the session cookie.
    plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
