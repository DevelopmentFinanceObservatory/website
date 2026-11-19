import type { Metadata } from 'next';

import {
    adminCreateKey,
    adminDeleteKey,
    adminLoadKeys,
    adminResetKeyUsage,
    adminSetKeyLimit,
    adminSetLimit,
} from './actions';

import AdminApiKeys from '@/components/organisms/ApiKeys/AdminApiKeys';
import { ADMIN_PAGE_SIZE } from '@/components/organisms/ApiKeys/AdminState';
import { keyService, requireAdmin } from '@/lib/apiKeys/server';
import { keysEnabled } from '@/lib/proxy/forward';
import { KEYED_LIMIT } from '@/lib/proxy/rateLimit';

export const metadata: Metadata = {
    title: 'User management — DFO',
    robots: { index: false, follow: false },
};

const one = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value) ?? '';

const actions = {
    loadKeys: adminLoadKeys,
    createKey: adminCreateKey,
    deleteKey: adminDeleteKey,
    setKeyLimit: adminSetKeyLimit,
    resetKeyUsage: adminResetKeyUsage,
    setAccountLimit: adminSetLimit,
};

/**
 * The operators' view of accounts and their MCP keys. Admins are the
 * signed-in users whose verified email is in ADMIN_EMAILS; anyone else gets
 * the 404 page (requireAdmin). The actions check the gate again.
 */
const AdminApiKeysPage = async ({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
    await requireAdmin();

    const params = await searchParams;
    const query = one(params.q).trim().slice(0, 320);
    const requested = Number.parseInt(one(params.page), 10);
    const page = Number.isSafeInteger(requested) && requested >= 1 ? requested : 1;

    const { total, matched, users } = await keyService.adminListUsers({
        query: query || undefined,
        offset: (page - 1) * ADMIN_PAGE_SIZE,
        limit: ADMIN_PAGE_SIZE,
    });

    return (
        <AdminApiKeys
            users={users}
            total={total}
            matched={matched}
            query={query}
            page={page}
            defaultLimit={KEYED_LIMIT}
            keysEnabled={keysEnabled()}
            actions={actions}
        />
    );
};

export default AdminApiKeysPage;
