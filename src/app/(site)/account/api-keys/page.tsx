import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { createKey, deleteKey } from './actions';

import AccountApiKeys from '@/components/organisms/ApiKeys/AccountApiKeys';
import { keyService, requireUser } from '@/lib/apiKeys/server';
import { maxKeysPerAccount } from '@/lib/apiKeys/settings';
import { keysEnabled } from '@/lib/proxy/forward';
import { KEYED_LIMIT, WINDOW_S } from '@/lib/proxy/rateLimit';

export const metadata: Metadata = {
    title: 'API keys — DFO',
    robots: { index: false, follow: false },
};

// Account-only: a signed-out visitor is sent to sign in and back.
const AccountApiKeysPage = async () => {
    const user = await requireUser('/account/api-keys');
    const [keys, ownLimit] = await Promise.all([
        keyService.listOwn({ userId: user.id, headers: await headers() }),
        keyService.accountLimit(user.id),
    ]);

    return (
        <AccountApiKeys
            keys={keys}
            max={maxKeysPerAccount(process.env.API_KEYS_MAX_PER_ACCOUNT)}
            limit={ownLimit ?? KEYED_LIMIT}
            ownLimit={ownLimit !== null}
            windowSeconds={WINDOW_S}
            keysEnabled={keysEnabled()}
            createAction={createKey}
            deleteAction={deleteKey}
        />
    );
};

export default AccountApiKeysPage;
