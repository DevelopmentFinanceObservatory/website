import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { captcha, emailOTP } from 'better-auth/plugins';

import { CLIENT_IP_HEADER } from './clientIp.ts';
import { codeLimitKeys, type Allowance, type CodeLimitKey } from './codeLimit.ts';
import {
    CODE_MINUTES,
    isThrowawayAddress,
    signInCodeMessage,
    type EmailSignInConfig,
} from './emailSignIn.ts';

export const SEND_CODE_PATH = '/email-otp/send-verification-otp';
export const CODE_SIGN_IN_PATH = '/sign-in/email-otp';

// The emailOTP plugin also serves email verification, password reset and
// change of email. None of them applies here, and each would be another way
// to send mail, so only sending a sign-in code and signing in with it stay.
const UNUSED_CODE_PATHS = [
    '/email-otp/check-verification-otp',
    '/email-otp/verify-email',
    '/email-otp/request-password-reset',
    '/forget-password/email-otp',
    '/email-otp/reset-password',
    '/email-otp/request-email-change',
    '/email-otp/change-email',
];

export type EmailSignInDeps = {
    /** Sends one message (lib/mail/smtp's sendMail on the site). */
    sendMail: (message: {
        from: string;
        to: string;
        subject: string;
        text: string;
        html: string;
    }) => Promise<void>;
    /** Counts one send against the caps (./codeLimit's takeCodeAllowance on the site). */
    takeAllowance: (keys: CodeLimitKey[]) => Promise<Allowance>;
    /** Where Turnstile tokens are checked, when not Cloudflare's own URL. */
    siteVerifyURL?: string;
};

/**
 * The Better Auth plugins and disabled paths for email-code sign-in (see
 * ./emailSignIn). A code is only sent after a Turnstile check passes (the
 * captcha plugin, which runs before any hook), for sign-in, never to a
 * throwaway domain, and within the per-inbox and per-network caps in
 * ./codeLimit. A code lasts CODE_MINUTES, takes three wrong tries, and is
 * stored encrypted under the auth secret. A send the mail server refuses
 * answers CODE_NOT_SENT.
 */
export const emailSignInOptions = (config: EmailSignInConfig, deps: EmailSignInDeps) => {
    // emailOTP awaits the send but logs and drops its error, then answers
    // success. The send records its request here and the guard's after
    // hook turns that into CODE_NOT_SENT. Requests reach the endpoint
    // through the /api/auth route, so each send has one.
    const unsent = new WeakSet<Request>();
    let warnedNoClientIp = false;

    const isSend = (ctx: { path?: string }) => ctx.path === SEND_CODE_PATH;

    const guard = {
        id: 'email-code-guard',
        hooks: {
            before: [
                {
                    matcher: isSend,
                    handler: createAuthMiddleware(async (ctx) => {
                        const { email, type } = (ctx.body ?? {}) as {
                            email?: unknown;
                            type?: unknown;
                        };

                        if (type !== 'sign-in') {
                            throw APIError.from('BAD_REQUEST', {
                                code: 'SIGN_IN_CODES_ONLY',
                                message: 'Only sign-in codes are sent.',
                            });
                        }

                        // Anything else is refused by the endpoint's own validation.
                        if (typeof email !== 'string') {
                            return;
                        }

                        if (isThrowawayAddress(email)) {
                            throw APIError.from('BAD_REQUEST', {
                                code: 'THROWAWAY_EMAIL',
                                message: 'Use a permanent email address.',
                            });
                        }

                        const clientIp = ctx.headers?.get(CLIENT_IP_HEADER) ?? null;

                        if (!clientIp && !warnedNoClientIp) {
                            warnedNoClientIp = true;
                            console.warn(
                                'sign-in code: no client IP, so these sends share one network cap. Check TRUSTED_PROXY_HOPS.',
                            );
                        }

                        const allowance = await deps.takeAllowance(
                            codeLimitKeys(ctx.context.secret, email, clientIp),
                        );

                        if (!allowance.ok) {
                            throw APIError.from('TOO_MANY_REQUESTS', {
                                code: 'TOO_MANY_CODES',
                                message: `Too many codes sent. Try again in ${Math.ceil(allowance.retryAfterS / 60)} minutes.`,
                            });
                        }
                    }),
                },
            ],
            after: [
                {
                    matcher: isSend,
                    handler: createAuthMiddleware(async (ctx) => {
                        if (ctx.request && unsent.has(ctx.request)) {
                            throw APIError.from('SERVICE_UNAVAILABLE', {
                                code: 'CODE_NOT_SENT',
                                message: 'The code could not be sent. Try again in a few minutes.',
                            });
                        }
                    }),
                },
            ],
        },
    } satisfies BetterAuthPlugin;

    return {
        disabledPaths: UNUSED_CODE_PATHS,
        plugins: [
            emailOTP({
                expiresIn: CODE_MINUTES * 60,
                allowedAttempts: 3,
                storeOTP: 'encrypted',
                sendVerificationOTP: async ({ email, otp }, ctx) => {
                    try {
                        await deps.sendMail({
                            from: config.from,
                            to: email,
                            ...signInCodeMessage(otp),
                        });
                    } catch (error) {
                        // Log the error fields, not its message, since a refusal quotes the recipient.
                        const { code, responseCode, command } = error as {
                            code?: string;
                            responseCode?: number;
                            command?: string;
                        };

                        console.error('sign-in code: send failed', { code, responseCode, command });

                        if (ctx?.request) {
                            unsent.add(ctx.request);
                        }
                    }
                },
            }),
            captcha({
                provider: 'cloudflare-turnstile',
                secretKey: config.turnstileSecretKey,
                endpoints: [SEND_CODE_PATH],
                siteVerifyURLOverride: deps.siteVerifyURL,
            }),
            guard,
        ],
    } satisfies Pick<BetterAuthOptions, 'disabledPaths' | 'plugins'>;
};
