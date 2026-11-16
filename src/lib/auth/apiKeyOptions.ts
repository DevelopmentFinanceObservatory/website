import { apiKey } from '@better-auth/api-key';

/** The key prefix. A secret scanner and our own logs can spot it. */
export const API_KEY_PREFIX = 'dfo_live_';

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
 * random characters (`dfo_live_RCd`). Three of 32 random characters give
 * nothing to guess with.
 */
export const API_KEY_START_LENGTH = API_KEY_PREFIX.length + 3;

/**
 * The `@better-auth/api-key` plugin, set up so the proxy owns the request
 * path (src/lib/proxy/keyVerifier): the plugin's own limiter, metadata and
 * key-as-session are off. A key as a session would let it act as its owner
 * on every /api/auth/* endpoint, account deletion included.
 */
export const apiKeyPlugin = (overrides: Parameters<typeof apiKey>[0] = {}) =>
    apiKey({
        defaultPrefix: API_KEY_PREFIX,
        defaultKeyLength: 32,
        rateLimit: { enabled: false },
        enableSessionForAPIKeys: false,
        enableMetadata: false,
        startingCharactersConfig: { shouldStore: true, charactersLength: API_KEY_START_LENGTH },
        ...overrides,
    });
