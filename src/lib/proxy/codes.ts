/**
 * The upstream address of the refusal-code registry. The API's problem
 * documents carry a root-relative `type` (`/codes/request_invalid`), which
 * resolves against the site's own host, so `src/app/codes/[code]/route.ts`
 * forwards that path to the API. Kept apart from forward.ts, which imports
 * server-only, so `node --test` can load it.
 */

// Every registry code is snake_case, so a code of this shape stays in the
// one path segment after /codes/; `.` and `..` would resolve out of it.
const CODE = /^[a-z][a-z0-9_]*$/;

/** The registry address for `code`, or null for a value no code can be. */
export const codeTarget = (apiBase: string, code: string, search: string): string | null =>
    CODE.test(code) ? `${apiBase}/codes/${code}${search}` : null;
