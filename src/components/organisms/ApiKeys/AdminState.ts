import type { AccountQuota, AdminKey } from '@/lib/apiKeys/service';

/** Users per page of the admin table. */
export const ADMIN_PAGE_SIZE = 50;

/** A key shown once, right after it is made. */
export type AdminRevealedKey = { id: string; key: string };

/** What the create action answers with: the new key, once, or why there is none. */
export type AdminKeyResult = { ok: true; created: AdminRevealedKey } | { ok: false; error: string };

/** One account's keys and its daily API quota, as the opened row loads them. */
export type AdminAccountKeys = { keys: AdminKey[]; quota: AccountQuota };

/** What the other actions answer with. */
export type AdminDoneResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * The admin page's server actions (src/app/(site)/admin/api-keys/actions),
 * handed down as props so the organism does not import from the app folder.
 */
export type AdminActions = {
    // The keys and daily quota of one account, or null when the lookup fails.
    loadKeys: (userId: string) => Promise<AdminAccountKeys | null>;
    createKey: (email: string, label: string) => Promise<AdminKeyResult>;
    deleteKey: (keyId: string) => Promise<AdminDoneResult>;
    // A key's own daily cap; empty text clears it, so the key spends only
    // its account's quota.
    setKeyLimit: (keyId: string, limit: string) => Promise<AdminDoneResult>;
    // Sets the account's API call count for today back to 0, its keys' caps
    // included.
    resetUsage: (userId: string) => Promise<AdminDoneResult>;
    // The account's per-minute limit; empty text clears it.
    setAccountLimit: (email: string, limit: string) => Promise<AdminDoneResult>;
    // The account's daily quota; empty text clears it.
    setAccountDailyLimit: (email: string, limit: string) => Promise<AdminDoneResult>;
};

/**
 * What an account may do on the site. `admin` is an account whose verified
 * email is in ADMIN_EMAILS (settings.isAdmin); every other account is
 * `standard`.
 */
export type AdminRole = 'admin' | 'standard';

export const ROLE_LABELS: Record<AdminRole, string> = {
    admin: 'Admin User',
    standard: 'Standard User',
};

/** One row of the user table: what the page passes to the client row. */
export type AdminUserView = {
    id: string;
    email: string;
    role: AdminRole;
    createdAt: Date;
    activeKeys: number;
    accountLimit: number | null;
    accountDailyLimit: number | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A moment as the tables show it, "18 Nov 2026 at 4:13PM", in UTC so server and browser agree. */
export const formatDateTime = (date: Date): string => {
    const hours = date.getUTCHours();
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} at ${hours % 12 || 12}:${minutes}${hours < 12 ? 'AM' : 'PM'}`;
};

/** A date as the key rows show it, "18 Nov 2026", in UTC. */
export const formatDay = (date: Date): string =>
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
