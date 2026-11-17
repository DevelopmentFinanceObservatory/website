/**
 * The settings and input rules of the API key pages (account and admin),
 * apart from the code that stores keys so `node --test` loads them with no
 * database. docs/design/api-keys.md, "Phases", is the background.
 */

const DEFAULT_MAX_PER_ACCOUNT = 5;

/**
 * How many keys one account may hold, from `API_KEYS_MAX_PER_ACCOUNT`.
 * Limits are per account, so this is housekeeping and not a security
 * control: a second key buys no more calls. A value that is not a whole
 * number of at least 1 gives the default.
 */
export const maxKeysPerAccount = (value: string | undefined): number => {
    const parsed = Number(value?.trim());

    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_MAX_PER_ACCOUNT;
};

/**
 * The admins' addresses from `ADMIN_EMAILS` (comma-separated), trimmed and
 * lowercased, empty entries dropped. Unset or empty names nobody.
 */
export const parseAdminEmails = (value: string | undefined): ReadonlySet<string> =>
    new Set(
        (value ?? '')
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
    );

/** The fields of a session's user the admin gate reads. */
export type AdminCandidate = { id: string; email: string; emailVerified: boolean };

/**
 * Whether the signed-in user is an admin: their address is on the list,
 * whatever the case, and the sign-in proved it. An unverified address could
 * be anyone's, so it never admits.
 */
export const isAdmin = (
    user: AdminCandidate | null | undefined,
    admins: ReadonlySet<string>,
): boolean => !!user && user.emailVerified === true && admins.has(user.email.trim().toLowerCase());

/**
 * The admin gate's decision from the session's user and `ADMIN_EMAILS` as
 * set: who the admin is, or null for anyone else, which the page and action
 * answer with a 404. Signed out, an empty list and an unlisted address all
 * give null.
 */
export const adminFrom = (
    user: AdminCandidate | null | undefined,
    adminEmails: string | undefined,
): { id: string; email: string } | null =>
    user && isAdmin(user, parseAdminEmails(adminEmails))
        ? { id: user.id, email: user.email }
        : null;

/** The longest key label: the plugin's own bound on a key's name. */
export const MAX_LABEL_LENGTH = 32;

/** A label as typed: trimmed, 1 to MAX_LABEL_LENGTH characters, no control characters; else null. */
export const parseLabel = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const label = value.trim();

    return label.length >= 1 &&
        label.length <= MAX_LABEL_LENGTH &&
        !/[\u0000-\u001f\u007f]/.test(label)
        ? label
        : null;
};

/** The largest limit the `user.api_rate_limit` column (a 32-bit integer) holds. */
export const MAX_LIMIT = 2_147_483_647;

export type LimitInput = { ok: true; limit: number | null } | { ok: false };

/**
 * An account limit as typed in the admin form: a positive whole number, or
 * empty to clear it (the deployment default, RATE_LIMIT_KEYED, applies).
 */
export const parseLimitInput = (value: unknown): LimitInput => {
    if (typeof value !== 'string') {
        return { ok: false };
    }

    const text = value.trim();

    if (text === '') {
        return { ok: true, limit: null };
    }

    if (!/^\d{1,10}$/.test(text)) {
        return { ok: false };
    }

    const limit = Number(text);

    return limit >= 1 && limit <= MAX_LIMIT ? { ok: true, limit } : { ok: false };
};

/** An email as typed in an admin form: trimmed and lowercased, and shaped like an address; else null. */
export const parseEmailInput = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const email = value.trim().toLowerCase();

    return email.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
};

const LIMIT_NOTICES: Record<string, string> = {
    saved: 'The limit was saved.',
    cleared: 'The limit was cleared. The account is on the default.',
    'no-account': 'No account has that email, so nothing changed.',
    invalid: 'Enter an account email and a positive whole number, or leave the limit empty.',
};

/**
 * The admin page's notice for its `?limit=` code, or none. Only the table's
 * own entries count, so `?limit=__proto__` finds nothing instead of throwing.
 */
export const limitNotice = (code: string): string | undefined =>
    Object.hasOwn(LIMIT_NOTICES, code) ? LIMIT_NOTICES[code] : undefined;
