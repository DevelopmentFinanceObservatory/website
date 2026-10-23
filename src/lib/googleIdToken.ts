/**
 * Google ID tokens for the Cloud Run runtime service account, minted by the
 * metadata server for a given audience. apisAuth.ts sends them to dfo-apis,
 * and the SES mail transport (mail/ses.ts) trades them at AWS STS for
 * temporary credentials. Callers hold and refresh tokens themselves.
 *
 * No `server-only`, DOM or Node dependency, so `node --test` imports it and
 * the browser bundle that carries apisAuth.ts can carry it too.
 */

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type IdToken = { token: string; expiresAt: number };

export const METADATA_IDENTITY_URL =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

const METADATA_TIMEOUT_MS = 5_000;

/**
 * Every failure to mint a token, named so a log that keeps only the error
 * name tells it apart from a refusal by the service the token was for. The
 * underlying error, if any, is the cause.
 */
export class IdTokenError extends Error {
    override name = 'IdTokenError';
}

// The `exp` claim of a JWT in ms, or null when the token carries none.
const expiryMs = (token: string): number | null => {
    const payload = token.split('.')[1];

    if (!payload) {
        return null;
    }

    try {
        const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        const exp = (claims as { exp?: unknown } | null)?.exp;

        return typeof exp === 'number' ? exp * 1000 : null;
    } catch {
        return null;
    }
};

/**
 * Asks the metadata server for an ID token minted for `audience`, with its
 * expiry in ms. Throws an IdTokenError when the server answers an error, a
 * token without an expiry, or nothing within five seconds.
 */
export const mintIdToken = async (
    audience: string,
    fetchImpl: Fetch = (input, init) => fetch(input, init),
): Promise<IdToken> => {
    const query = new URLSearchParams({ audience, format: 'full' });
    let token: string;

    try {
        const res = await fetchImpl(`${METADATA_IDENTITY_URL}?${query}`, {
            headers: { 'metadata-flavor': 'Google' },
            cache: 'no-store',
            signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
        });

        if (!res.ok) {
            throw new IdTokenError(`metadata server answered ${res.status}`);
        }

        token = (await res.text()).trim();
    } catch (error) {
        throw error instanceof IdTokenError
            ? error
            : new IdTokenError('metadata server did not answer', { cause: error });
    }

    const expiresAt = expiryMs(token);

    if (expiresAt === null) {
        throw new IdTokenError('metadata server answered a token without an expiry');
    }

    return { token, expiresAt };
};
