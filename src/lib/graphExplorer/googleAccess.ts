import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/lib/auth/auth';

import { chooseGoogleAccount, isUsableToken, type GoogleAccess } from './sheetsExport';

/**
 * The signed-in reader's Google access token for creating a sheet, or why
 * there is none. Better Auth lists the linked accounts with their granted
 * scopes and refreshes the token when it is about to expire and a refresh
 * token is stored. Any failure on the way reads as `token_unavailable`, so
 * the reader is offered the Google consent again.
 */
export const readGoogleAccess = async (): Promise<GoogleAccess> => {
    const requestHeaders = await headers();
    try {
        const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
        const account = chooseGoogleAccount(accounts);
        if (typeof account === 'string') return { kind: 'missing', reason: account };

        const token = await auth.api.getAccessToken({
            body: { accountId: account.id },
            headers: requestHeaders,
        });
        return isUsableToken(token, new Date())
            ? { kind: 'ready', accessToken: token.accessToken }
            : { kind: 'missing', reason: 'token_unavailable' };
    } catch {
        return { kind: 'missing', reason: 'token_unavailable' };
    }
};
