import { NextResponse } from 'next/server';

import { adminFrom } from '@/lib/apiKeys/settings';
import { getUser } from '@/lib/auth/session';

// GET /api/account/admin → { admin: boolean }, whether the signed-in viewer is
// an admin (lib/apiKeys/settings.isAdmin: a verified email on ADMIN_EMAILS),
// so the account menu can show its link to /admin/api-keys. It answers only
// about the caller, and false when signed out. The link is a convenience: the
// admin page and every admin action check the gate themselves
// (lib/apiKeys/server.requireAdmin). A route rather than a server action, since
// the account menu is also built into the prototypes app's static export,
// which refuses server actions.
export const GET = async () => {
    const admin = adminFrom(await getUser(), process.env.ADMIN_EMAILS) !== null;

    return NextResponse.json({ admin }, { headers: { 'cache-control': 'private, no-store' } });
};
