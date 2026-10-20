/**
 * Which way the site sends mail, read from env. Deployed, it is the Amazon
 * SES v2 API with temporary credentials for SES_ROLE_ARN (see ./ses), and
 * SES_ROLE_ARN with SES_REGION selects it. Local work uses SMTP against a
 * catcher, selected by SMTP_HOST (see ./smtp). With both set, SES wins.
 *
 * No imports, so client code that reads a sender's settings (AuthPage
 * through lib/auth/emailSignIn) pulls in no mail packages.
 */

export type MailTransport =
    { kind: 'ses'; roleArn: string; region: string } | { kind: 'smtp' } | { missing: string[] };

// Reported when no transport is configured at all.
const ANY_TRANSPORT = 'SES_ROLE_ARN/SES_REGION or SMTP_HOST';

/**
 * The transport env selects, or the names to set to get one. Half of the
 * SES pair is reported as the other half missing, and turns mail off even
 * when SMTP_HOST is set, so a deployment never falls back to SMTP unnoticed.
 */
export const mailTransport = (env: Record<string, string | undefined>): MailTransport => {
    const roleArn = env.SES_ROLE_ARN?.trim();
    const region = env.SES_REGION?.trim();

    if (roleArn && region) {
        return { kind: 'ses', roleArn, region };
    }

    if (roleArn || region) {
        return { missing: [roleArn ? 'SES_REGION' : 'SES_ROLE_ARN'] };
    }

    return env.SMTP_HOST?.trim() ? { kind: 'smtp' } : { missing: [ANY_TRANSPORT] };
};
