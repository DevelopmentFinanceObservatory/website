/**
 * The host site of the page a request came from, as a bare hostname: the
 * Referer's path and query can carry personal data, so they never leave
 * here. Null when the referrer policy strips it.
 */
export const refererHost = (referer: string | null): string | null =>
    URL.parse(referer ?? '')?.hostname || null;
