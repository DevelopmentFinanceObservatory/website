'use server';

import { getUser } from '@/lib/auth/session';

import { adminFrom } from './settings';

/**
 * Whether the signed-in viewer is an admin (settings.isAdmin: a verified
 * email on ADMIN_EMAILS), so the account menu can show its link to
 * /admin/api-keys. It answers only about the caller, and false when signed
 * out. The link is a convenience: the admin page and every admin action
 * check the gate themselves (server.requireAdmin).
 */
export const viewerIsAdmin = async (): Promise<boolean> =>
    adminFrom(await getUser(), process.env.ADMIN_EMAILS) !== null;
