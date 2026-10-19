import { disposableEmailBlocklistSet } from 'disposable-email-domains-js';

/**
 * Email-code sign-in. /login sends a six-digit code to the address and the
 * visitor types it back (Better Auth's emailOTP plugin, wired in ./auth).
 * This module holds the parts that need no server: the settings it runs
 * on, the throwaway-address check and the email itself.
 */

/** Minutes a code stays valid. Some corporate mail gateways hold a message for a few minutes before delivering it. */
export const CODE_MINUTES = 10;

export type EmailSignInConfig = {
    /** The From header, e.g. `DFO Studio <studio@developmentfinance.org>`. */
    from: string;
    turnstileSiteKey: string;
    turnstileSecretKey: string;
};

const REQUIRED = ['SMTP_HOST', 'AUTH_EMAIL_FROM', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'];

/**
 * The settings email sign-in runs on, or the names of the ones missing.
 * It needs a way to send mail and a Turnstile check in front of every send,
 * so with any of them unset it stays off and no code is sent without the
 * bot check.
 */
export const emailSignInConfig = (
    env: Record<string, string | undefined>,
): EmailSignInConfig | { missing: string[] } => {
    const missing = REQUIRED.filter((name) => !env[name]?.trim());

    if (missing.length > 0) {
        return { missing };
    }

    return {
        from: env.AUTH_EMAIL_FROM!.trim(),
        turnstileSiteKey: env.TURNSTILE_SITE_KEY!.trim(),
        turnstileSecretKey: env.TURNSTILE_SECRET_KEY!.trim(),
    };
};

// The community list PyPI uses (disposable-email-domains/disposable-email-domains), built once.
const THROWAWAY_DOMAINS = disposableEmailBlocklistSet();

/**
 * Whether `email` is at a throwaway-mail domain, or at a subdomain of one
 * (`x.mailinator.com` counts as `mailinator.com`).
 */
export const isThrowawayAddress = (email: string): boolean => {
    const labels = email
        .slice(email.lastIndexOf('@') + 1)
        .trim()
        .toLowerCase()
        .split('.');

    for (let start = 0; start < labels.length - 1; start++) {
        if (THROWAWAY_DOMAINS.has(labels.slice(start).join('.'))) {
            return true;
        }
    }

    return false;
};

/**
 * The sign-in email. It carries the code and nothing to click, so a
 * look-alike with a link stands out, and the From address takes no replies.
 */
export const signInCodeMessage = (
    code: string,
): { subject: string; text: string; html: string } => ({
    subject: `${code} is your DFO Studio sign-in code`,
    text: [
        'Your sign-in code for DFO Studio is:',
        '',
        code,
        '',
        `It expires in ${CODE_MINUTES} minutes. If you did not ask for it, you can ignore this email: nobody can sign in without the code.`,
        '',
        'This address does not receive replies.',
        'Development Finance Observatory',
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#f6f5ef;font-family:Helvetica,Arial,sans-serif;color:#1f2420;">
    <div style="max-width:420px;margin:0 auto;padding:28px;background:#ffffff;border-radius:10px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Your sign-in code for DFO Studio is:</p>
      <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:6px;">${code}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">It expires in ${CODE_MINUTES} minutes. If you did not ask for it, you can ignore this email: nobody can sign in without the code.</p>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#6b6f68;">This address does not receive replies. Development Finance Observatory</p>
    </div>
  </body>
</html>`,
});
