import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { fromWebToken } from '@aws-sdk/credential-providers';
import nodemailer, { type Transporter } from 'nodemailer';

import { mintIdToken } from '../googleIdToken.ts';

/**
 * The deployed mail transport: the Amazon SES v2 API, signed with temporary
 * credentials for the role in SES_ROLE_ARN. No AWS secret exists. AWS STS
 * (AssumeRoleWithWebIdentity) trades the Cloud Run runtime service
 * account's Google ID token for the credentials. The role's trust policy
 * names that service account and requires the token's audience to be
 * TOKEN_AUDIENCE.
 *
 * The SES client holds the credentials until five minutes before they
 * expire and then asks for new ones, minting a fresh ID token for each
 * exchange (@aws-sdk/core's normalizeCredentialProvider memoizes a
 * `credentials` function with @smithy/core's memoizeIdentityProvider). So
 * the client, and the transport over it, live as long as the process.
 */

/** The audience the site requests its ID token for. The role's trust policy matches `accounts.google.com:oaud` against it. */
export const TOKEN_AUDIENCE = 'dfo-website-ses';

/** The STS role session name, which shows in the role owner's CloudTrail. */
export const ROLE_SESSION_NAME = 'dfo-website';

export type SesDeps = {
    /** Returns a Google ID token for the audience (the metadata server on the site). */
    idToken?: (audience: string) => Promise<string>;
    /** Where STS requests go, when not AWS's regional endpoint. */
    stsEndpoint?: string;
    /** Where SES requests go, when not AWS's regional endpoint. */
    sesEndpoint?: string;
    /** How long one STS or SES request may take in ms; tests shorten it. */
    requestTimeout?: number;
};

type CredentialOptions = Parameters<ReturnType<typeof fromWebToken>>[0];

export const sesTransport = (
    { roleArn, region }: { roleArn: string; region: string },
    {
        idToken = async (audience) => (await mintIdToken(audience)).token,
        stsEndpoint,
        sesEndpoint,
        requestTimeout = 10_000,
    }: SesDeps = {},
): Transporter => {
    // A sign-in code is sent while the visitor waits. Each STS or SES
    // request fails after 10 s (the handler only warns unless
    // throwOnRequestTimeout is set) and a failed request is tried once more.
    // A send therefore takes at most about 20 s with the credentials held,
    // and about 46 s when it also refreshes them (metadata 5 s, then STS and
    // SES at about 20 s each).
    const network = {
        region,
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 5_000, requestTimeout, throwOnRequestTimeout: true },
    };

    const credentials = async (options?: CredentialOptions) =>
        fromWebToken({
            roleArn,
            roleSessionName: ROLE_SESSION_NAME,
            webIdentityToken: await idToken(TOKEN_AUDIENCE),
            clientConfig: { ...network, ...(stsEndpoint && { endpoint: stsEndpoint }) },
        })(options);

    const sesClient = new SESv2Client({
        ...network,
        ...(sesEndpoint && { endpoint: sesEndpoint }),
        credentials,
    });

    return nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } });
};
