/**
 * Which way the site sends mail, read from env. Deployed, it is the Amazon
 * SES v2 API with temporary credentials for SES_ROLE_ARN (see ./ses), and
 * SES_ROLE_ARN, SES_REGION and SES_TOKEN_AUDIENCE together select it. Local
 * work uses SMTP against a catcher, selected by SMTP_HOST (see ./smtp). With
 * both set, SES wins.
 *
 * No imports, so client code that reads a sender's settings (AuthPage
 * through lib/auth/emailSignIn) pulls in no mail packages.
 */

export type MailTransport =
    | { kind: 'ses'; roleArn: string; region: string; tokenAudience: string }
    | { kind: 'smtp' }
    | { missing: string[] };

const SES_SETTINGS = ['SES_ROLE_ARN', 'SES_REGION', 'SES_TOKEN_AUDIENCE'] as const;

// Reported when no transport is configured at all.
const ANY_TRANSPORT = 'SES_ROLE_ARN/SES_REGION/SES_TOKEN_AUDIENCE or SMTP_HOST';

/**
 * The transport env selects, or the names to set to get one. Part of the
 * SES settings is reported as the rest missing, and turns mail off even
 * when SMTP_HOST is set, so a deployment never falls back to SMTP unnoticed.
 */
export const mailTransport = (env: Record<string, string | undefined>): MailTransport => {
    const [roleArn, region, tokenAudience] = SES_SETTINGS.map((name) => env[name]?.trim());

    if (roleArn && region && tokenAudience) {
        return { kind: 'ses', roleArn, region, tokenAudience };
    }

    const missing = SES_SETTINGS.filter((name) => !env[name]?.trim());

    if (missing.length < SES_SETTINGS.length) {
        return { missing };
    }

    return env.SMTP_HOST?.trim() ? { kind: 'smtp' } : { missing: [ANY_TRANSPORT] };
};
