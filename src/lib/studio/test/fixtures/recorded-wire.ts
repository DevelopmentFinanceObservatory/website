/**
 * The recorded wire of dfo-apis' live-refresh routes (`wire-pairs.json`, a
 * full copy of the recording dfo-apis makes from its composed test app):
 * each pair's request and response as the service sent them.
 *
 * `replayOf` is a `fetch` that answers only requests the recording holds,
 * so a test that drives the site's real client through it fails when the
 * client sends a method, path, query, header name, or body the service was
 * never recorded answering.
 */
import { readFileSync } from 'node:fs';

export type RecordedPair = {
    request: {
        method: string;
        path: string;
        headers: Record<string, string>;
        body?: unknown;
    };
    response: {
        status: number;
        headers: Record<string, string>;
        body?: Record<string, unknown>;
        body_starts?: string;
        body_starts_hex?: string;
    };
};

const RECORDING = JSON.parse(
    readFileSync(new URL('./wire-pairs.json', import.meta.url), 'utf8'),
) as { pairs: Record<string, RecordedPair> };

export const PAIR_NAMES = Object.keys(RECORDING.pairs);

export const pairOf = (name: string): RecordedPair => {
    const found = RECORDING.pairs[name];

    if (!found) {
        throw new Error(`no recorded pair named ${name}`);
    }

    return found;
};

/** A recorded answer's JSON body, copied so a test can reshape it. Its
 *  members are read and set by path, so they are typed loosely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recorded JSON navigated by path
export const bodyOf = (name: string): Record<string, any> =>
    structuredClone(pairOf(name).response.body ?? {});

/** A recorded answer as the `Response` the service sent: its status and
 *  headers, and its body (the JSON, or the start of a file). */
export const responseOf = (name: string): Response => {
    const { status, headers, body, body_starts, body_starts_hex } = pairOf(name).response;
    const content =
        body !== undefined
            ? JSON.stringify(body)
            : body_starts_hex !== undefined
              ? Buffer.from(body_starts_hex, 'hex')
              : (body_starts ?? '');

    return new Response(content, { status, headers });
};

/** The `{spec_id, content_version}` pair of a recorded `frame` answer. */
export const frameOfAnswer = (name: string): { spec_id: string; content_version: string } =>
    bodyOf(name)['frame'];

const target = (path: string) => {
    const url = new URL(path, 'https://recorded.example');

    return `${url.pathname}?${[...url.searchParams]
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join('&')}`;
};

const headerNames = (headers: Record<string, string>): string =>
    Object.keys(headers)
        .map((name) => name.toLowerCase())
        .sort()
        .join(',');

export type Replayed = {
    method: string;
    path: string;
    headers: Headers;
    body: unknown;
};

/**
 * A `fetch` that answers each request with the recorded response of the
 * pair that holds it. A request matches a pair on method, path, query (in
 * any order), JSON body, and the set of header names. A header the pair
 * records as a credential placeholder must carry `principal`.
 *
 * `unrecorded` lists every request no named pair holds, which a test
 * asserts is empty; such a request is answered 599. `lenient` names the
 * pairs recorded as a refusal of a request without its credential: they
 * match on method, path, query, and body alone.
 */
export const replayOf = (
    names: string[],
    { principal, lenient = [] }: { principal: string; lenient?: string[] },
) => {
    const held = new Map<string, string>();

    for (const name of names) {
        const { method, path, body } = pairOf(name).request;
        const key = `${method} ${target(path)} ${JSON.stringify(body ?? null)}`;
        const twin = held.get(key);

        if (twin) {
            throw new Error(`${name} and ${twin} record the same request`);
        }

        held.set(key, name);
    }

    const calls: Replayed[] = [];
    const unrecorded: Replayed[] = [];

    const matches = (name: string, call: Replayed): boolean => {
        const { method, path, headers, body } = pairOf(name).request;

        if (method !== call.method || target(path) !== target(call.path)) {
            return false;
        }

        if (JSON.stringify(body ?? null) !== JSON.stringify(call.body ?? null)) {
            return false;
        }

        if (lenient.includes(name)) {
            return true;
        }

        return (
            headerNames(headers) === headerNames(Object.fromEntries(call.headers)) &&
            Object.entries(headers).every(([header, value]) => {
                const sent = call.headers.get(header);

                return value === '<LIVE_REFRESH_PRINCIPAL>' ? sent === principal : sent === value;
            })
        );
    };

    const fetcher: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        const call: Replayed = {
            method: init?.method ?? 'GET',
            path: `${url.pathname}${url.search}`,
            headers: new Headers(init?.headers),
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        };
        const name = names.find((candidate) => matches(candidate, call));

        calls.push(call);

        if (!name) {
            unrecorded.push(call);

            return new Response('unrecorded request', { status: 599 });
        }

        return responseOf(name);
    };

    return { fetch: fetcher, calls, unrecorded };
};
