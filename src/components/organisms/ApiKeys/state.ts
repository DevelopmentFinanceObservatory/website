/** What the account panel's routes (src/app/api/account/api-keys) answer with. */

/**
 * One of the signed-in user's keys as the account panel receives it. Dates
 * are ISO strings, since they travel as JSON.
 */
export type KeyView = {
    id: string;
    name: string | null;
    start: string | null;
    // The key's last characters, null for a key made before they were kept.
    tail: string | null;
    createdAt: string;
    lastRequest: string | null;
    // The key's own cap on API calls per UTC day and today's count of it,
    // both null when the key has none.
    dailyCap: number | null;
    capUsedToday: number | null;
};

/**
 * What the account panel loads: who is signed in, the account's daily API
 * quota, which every key spends, their keys and the key cap.
 */
export type ApiKeysData = {
    user: { name: string; email: string };
    quota: { dailyLimit: number; usedToday: number };
    keys: KeyView[];
    maxKeys: number;
    // False while the emergency switch (API_KEYS_ENABLED) is off.
    keysEnabled: boolean;
};

/** A create answer: the new key, once, or why there is none. */
export type KeyIssued = { key: string } | { error: string };

/** A delete answer: why it did not delete, or null. */
export type KeyRemoved = { error: string | null };
