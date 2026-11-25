/**
 * API_KEYS_ENABLED is the emergency switch: set to `false` (or `0`, `off`,
 * `no`), keys are stripped and every call is treated as anonymous. Read per
 * call, so a test can flip it. Kept apart from `forward` so
 * src/instrumentation.ts can read it without loading the proxy and its
 * database pools.
 */
export const keysEnabled = (): boolean =>
    !['false', '0', 'off', 'no'].includes(process.env.API_KEYS_ENABLED?.trim().toLowerCase() ?? '');
