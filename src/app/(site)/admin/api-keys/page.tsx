import type { Metadata } from 'next';

import { adminCreateKey, adminDeleteKey, adminSetLimit } from './actions';

import AdminApiKeys from '@/components/organisms/ApiKeys/AdminApiKeys';
import { keyService, requireAdmin } from '@/lib/apiKeys/server';
import { limitNotice } from '@/lib/apiKeys/settings';
import { keysEnabled } from '@/lib/proxy/forward';
import { KEYED_LIMIT } from '@/lib/proxy/rateLimit';

export const metadata: Metadata = {
    title: 'API keys: admin — DFO',
    robots: { index: false, follow: false },
};

const one = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value) ?? '';

/**
 * Admin proof of concept: every API key across accounts. Admins are the
 * signed-in users whose verified email is in ADMIN_EMAILS; anyone else gets
 * the 404 page (requireAdmin). The actions check the gate again.
 */
const AdminApiKeysPage = async ({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
    await requireAdmin();

    const query = await searchParams;
    const filter = one(query.email).trim().slice(0, 320);

    return (
        <AdminApiKeys
            keys={await keyService.adminList(filter || undefined)}
            filter={filter}
            defaultLimit={KEYED_LIMIT}
            keysEnabled={keysEnabled()}
            notice={limitNotice(one(query.limit))}
            createAction={adminCreateKey}
            deleteAction={adminDeleteKey}
            limitAction={adminSetLimit}
        />
    );
};

export default AdminApiKeysPage;
