import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';

import { counterDb, db } from '@/lib/db';
import * as schema from '../../../db/schema';
import { CLIENT_IP_HEADER } from '@/lib/auth/clientIp';
import { takeCodeAllowance } from '@/lib/auth/codeLimit';
import { emailSignInConfig } from '@/lib/auth/emailSignIn';
import { CODE_SIGN_IN_PATH, emailSignInOptions } from '@/lib/auth/emailSignInOptions';
import { track } from '@/lib/events/track';
import { sendMail } from '@/lib/mail/send';

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

const emailConfig = emailSignInConfig(process.env);

if ('missing' in emailConfig && process.env.AUTH_EMAIL_FROM) {
    console.warn(`Email sign-in is off: ${emailConfig.missing.join(', ')} unset.`);
}

/** What /login needs to offer email sign-in, or null when it is off (see lib/auth/emailSignIn). */
export const emailSignIn =
    'missing' in emailConfig ? null : { turnstileSiteKey: emailConfig.turnstileSiteKey };

const emailOptions =
    'missing' in emailConfig
        ? null
        : emailSignInOptions(emailConfig, {
              sendMail,
              takeAllowance: (keys) => takeCodeAllowance(counterDb, keys),
          });

/**
 * Server-side auth (Better Auth on our own Postgres via Drizzle). Sign-in is
 * through Google, GitHub or Microsoft or, where it is configured, with a
 * six-digit code sent by email. There is no password, so nothing to reset
 * or leak. Accounts live in OUR database (the `user` row plus one
 * `account` row per provider); sessions are httpOnly cookies handled by
 * the /api/auth/* route. The email code's plugins and safeguards are in
 * lib/auth/emailSignInOptions.
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
        // row, not a duplicate. A provider links to an existing user only
        // when it marks the address verified (Google's email_verified,
        // GitHub's verified flag from its emails API, Microsoft's
        // verified_primary_email / verified_secondary_email). Otherwise the
        // sign-in fails with account_not_linked. An email code proves the
        // inbox, so it signs in to the user row with that address. When that
        // row's email was never verified, Better Auth first revokes the
        // access that never proved it.
        accountLinking: {
            enabled: true,
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
    // The client IP for rate limits, Turnstile and session rows, set by the
    // /api/auth route from the trusted X-Forwarded-For entry.
    advanced: {
        ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    disabledPaths: emailOptions?.disabledPaths ?? [],
    hooks: {
        // A provider callback or an email code that ended in a session is a
        // sign-in. The usage event carries the provider only.
        after: createAuthMiddleware(async (ctx) => {
            const session = ctx.context.newSession;

            if (!session) {
                return;
            }

            const who = { userId: session.user.id, headers: ctx.headers ?? null };

            if (ctx.path.startsWith('/callback/')) {
                await track('auth.signin', { provider: ctx.params?.id ?? null }, who);
            } else if (ctx.path === CODE_SIGN_IN_PATH) {
                await track('auth.signin', { provider: 'email' }, who);
            }
        }),
    },
    plugins: [
        ...(emailOptions?.plugins ?? []),
        // Lets server actions / route handlers set the session cookie. Last,
        // as Better Auth asks.
        nextCookies(),
    ],
});

export type Session = typeof auth.$Infer.Session;
