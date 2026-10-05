/**
 * Seeds on their way from the search page to Studio. A seed runs to 420 KB,
 * too large for a URL, so the search page writes the seeds to
 * `sessionStorage` under a random token and puts the token in `/studio`'s
 * `seed` parameter. Studio takes them back once, for the first turn.
 *
 * Both sides treat a storage failure (quota, storage disabled, a token with
 * nothing behind it) as no seeds: Studio then opens on the question alone.
 */

import { uuid } from '../uuid.ts';
import type { Seed } from './wire.ts';

type SeedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

// Both functions take the storage through a getter, called inside their
// `try`: reading `window.sessionStorage` itself throws where storage is
// disabled.

const KEY_PREFIX = 'studio-seed:';

/**
 * Store `seeds` under a fresh token and return it, or null when there are no
 * seeds or the write fails. Seeds an earlier handoff left unread are cleared
 * first, so an abandoned handoff does not hold the tab's quota.
 */
export const writeSeeds = (storage: () => SeedStorage, seeds: Seed[]): string | null => {
    if (seeds.length === 0) {
        return null;
    }

    try {
        const store = storage();
        const stale = Array.from({ length: store.length }, (_, index) => store.key(index));

        for (const key of stale) {
            if (key?.startsWith(KEY_PREFIX)) {
                store.removeItem(key);
            }
        }

        const token = uuid();

        store.setItem(KEY_PREFIX + token, JSON.stringify(seeds));

        return token;
    } catch {
        return null;
    }
};

/**
 * The seeds stored under `token`, removed as they are read, or null when the
 * token names nothing readable.
 */
export const takeSeeds = (storage: () => SeedStorage, token: string): Seed[] | null => {
    try {
        const store = storage();
        const stored = store.getItem(KEY_PREFIX + token);

        store.removeItem(KEY_PREFIX + token);

        const seeds: unknown = stored ? JSON.parse(stored) : null;

        return Array.isArray(seeds) && seeds.length > 0 ? (seeds as Seed[]) : null;
    } catch {
        return null;
    }
};
