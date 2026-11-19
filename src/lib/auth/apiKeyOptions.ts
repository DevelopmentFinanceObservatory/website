import { apiKey } from '@better-auth/api-key';
import { generateRandomString } from 'better-auth/crypto';

import { KEY_PREFIX, KEY_RANDOM_LENGTH, signKey, tagSecrets } from './keyTag.ts';

/** The key prefix. A secret scanner and our own logs can spot it. */
export const API_KEY_PREFIX = KEY_PREFIX;

/**
 * The plugin's HTTP endpoints for managing keys. They stay off the router:
 * a signed-in user could otherwise mint a key with any prefix, switch a key
 * an operator disabled back on, or remove an expiry. Better Auth checks
 * `disabledPaths` only in its HTTP router, so server code still reaches
 * `auth.api.createApiKey` and the rest (our own routes and the admin
 * command wrap those, forcing the prefix and the owner).
 */
export const API_KEY_PATHS: readonly string[] = [
    '/api-key/create',
    '/api-key/update',
    '/api-key/delete',
    '/api-key/list',
    '/api-key/get',
];

/**
 * How much of a key is stored in the clear as the row's `start`, which the
 * key pages show so an owner can tell keys apart: the prefix and three
 * random characters (`dfo_k_RCd`). Three of 32 random characters give
 * nothing to guess with.
 */
export const API_KEY_START_LENGTH = API_KEY_PREFIX.length + 3;

/**
 * How many of a key's last characters are stored in the clear as the row's
 * `tail`, shown after the start (`dfo_k_RCd…Qjsd`). Four, as the SDKs show a
 * key (`dfo_k_***Qjsd`), so an operator can match what a user's client
 * prints. They are four of the six checksum characters, about 24 bits of
 * a CRC of the key, far too little to help guess its 32 random letters.
 */
export const API_KEY_TAIL_LENGTH = 4;

/**
 * A new key: the prefix, KEY_RANDOM_LENGTH random letters (as the plugin's
 * own generator makes them), the signed tag and the checksum
 * (src/lib/auth/keyTag). The plugin stores the hash of the whole key.
 */
export const generateKey =
    (secrets: () => readonly string[]) =>
    ({ length, prefix }: { length: number; prefix: string | undefined }): string =>
        signKey(`${prefix ?? ''}${generateRandomString(length, 'a-z', 'A-Z')}`, secrets());

/**
 * The `@better-auth/api-key` plugin, set up so the proxy owns the request
 * path (src/lib/proxy/keyVerifier): the plugin's own limiter, metadata and
 * key-as-session are off. A key as a session would let it act as its owner
 * on every /api/auth/* endpoint, account deletion included. Keys are minted
 * with a signed tag, signed by the first of `secrets` (API_KEY_TAG_SECRETS
 * unless a test passes its own).
 */
export const apiKeyPlugin = (
    overrides: Parameters<typeof apiKey>[0] = {},
    { secrets = () => tagSecrets() }: { secrets?: () => readonly string[] } = {},
) =>
    apiKey({
        defaultPrefix: API_KEY_PREFIX,
        defaultKeyLength: KEY_RANDOM_LENGTH,
        customKeyGenerator: generateKey(secrets),
        rateLimit: { enabled: false },
        enableSessionForAPIKeys: false,
        enableMetadata: false,
        startingCharactersConfig: { shouldStore: true, charactersLength: API_KEY_START_LENGTH },
        ...overrides,
    });
