const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * The inbox an email address reaches: lower-case and without a `+tag`, and
 * for Gmail also without dots, since each of those variants reaches the
 * same inbox. The sign-in code caps (./codeLimit) and the Studio's
 * signed-in allowance (src/lib/studio/spendPrompt) count per inbox, so every
 * spelling of one address shares them.
 */
export const inboxOf = (email: string): string => {
    const normalised = email.trim().toLowerCase();
    const at = normalised.lastIndexOf('@');
    const domain = normalised.slice(at + 1);
    const local = normalised.slice(0, at).split('+')[0]!;

    return GMAIL_DOMAINS.has(domain)
        ? `${local.replaceAll('.', '')}@gmail.com`
        : `${local}@${domain}`;
};
