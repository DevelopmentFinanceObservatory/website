/** What the account panel's routes (src/app/api/account/api-keys) answer with. */

/**
 * One of the signed-in user's keys as the account panel receives it. Dates
 * are ISO strings, since they travel as JSON.
 */
export type KeyView = {
    id: string;
    name: string | null;
    start: string | null;
    createdAt: string;
    lastRequest: string | null;
    dailyLimit: number;
    usedToday: number;
};

/** What the account panel loads: who is signed in, their keys and the key cap. */
export type ApiKeysData = {
    user: { name: string; email: string };
    keys: KeyView[];
    maxKeys: number;
    // False while the emergency switch (API_KEYS_ENABLED) is off.
    keysEnabled: boolean;
};

/** A create answer: the new key, once, or why there is none. */
export type KeyIssued = { key: string } | { error: string };

/** A delete answer: why it did not delete, or null. */
export type KeyRemoved = { error: string | null };
