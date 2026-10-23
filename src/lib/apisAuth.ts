/**
 * `fetch` that proves the site's identity to dfo-apis. The apis Cloud Run
 * service admits a caller whose Google ID token, minted for the service's
 * URL, names an identity granted `roles/run.invoker`. On Cloud Run (where
 * `K_SERVICE` is set) a request whose origin is the apis origin
 * (`searchApiBase()`) gains `X-Serverless-Authorization: Bearer <token>`,
 * with a token the metadata server mints for the runtime service account and
 * that origin as its audience. Cloud Run checks that header ahead of
 * `Authorization` and strips its signature before the container sees it, so
 * a caller's own `Authorization` (the proxy's pass-through, the bearer for
 * dfo-ai) goes through untouched.
 *
 * The token never leaves the apis origin. A tokened request that follows
 * redirects (the default) is sent with `redirect: 'manual'` and followed here,
 * because undici drops `Authorization` on a cross-origin hop but keeps custom
 * headers. A hop to another origin goes without the token and without the
 * caller's `Authorization`, and so does every hop after it. A caller that sets
 * `redirect: 'manual'` or `'error'` keeps that mode.
 *
 * Every other request, and every request off Cloud Run, goes out as given.
 * Local development reaches a private apis through `gcloud run services
 * proxy`, which signs the calls itself.
 *
 * A token is held until REFRESH_EARLY_MS before it expires, and callers that
 * find it stale share one mint. A failed mint is logged. While the held token
 * has not yet expired the request goes out with it, and the next request asks
 * again. With no unexpired token the failure is thrown and the request is not
 * sent.
 *
 * No `server-only`, DOM or Node dependency, so `node --test` imports it and
 * the browser bundle that shares `datasetsFetch` can carry it (a browser has
 * no `K_SERVICE`, so it sends every request as given).
 */

import { mintIdToken, type Fetch } from './googleIdToken.ts';
import { searchApiBase } from './searchApi.ts';

type Env = Record<string, string | undefined>;

export type { Fetch };

export const APIS_AUTH_HEADER = 'x-serverless-authorization';

// A refresh this long before expiry leaves a token minted for an hour 55
// minutes of use and covers clock skew and a slow request.
export const REFRESH_EARLY_MS = 5 * 60_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

// Dropped from a hop that leaves the apis origin, as fetch drops `Authorization`.
const CREDENTIAL_HEADERS = [APIS_AUTH_HEADER, 'authorization'];

type Minted = { token: string; refreshAt: number; expiresAt: number };

const urlOf = (input: string | URL | Request): string =>
    input instanceof Request ? input.url : String(input);

// The origin of an absolute URL, or null for a relative path, which only the
// browser sends (to the site's own proxy).
const originOf = (url: string): string | null => (URL.canParse(url) ? new URL(url).origin : null);

/**
 * Builds the wrapper over `fetchImpl`, which also carries the metadata call.
 * `env` is read on every request; `now` and `log` exist for tests.
 */
export const createApisFetch = ({
    fetchImpl = (input, init) => fetch(input, init),
    env = globalThis.process?.env ?? {},
    now = Date.now,
    log = console.error,
}: {
    fetchImpl?: Fetch;
    env?: Env;
    now?: () => number;
    log?: (message: string, error: unknown) => void;
} = {}): Fetch => {
    const held = new Map<string, Minted>();
    const minting = new Map<string, Promise<Minted>>();

    const mint = async (audience: string): Promise<Minted> => {
        const { token, expiresAt } = await mintIdToken(audience, fetchImpl);

        return { token, refreshAt: expiresAt - REFRESH_EARLY_MS, expiresAt };
    };

    const tokenFor = async (audience: string): Promise<string> => {
        const current = held.get(audience);

        if (current && now() < current.refreshAt) {
            return current.token;
        }

        let pending = minting.get(audience);

        if (!pending) {
            pending = mint(audience)
                .then((minted) => {
                    held.set(audience, minted);

                    return minted;
                })
                .catch((error: unknown) => {
                    const fallback = held.get(audience);

                    if (fallback && now() < fallback.expiresAt) {
                        log(
                            `apis auth: refresh failed for ${audience}, using the held token`,
                            error,
                        );

                        return fallback;
                    }

                    log(`apis auth: no ID token for ${audience}`, error);

                    throw new Error(`apis auth: no ID token for ${audience}`, { cause: error });
                })
                .finally(() => minting.delete(audience));
            minting.set(audience, pending);
        }

        return (await pending).token;
    };

    // Sends the request and follows its redirects as fetch would, minus the
    // credentials on a hop that leaves the apis origin. `headers` is ours to edit.
    const sendFollowing = async (
        input: string | URL | Request,
        init: RequestInit | undefined,
        headers: Headers,
        audience: string,
    ): Promise<Response> => {
        let url = urlOf(input);
        let method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        let body = init?.body;
        let res = await fetchImpl(input, { ...init, headers, redirect: 'manual' });

        for (let hops = 0; ; hops++) {
            const location = res.headers.get('location');

            if (!REDIRECT_STATUSES.has(res.status) || location === null) {
                return res;
            }

            if (hops === MAX_REDIRECTS) {
                throw new TypeError(`apis auth: more than ${MAX_REDIRECTS} redirects`);
            }

            await res.body?.cancel();
            url = new URL(location, url).href;

            if (res.status === 303 || (method === 'POST' && [301, 302].includes(res.status))) {
                method = 'GET';
                body = undefined;
            }

            if (originOf(url) !== audience) {
                CREDENTIAL_HEADERS.forEach((name) => headers.delete(name));
            }

            res = await fetchImpl(url, { ...init, method, headers, body, redirect: 'manual' });
        }
    };

    return async (input, init) => {
        if (!env.K_SERVICE) {
            return fetchImpl(input, init);
        }

        const audience = new URL(searchApiBase(env)).origin;

        if (originOf(urlOf(input)) !== audience) {
            return fetchImpl(input, init);
        }

        const headers = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );

        headers.set(APIS_AUTH_HEADER, `Bearer ${await tokenFor(audience)}`);

        const redirect = init?.redirect ?? (input instanceof Request ? input.redirect : 'follow');

        return redirect === 'follow'
            ? sendFollowing(input, init, headers, audience)
            : fetchImpl(input, { ...init, headers });
    };
};

/** The global `fetch`, read at call time, with the apis token on Cloud Run. */
export const apisFetch: Fetch = createApisFetch();
