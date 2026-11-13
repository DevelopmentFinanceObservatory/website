/**
 * Better Auth endpoints that answer a signed-in browser with a provider's
 * tokens: the access token (`/get-access-token`), a renewed access and
 * refresh token (`/refresh-token`), and the provider's account details read
 * with that token (`/account-info`). The Google token carries the Drive
 * scope, so the HTTP router refuses all three with a 404. Better Auth checks
 * `disabledPaths` only in that router (`onRequest` in
 * better-auth/dist/api/index.mjs), so server code still calls
 * `auth.api.getAccessToken`.
 */
export const TOKEN_PATHS: readonly string[] = [
    '/get-access-token',
    '/refresh-token',
    '/account-info',
];
