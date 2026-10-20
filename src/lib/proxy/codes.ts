/**
 * The upstream address of the refusal-code registry. The API's problem
 * documents carry a root-relative `type` (`/codes/request_invalid`), which
 * resolves against the site's own host, so `src/app/codes/[code]/route.ts`
 * forwards that path to the API. Kept apart from forward.ts, which imports
 * server-only, so `node --test` can load it.
 */
export const codeTarget = (apiBase: string, code: string, search: string): string =>
    `${apiBase}/codes/${encodeURIComponent(code)}${search}`;
