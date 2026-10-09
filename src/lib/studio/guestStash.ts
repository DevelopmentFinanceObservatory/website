/**
 * A guest's Studio session on its way through the sign-in (QA-58).
 *
 * A signed-out canvas is never saved — the history endpoints want an
 * account — so the navigation to /login used to end it. The page stashes
 * the same snapshot it would have saved in `sessionStorage` on the way out,
 * and Studio takes it back when it next mounts with an account behind it.
 *
 * `sessionStorage`, not local: the snapshot belongs to this tab's visit and
 * the OAuth round trip stays in it. A write that cannot happen (quota, a
 * canvas too large, storage disabled) leaves the session where it was —
 * lost, as before, never an error in front of the reader.
 */

import type { SavedConversation } from '../chat/history.ts';

type StashStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// The storage comes through a getter, called inside the `try`: reading
// `window.sessionStorage` itself throws where storage is disabled.

const KEY = 'studio-guest-session';

/** Keep `saved` for the trip through sign-in. A null snapshot (nothing
 *  asked yet) clears whatever an earlier one left. */
export const stashGuestSession = (
    storage: () => StashStorage,
    saved: SavedConversation | null,
): void => {
    try {
        const store = storage();

        if (!saved) {
            store.removeItem(KEY);

            return;
        }

        store.setItem(KEY, JSON.stringify(saved));
    } catch {
        // The session stays where it is. Nothing else to do.
    }
};

/** The stashed session, removed as it is read, or null when there is none
 *  worth reopening. */
export const takeGuestSession = (storage: () => StashStorage): SavedConversation | null => {
    try {
        const store = storage();
        const stored = store.getItem(KEY);

        store.removeItem(KEY);

        const saved: unknown = stored ? JSON.parse(stored) : null;

        return saved &&
            typeof saved === 'object' &&
            typeof (saved as SavedConversation).id === 'string' &&
            Array.isArray((saved as SavedConversation).messages) &&
            (saved as SavedConversation).messages.length > 0
            ? (saved as SavedConversation)
            : null;
    } catch {
        return null;
    }
};
