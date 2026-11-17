/**
 * The signed tag at the end of every API key, so the proxy can turn away a
 * made-up key before it reads the key store (src/lib/proxy/access).
 *
 * A key is `dfo_live_`, 32 random letters, then an 8-character tag: the
 * first 8 base64url characters of an HMAC-SHA-256 of everything before the
 * tag, keyed by a server secret. The tag is not the key's secret, which is
 * the 32 random letters and is stored only as the plugin's hash; it only
 * proves that this server minted the key. A checksum would not do, since the
 * repository is public and anyone could compute one.
 *
 * The secrets are API_KEY_TAG_SECRETS, comma-separated, one set per
 * environment and used for nothing else. The first signs; every one
 * verifies. To rotate, add the new secret to the end in one revision, then
 * move it first in the next, so no instance meets a key it cannot check.
 * Removing a secret voids every key it signed, and keys do not expire, so a
 * secret is removed only after its keys are replaced. It is not derived from
 * BETTER_AUTH_SECRET, so rotating that one leaves keys alone.
 *
 * No Next.js imports, so `node --test` can load it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const KEY_TAG_LENGTH = 8;
/** How many random letters a key carries between the prefix and the tag. */
export const KEY_RANDOM_LENGTH = 32;
/** The shortest secret accepted: 32 characters, as `openssl rand -hex 16` gives. */
export const MIN_SECRET_LENGTH = 32;

const ENV = 'API_KEY_TAG_SECRETS';

/** The tag for `body`, the key without its tag. */
export const keyTag = (body: string, secret: string): string =>
    createHmac('sha256', secret).update(body).digest('base64url').slice(0, KEY_TAG_LENGTH);

/**
 * The secrets in API_KEY_TAG_SECRETS, signing one first. Throws when the list
 * is unset or empty, or a secret is short.
 */
export const parseTagSecrets = (raw: string | undefined): string[] => {
    const secrets = (raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (secrets.length === 0) {
        throw new Error(`${ENV} is not set: API keys can be neither made nor checked`);
    }

    if (secrets.some((s) => s.length < MIN_SECRET_LENGTH)) {
        throw new Error(`${ENV}: every secret must be at least ${MIN_SECRET_LENGTH} characters`);
    }

    return secrets;
};

/** The secrets from the environment, read per call so a test can set them. */
export const tagSecrets = (env: Record<string, string | undefined> = process.env): string[] =>
    parseTagSecrets(env[ENV]);

/** A key body (prefix and random letters) with its tag, signed by the first secret. */
export const signKey = (body: string, secrets: readonly string[]): string => {
    const signer = secrets[0];

    if (!signer) {
        throw new Error(`${ENV} is not set: API keys cannot be made`);
    }

    return `${body}${keyTag(body, signer)}`;
};

const TAGGED = new RegExp(
    `^(dfo_live_[A-Za-z]{${KEY_RANDOM_LENGTH}})([A-Za-z0-9_-]{${KEY_TAG_LENGTH}})$`,
);

/**
 * Whether `key` has the shape of one of ours and a tag one of `secrets` made.
 * False for every key when there are no secrets.
 */
export const hasValidTag = (key: string, secrets: readonly string[]): boolean => {
    const match = TAGGED.exec(key);

    if (!match) {
        return false;
    }

    const [, body, tag] = match as unknown as [string, string, string];
    const given = Buffer.from(tag);

    // Every secret is tried, so the time taken does not say which one matched.
    return secrets.reduce(
        (found, secret) => timingSafeEqual(Buffer.from(keyTag(body, secret)), given) || found,
        false,
    );
};
