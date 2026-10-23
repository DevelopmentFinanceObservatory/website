/**
 * `apisAuth.ts`: on Cloud Run a request to the apis origin carries a
 * metadata-minted ID token for that origin, held until shortly before it
 * expires and minted once for concurrent callers. Every other request goes
 * out as given, and a failed mint fails the request.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { APIS_AUTH_HEADER, createApisFetch, REFRESH_EARLY_MS } from '../apisAuth.ts';
import { METADATA_IDENTITY_URL } from '../googleIdToken.ts';

const APIS = 'https://apis.example.org';
const STUDIO = 'https://ai.example.org';
const ON_CLOUD_RUN = { K_SERVICE: 'dfo-dev-website-staging', SEARCH_API_BASE: `${APIS}/` };
const T0 = 1_800_000_000_000;
const HOUR_MS = 3_600_000;

const base64url = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const jwt = (claims: Record<string, unknown>): string =>
    `${base64url({ alg: 'RS256' })}.${base64url(claims)}.sig`;

// Answers the metadata server with tokens n1, n2, ... (each valid for an
// hour from the clock) and every other URL with `respond`, or 200 when it
// is absent, recording both.
const stubbed = ({
    env = ON_CLOUD_RUN,
    metadata,
    respond = () => new Response('ok'),
}: {
    env?: Record<string, string>;
    metadata?: () => Promise<Response>;
    respond?: (url: string) => Response;
} = {}) => {
    const clock = { now: T0 };
    const mints: { url: string; flavor: string | null }[] = [];
    const sent: {
        url: string;
        headers: Headers;
        method: string | undefined;
        body: unknown;
        redirect: RequestRedirect | undefined;
    }[] = [];
    const logged: unknown[] = [];

    const apisFetch = createApisFetch({
        env,
        now: () => clock.now,
        log: (_message, error) => logged.push(error),
        fetchImpl: async (input, init) => {
            const url = input instanceof Request ? input.url : String(input);

            if (url.startsWith(METADATA_IDENTITY_URL)) {
                mints.push({ url, flavor: new Headers(init?.headers).get('metadata-flavor') });

                if (metadata) {
                    return metadata();
                }

                const exp = Math.floor((clock.now + HOUR_MS) / 1000);

                return new Response(jwt({ exp, n: mints.length }));
            }

            sent.push({
                url,
                headers: new Headers(
                    init?.headers ?? (input instanceof Request ? input.headers : undefined),
                ),
                method: init?.method,
                body: init?.body,
                redirect: init?.redirect,
            });

            return respond(url);
        },
    });

    return { apisFetch, clock, mints, sent, logged };
};

const claimN = (headers: Headers): unknown => {
    const token = headers.get(APIS_AUTH_HEADER)?.replace(/^Bearer /, '') ?? '';
    const payload = token.split('.')[1] ?? '';

    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).n;
};

test('off Cloud Run a request to apis goes out as given, with no mint', async () => {
    const { apisFetch, mints, sent } = stubbed({ env: { SEARCH_API_BASE: APIS } });

    await apisFetch(`${APIS}/api/datasets`, { headers: { accept: 'application/json' } });

    assert.equal(mints.length, 0);
    assert.equal(sent[0]!.headers.get(APIS_AUTH_HEADER), null);
    assert.equal(sent[0]!.headers.get('accept'), 'application/json');
});

test('on Cloud Run a request to apis carries a token minted for the apis origin', async () => {
    const { apisFetch, mints, sent } = stubbed();

    await apisFetch(`${APIS}/api/search/resolve?q=aid`, {
        headers: { authorization: 'Bearer caller', 'x-dfo-principal': 'p' },
    });

    assert.equal(mints.length, 1);
    assert.equal(new URL(mints[0]!.url).searchParams.get('audience'), APIS);
    assert.equal(new URL(mints[0]!.url).searchParams.get('format'), 'full');
    assert.equal(mints[0]!.flavor, 'Google');
    assert.equal(claimN(sent[0]!.headers), 1);
    assert.equal(sent[0]!.headers.get('authorization'), 'Bearer caller');
    assert.equal(sent[0]!.headers.get('x-dfo-principal'), 'p');
});

test('a Request to apis keeps its own headers beside the token', async () => {
    const { apisFetch, sent } = stubbed();

    await apisFetch(new Request(`${APIS}/api/graph/node`, { headers: { accept: 'text/csv' } }));

    assert.equal(sent[0]!.headers.get('accept'), 'text/csv');
    assert.equal(claimN(sent[0]!.headers), 1);
});

for (const [label, url] of [
    ['another origin (dfo-ai)', `${STUDIO}/api/studio/refresh`],
    ['the apis host on another port', 'https://apis.example.org:8443/api/datasets'],
    ['a relative path', '/api/datasets'],
]) {
    test(`on Cloud Run a request to ${label} goes out as given`, async () => {
        const { apisFetch, mints, sent } = stubbed();

        await apisFetch(url!, { headers: { authorization: 'Bearer studio' } });

        assert.equal(mints.length, 0);
        assert.equal(sent[0]!.headers.get(APIS_AUTH_HEADER), null);
        assert.equal(sent[0]!.headers.get('authorization'), 'Bearer studio');
    });
}

const redirectTo = (location: string, status = 302) =>
    new Response(null, { status, headers: { location } });

test('a redirect off the apis origin is followed without the token or authorization', async () => {
    const OUTSIDE = 'https://storage.example.net';
    const { apisFetch, sent } = stubbed({
        respond: (url) =>
            url === `${APIS}/artifact`
                ? redirectTo(`${OUTSIDE}/signed?sig=1`)
                : url.startsWith(OUTSIDE)
                  ? redirectTo(`${APIS}/back`)
                  : new Response('file'),
    });

    const res = await apisFetch(`${APIS}/artifact`, {
        headers: { authorization: 'Bearer caller' },
    });

    assert.equal(await res.text(), 'file');
    assert.deepEqual(
        sent.map(({ url }) => url),
        [`${APIS}/artifact`, `${OUTSIDE}/signed?sig=1`, `${APIS}/back`],
    );
    assert.equal(claimN(sent[0]!.headers), 1);
    assert.equal(sent[0]!.headers.get('authorization'), 'Bearer caller');

    // The hop back to apis stays bare, since the token is gone for every later hop.
    for (const { headers } of sent.slice(1)) {
        assert.equal(headers.get(APIS_AUTH_HEADER), null);
        assert.equal(headers.get('authorization'), null);
    }
});

test('a same-origin 307 keeps the token, method and body', async () => {
    const { apisFetch, mints, sent } = stubbed({
        respond: (url) => (url === `${APIS}/a` ? redirectTo('/b', 307) : new Response('done')),
    });

    const res = await apisFetch(`${APIS}/a`, { method: 'POST', body: 'payload' });

    assert.equal(await res.text(), 'done');
    assert.equal(mints.length, 1);
    assert.deepEqual(
        sent.map(({ url, method, body }) => [url, method, body]),
        [
            [`${APIS}/a`, 'POST', 'payload'],
            [`${APIS}/b`, 'POST', 'payload'],
        ],
    );
    assert.equal(claimN(sent[1]!.headers), 1);
});

test('a 303 turns a POST into a GET without a body', async () => {
    const { apisFetch, sent } = stubbed({
        respond: (url) => (url === `${APIS}/a` ? redirectTo('/b', 303) : new Response('done')),
    });

    await apisFetch(`${APIS}/a`, { method: 'POST', body: 'payload' });

    assert.equal(sent[1]!.method, 'GET');
    assert.equal(sent[1]!.body, undefined);
});

test('a redirect loop fails after five hops', async () => {
    const { apisFetch, sent } = stubbed({ respond: () => redirectTo('/again') });

    await assert.rejects(apisFetch(`${APIS}/a`), /more than 5 redirects/);

    assert.equal(sent.length, 6);
});

for (const redirect of ['manual', 'error'] as const) {
    test(`a caller's redirect: '${redirect}' is kept and the 3xx comes back unchanged`, async () => {
        const { apisFetch, sent } = stubbed({ respond: () => redirectTo(`${STUDIO}/x`) });

        const res = await apisFetch(`${APIS}/a`, { redirect });

        assert.equal(res.status, 302);
        assert.equal(sent.length, 1);
        assert.equal(sent[0]!.redirect, redirect);
        assert.equal(claimN(sent[0]!.headers), 1);
    });
}

test('a token is reused until REFRESH_EARLY_MS before expiry, then minted again', async () => {
    const { apisFetch, clock, mints, sent } = stubbed();

    await apisFetch(`${APIS}/a`);
    clock.now = T0 + HOUR_MS - REFRESH_EARLY_MS - 1;
    await apisFetch(`${APIS}/b`);
    clock.now = T0 + HOUR_MS - REFRESH_EARLY_MS;
    await apisFetch(`${APIS}/c`);

    assert.equal(mints.length, 2);
    assert.deepEqual(
        sent.map(({ headers }) => claimN(headers)),
        [1, 1, 2],
    );
});

test('concurrent requests with no token share one mint', async () => {
    const { apisFetch, mints, sent } = stubbed();

    await Promise.all([apisFetch(`${APIS}/a`), apisFetch(`${APIS}/b`), apisFetch(`${APIS}/c`)]);

    assert.equal(mints.length, 1);
    assert.deepEqual(
        sent.map(({ headers }) => claimN(headers)),
        [1, 1, 1],
    );
});

for (const [label, metadata] of [
    ['answers 500', async () => new Response('down', { status: 500 })],
    ['is unreachable', async () => Promise.reject(new TypeError('fetch failed'))],
    ['answers a token with no exp', async () => new Response(jwt({ n: 1 }))],
] as const) {
    test(`a request to apis fails, logged and unsent, when the metadata server ${label}`, async () => {
        const { apisFetch, mints, sent, logged } = stubbed({ metadata });

        await assert.rejects(apisFetch(`${APIS}/api/datasets`), /apis auth: no ID token/);
        await assert.rejects(apisFetch(`${APIS}/api/datasets`), /apis auth: no ID token/);

        assert.equal(sent.length, 0);
        assert.equal(logged.length, 2);
        assert.ok(logged.every((error) => error instanceof Error && error.name === 'IdTokenError'));
        // A failed mint is not held, so the next request asks again.
        assert.equal(mints.length, 2);
    });
}

test('a failed refresh falls back to the held token until it expires, then fails', async () => {
    let answers = 0;
    const { apisFetch, clock, mints, sent, logged } = stubbed({
        metadata: async () =>
            answers++ === 0
                ? new Response(jwt({ exp: Math.floor((T0 + HOUR_MS) / 1000), n: 1 }))
                : new Response('down', { status: 500 }),
    });

    await apisFetch(`${APIS}/a`);
    clock.now = T0 + HOUR_MS - REFRESH_EARLY_MS;
    await Promise.all([apisFetch(`${APIS}/b`), apisFetch(`${APIS}/c`)]);
    clock.now = T0 + HOUR_MS - 1;
    await apisFetch(`${APIS}/d`);
    clock.now = T0 + HOUR_MS;
    await assert.rejects(apisFetch(`${APIS}/e`), /apis auth: no ID token/);

    // The two concurrent requests share one failed refresh. Each later request asks again.
    assert.equal(mints.length, 4);
    assert.deepEqual(
        sent.map(({ url, headers }) => [new URL(url).pathname, claimN(headers)]),
        [
            ['/a', 1],
            ['/b', 1],
            ['/c', 1],
            ['/d', 1],
        ],
    );
    assert.equal(logged.length, 3);
});
