// The internal-engineering allow-list, in its own module (no db or server-only
// imports) so src/lib/test/events-internal-eng.test.ts can run it under plain node.

/**
 * The allow-list from INTERNAL_ENG_EMAILS: comma-separated entries, each an
 * email address or a bare domain (`example.org`, with or without a leading
 * `@`). Entries are trimmed and lowercased and empty ones dropped. Unset
 * gives an empty list.
 */
export const parseInternalEng = (value: string | undefined): readonly string[] =>
    (value ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

/** The fields of a user the allow-list reads. */
export type InternalEngUser = { email?: string | null; emailVerified?: boolean | null };

/**
 * Whether a user is on the list: only a verified email counts, as for the
 * Graph Explorer (src/lib/auth/reader.ts), since an unverified address proves
 * nothing about who holds it. An entry with `@` in the middle matches the
 * address exactly. Any other entry matches the address's domain exactly, so a
 * subdomain or a longer name ending in the domain does not match.
 */
export const isInternalEng = (
    user: InternalEngUser | null | undefined,
    list: readonly string[],
): boolean => {
    if (!user?.email || user.emailVerified !== true) {
        return false;
    }

    const address = user.email.trim().toLowerCase();
    const domain = address.slice(address.lastIndexOf('@') + 1);

    return list.some((entry) =>
        entry.lastIndexOf('@') > 0 ? entry === address : entry.replace(/^@/, '') === domain,
    );
};

/**
 * The `Who` fields for an event that stays anonymous: the session's email
 * and verification flag, so `internal_eng` reads, and no user id, so
 * neither the event row nor PostHog gets an account.
 */
export const anonymousWho = (
    user: InternalEngUser | null | undefined,
): { userId: null; email: string | null; emailVerified: boolean | null } => ({
    userId: null,
    email: user?.email ?? null,
    emailVerified: user?.emailVerified ?? null,
});

/**
 * An event's props with `internal_eng` set from the user the caller names,
 * after the browser's own props so a caller cannot claim it. Synchronous, so
 * the event is logged before the first await.
 */
export const withInternalEng = (
    incoming: Record<string, unknown>,
    user: InternalEngUser | null | undefined,
    list: readonly string[],
): Record<string, unknown> => ({ ...incoming, internal_eng: isInternalEng(user, list) });
