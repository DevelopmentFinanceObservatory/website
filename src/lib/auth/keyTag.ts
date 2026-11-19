/**
 * The signed tag at the end of every API key, so the proxy can turn away a
 * made-up key before it reads the key store (src/lib/proxy/access).
 *
 * A key follows the DFO client contract's key format (spec-kit
 * `client-contract` rule `key-format`, which the SDK checks): `dfo_k_`, a
 * base62 body, then a 6-character base62 checksum, the CRC32 of the body.
 * The body is 32 random letters, then an 8-character tag: the first 8 bytes
 * of an HMAC-SHA-256 of the prefix and the letters, keyed by a server secret,
 * as an 8-digit base62 number. All 52 characters are base62 after the prefix.
 *
 * The tag is not the key's secret, which is the 32 random letters and is
 * stored only as the plugin's hash; it only proves that this server minted
 * the key. The checksum lets a client catch a mistyped key and proves
 * nothing, since anyone can compute one. The server checks both.
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
import { crc32 } from 'node:zlib';

/** The prefix of a secret key, by the client contract. */
export const KEY_PREFIX = 'dfo_k_';
export const KEY_TAG_LENGTH = 8;
export const KEY_CHECKSUM_LENGTH = 6;
/** How many random letters a key carries between the prefix and the tag. */
export const KEY_RANDOM_LENGTH = 32;
/** The shortest secret accepted: 32 characters, as `openssl rand -hex 16` gives. */
export const MIN_SECRET_LENGTH = 32;

const ENV = 'API_KEY_TAG_SECRETS';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = BigInt(0);
const SIXTY_TWO = BigInt(62);

/** `n` in base62, left-padded with zeros to `width`; the contract's digit order. */
const base62 = (n: bigint, width: number): string => {
    let digits = '';

    for (let rest = n; rest > ZERO; rest /= SIXTY_TWO) {
        digits = BASE62[Number(rest % SIXTY_TWO)] + digits;
    }

    return digits.padStart(width, '0');
};

/** The tag for `signed`, the prefix and the random letters. */
export const keyTag = (signed: string, secret: string): string => {
    const head = createHmac('sha256', secret).update(signed).digest().readBigUInt64BE(0);

    return base62(head % SIXTY_TWO ** BigInt(KEY_TAG_LENGTH), KEY_TAG_LENGTH);
};

/** The contract's checksum of a key body: its CRC32 in base62, six digits. */
export const keyChecksum = (body: string): string =>
    base62(BigInt(crc32(body)), KEY_CHECKSUM_LENGTH);

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

/**
 * The whole key for `signed` (the prefix and the random letters): its tag,
 * signed by the first secret, then the checksum of everything after the
 * prefix.
 */
export const signKey = (signed: string, secrets: readonly string[]): string => {
    const signer = secrets[0];

    if (!signer) {
        throw new Error(`${ENV} is not set: API keys cannot be made`);
    }

    const tagged = `${signed}${keyTag(signed, signer)}`;

    return `${tagged}${keyChecksum(tagged.slice(KEY_PREFIX.length))}`;
};

const KEY_SHAPE = new RegExp(
    `^(${KEY_PREFIX}[A-Za-z]{${KEY_RANDOM_LENGTH}})([0-9A-Za-z]{${KEY_TAG_LENGTH}})([0-9A-Za-z]{${KEY_CHECKSUM_LENGTH}})$`,
);

/**
 * Whether `key` has the shape of one of ours, a checksum that matches, and a
 * tag one of `secrets` made. False for every key when there are no secrets.
 */
export const hasValidTag = (key: string, secrets: readonly string[]): boolean => {
    const match = KEY_SHAPE.exec(key);

    if (!match) {
        return false;
    }

    const [, signed, tag, checksum] = match as unknown as [string, string, string, string];

    if (keyChecksum(`${signed}${tag}`.slice(KEY_PREFIX.length)) !== checksum) {
        return false;
    }

    const given = Buffer.from(tag);

    // Every secret is tried, so the time taken does not say which one matched.
    return secrets.reduce(
        (found, secret) => timingSafeEqual(Buffer.from(keyTag(signed, secret)), given) || found,
        false,
    );
};
