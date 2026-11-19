import type { AdminKey } from '@/lib/apiKeys/service';

/** Users per page of the admin table. */
export const ADMIN_PAGE_SIZE = 50;

/** A key shown once, right after it is made. */
export type AdminRevealedKey = { id: string; key: string };

/** What the create action answers with: the new key, once, or why there is none. */
export type AdminKeyResult = { ok: true; created: AdminRevealedKey } | { ok: false; error: string };

/** What the other actions answer with. */
export type AdminDoneResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * The admin page's server actions (src/app/(site)/admin/api-keys/actions),
 * handed down as props so the organism does not import from the app folder.
 */
export type AdminActions = {
    // The keys of one account, or null when the lookup fails.
    loadKeys: (userId: string) => Promise<AdminKey[] | null>;
    createKey: (email: string, label: string) => Promise<AdminKeyResult>;
    deleteKey: (keyId: string) => Promise<AdminDoneResult>;
    // Empty text clears the key's own limit, which puts it back on the default.
    setKeyLimit: (keyId: string, limit: string) => Promise<AdminDoneResult>;
    // The account's per-minute limit; empty text clears it.
    setAccountLimit: (email: string, limit: string) => Promise<AdminDoneResult>;
};

/** One row of the user table: what the page passes to the client row. */
export type AdminUserView = {
    id: string;
    email: string;
    createdAt: Date;
    activeKeys: number;
    accountLimit: number | null;
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
