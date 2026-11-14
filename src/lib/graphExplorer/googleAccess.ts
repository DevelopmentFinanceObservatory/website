import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth/auth';

import { readGoogleAccessWith, type GoogleAccess } from './sheetsExport';

/**
 * The signed-in reader's Google access token for creating a sheet, or why
 * there is none (readGoogleAccessWith). Better Auth lists the linked
 * accounts with their granted scopes and renews the token when it is about
 * to expire and a refresh token is stored.
 */
export const readGoogleAccess = async (): Promise<GoogleAccess> => {
    const requestHeaders = await headers();
    return readGoogleAccessWith({
        listAccounts: () => auth.api.listUserAccounts({ headers: requestHeaders }),
        accessToken: (accountId) =>
            auth.api.getAccessToken({ body: { accountId }, headers: requestHeaders }),
        now: new Date(),
    });
};
