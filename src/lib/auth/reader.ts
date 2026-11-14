/**
 * A signed-in user whose verified email belongs to one of the allowlisted
 * domains may open the Graph Explorer. This module is pure, so `node --test`
 * loads it. requireReader.ts reads the session and the environment.
 */

/** The fields of a session's user the decision reads. */
export type ReaderUser = { email: string; emailVerified: boolean };

export type ReaderDecision<TUser extends ReaderUser = ReaderUser> =
    | { kind: 'admitted'; user: TUser }
    | { kind: 'signed_out' }
    | { kind: 'email_not_verified'; user: TUser }
    | { kind: 'domain_not_allowed'; user: TUser };

/** Why the gate refuses a visitor, in the words every refusal shows. */
export const REFUSAL_MESSAGES: Readonly<
    Record<Exclude<ReaderDecision['kind'], 'admitted'>, string>
> = {
    signed_out: 'Sign in to use the Graph Explorer.',
    email_not_verified:
        'The Graph Explorer needs a verified email address, and this account’s is not verified.',
    domain_not_allowed: 'The Graph Explorer is limited to team accounts.',
};

/**
 * The line the server logs once when the allowlist admits nobody, or null
 * when it names a domain.
 */
export const emptyAllowlistWarning = (domains: ReadonlySet<string>): string | null =>
    domains.size === 0
        ? 'GRAPH_EXPLORER_EMAIL_DOMAINS is unset or empty, so the Graph Explorer admits nobody.'
        : null;

/**
 * The allowlist from its environment variable, which holds comma-separated
 * email domains. Each is trimmed and lowercased, and empty entries are
 * dropped. Unset or empty gives an empty list, which admits nobody.
 */
export const parseEmailDomains = (value: string | undefined): ReadonlySet<string> =>
    new Set(
        (value ?? '')
            .split(',')
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean),
    );

const ASCII_DOMAIN = /^[A-Za-z0-9.-]+$/;

/**
 * The domain after an address's last `@`, lowercased. Null without one, or
 * when the domain holds anything but ASCII letters, digits, dots and
 * hyphens. The check runs before lowercasing, since `toLowerCase` maps some
 * non-ASCII letters to ASCII ones (the Kelvin sign to `k`).
 */
const emailDomain = (email: string): string | null => {
    const at = email.lastIndexOf('@');
    const domain = at === -1 ? '' : email.slice(at + 1);

    return ASCII_DOMAIN.test(domain) ? domain.toLowerCase() : null;
};

/**
 * The gate's one decision. The domain must equal an allowlisted domain
 * exactly, so a subdomain or a longer name that ends in one is refused.
 */
export const decideReader = <TUser extends ReaderUser>(
    user: TUser | null,
    domains: ReadonlySet<string>,
): ReaderDecision<TUser> => {
    if (!user) {
        return { kind: 'signed_out' };
    }

    if (!user.emailVerified) {
        return { kind: 'email_not_verified', user };
    }

    const domain = emailDomain(user.email);

    return domain !== null && domains.has(domain)
        ? { kind: 'admitted', user }
        : { kind: 'domain_not_allowed', user };
};
