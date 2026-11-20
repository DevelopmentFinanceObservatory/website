/**
 * forwardDatasets() serves the Datasets read routes for pages: a file's
 * storage redirect followed and streamed within bounds, Cache-Control and
 * Cache-Tag by route and tier, revalidation, CORS for DFO origins, and one
 * `gateway.delivery` line per read. Every other datasets route is forwarded
 * untouched.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { mock } from 'node:test';

import type { NextRequest } from 'next/server';

// The caller settings forward() and the delivery line both read at import.
process.env.DFO_CALLER_PRINCIPAL = 'principal-secret';
process.env.CALLER_HMAC_KEY = 'caller-key';

const { dropPerRequestHeaders, forwardDatasets, isDfoOrigin } = await import('../datasetReads.ts');

const SPEC = 'spec_abc';
const CV = 'cv_123';
const PARQUET = Buffer.concat([Buffer.from('PAR1'), Buffer.alloc(4096, 7), Buffer.from('PAR1')]);
const STORED_ETAG = '"stored-etag"';
const MANIFEST_ETAG = '"manifest-etag"';
const MANIFEST_TRACE = 'trace-of-one-request';
const CURRENT_ETAG = '"current-etag"';
const FILE_TRACE = 'trace-of-a-file-link';
const CLIENT_ADDRESS = '203.0.113.7';
// What dfo-apis sends on a route the gateway does not handle as a read.
const OTHER_CACHE_CONTROL = 'private, max-age=5';

// Storage responses held open, for the streaming test to finish.
const held: ServerResponse[] = [];
const storageRequests: Record<string, string | string[] | undefined>[] = [];
const apisRequests: Record<string, string | string[] | undefined>[] = [];

// One server plays dfo-apis under /api/datasets/ and storage under /bucket/.
// A file digest picks the upstream's answer: `<tier>` redirects to a stored
// object with that tier header (`none` sends none), `elsewhere` redirects off
// storage, `denied` to a stored object that answers 403, `slow` to one that
// sends its first chunk and is held, `stall` to one that sends its first
// chunk and never more, and `hang` to one that never answers. The stored
// object answers 304 to its own ETag. The selector redirects, or answers
// itself for `format=rendered`. A path that is not a known spec and a cv_
// version answers 200 with OTHER_CACHE_CONTROL.
const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://upstream.test');
    const parts = url.pathname.split('/');
    const [, api, , spec, cv, selector, digest] = parts;

    if (api === 'bucket') {
        storageRequests.push(req.headers);

        if (url.pathname === '/bucket/denied') {
            res.writeHead(403, { 'content-type': 'application/xml' }).end('<Error/>');
        } else if (url.pathname === '/bucket/hang') {
            // Never answers; the server's teardown closes it.
        } else if (url.pathname === '/bucket/slow' || url.pathname === '/bucket/stall') {
            res.writeHead(200, { 'content-type': 'application/vnd.apache.parquet' });
            res.write(PARQUET.subarray(0, 4));

            if (url.pathname === '/bucket/slow') {
                held.push(res);
            }
        } else if (req.headers['if-none-match'] === STORED_ETAG) {
            res.writeHead(304, { etag: STORED_ETAG }).end();
        } else {
            res.writeHead(200, {
                'content-type': 'application/vnd.apache.parquet',
                'content-length': PARQUET.byteLength,
                etag: STORED_ETAG,
                'x-goog-hash': 'crc32c=x',
            });
            res.end(PARQUET);
        }

        return;
    }

    apisRequests.push(req.headers);

    if (spec === SPEC && cv === undefined) {
        // The spec's current read. `mode` picks the answer: `legacy` sends
        // none of the new headers, `accepted` a 202, `missing` a 404.
        const mode = url.searchParams.get('mode');

        if (mode === 'accepted') {
            res.writeHead(202, {
                'content-type': 'application/json',
                'cache-control': 'no-store',
                'retry-after': '2',
            }).end('{}');
        } else if (mode === 'missing') {
            res.writeHead(404, { 'content-type': 'application/problem+json' }).end('{}');
        } else {
            const named =
                mode === 'legacy'
                    ? {}
                    : { 'x-dfo-freshness': 'pending', 'x-dfo-content-version': CV };

            if (req.headers['if-none-match'] === CURRENT_ETAG) {
                res.writeHead(304, { etag: CURRENT_ETAG, ...named }).end();
            } else {
                res.writeHead(200, {
                    'content-type': 'application/json',
                    'cache-control': 'no-cache',
                    etag: CURRENT_ETAG,
                    'x-dfo-trace-id': MANIFEST_TRACE,
                    ...named,
                });
                res.end('{"artifacts": []}');
            }
        }

        return;
    }

    if (spec !== SPEC || !cv?.startsWith('cv_') || parts.length > 7) {
        res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': OTHER_CACHE_CONTROL,
        });
        res.end('{}');
    } else if (cv !== CV) {
        res.writeHead(404, { 'content-type': 'application/problem+json' }).end('{}');
    } else if (selector === undefined && req.headers['if-none-match'] === MANIFEST_ETAG) {
        res.writeHead(304, { etag: MANIFEST_ETAG }).end();
    } else if (selector === undefined) {
        res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
            etag: MANIFEST_ETAG,
            'x-dfo-trace-id': MANIFEST_TRACE,
            'server-timing': 'app;dur=12',
        });
        res.end('{"artifacts": []}');
    } else if (selector === 'file' && url.searchParams.get('format') === 'rendered') {
        res.writeHead(200, { 'content-type': 'text/csv' }).end('a,b\n');
    } else if (selector === 'file') {
        res.writeHead(302, { location: `${base}/bucket/selected`, 'cache-control': 'no-store' });
        res.end();
    } else if (digest === 'elsewhere') {
        res.writeHead(302, { location: 'https://example.org/object', 'cache-control': 'no-store' });
        res.end();
    } else {
        const object = ['denied', 'slow', 'stall', 'hang'].includes(digest!) ? digest : 'object';

        res.writeHead(302, {
            location: `${base}/bucket/${object}`,
            'cache-control': 'no-store',
            'x-dfo-trace-id': FILE_TRACE,
            ...(digest === 'none' || !digest ? {} : { 'x-dfo-artifact-tier': digest }),
        });
        res.end();
    }
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
test.after(() => {
    server.closeAllConnections();
    server.close();
});

const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// forward() names the caller only to dfo-apis, read from SEARCH_API_BASE per call.
process.env.SEARCH_API_BASE = base;

// Every read logs a line; the log tests read them from here. Failures log
// at error level.
const logged = mock.method(console, 'log', () => {});
const loggedErrors = mock.method(console, 'error', () => {});
const lines = (calls: { arguments: unknown[] }[]) =>
    calls.map((c) => JSON.parse(String(c.arguments[0])));
const loggedReads = () => lines(logged.mock.calls).filter((e) => e.message === 'gateway.delivery');

const call = (
    rest: string,
    {
        method = 'GET',
        headers = {},
        storageBounds,
    }: {
        method?: string;
        headers?: Record<string, string>;
        storageBounds?: { headersMs: number; stallMs: number };
    } = {},
): Promise<Response> =>
    forwardDatasets(
        new Request(`http://site.test/api/v1/datasets/${rest}`, {
            method,
            headers: { 'x-forwarded-for': CLIENT_ADDRESS, ...headers },
        }) as NextRequest,
        {
            segments: rest.split('?')[0]!.split('/'),
            target: `${base}/api/datasets/${rest}`,
            unreachable: 'The Datasets API is unreachable.',
            storageOrigin: base,
            storageBounds,
        },
    );

const file = (digest: string) => `${SPEC}/${CV}/files/${digest}`;

const SHORT_BOUNDS = { headersMs: 100, stallMs: 100 };

// A Cache-Control header's directives, by name; a bare directive maps to ''.
const directives = (header: string | null): Map<string, string> =>
    new Map(
        (header ?? '').split(',').map((part) => {
            const [name = '', value = ''] = part.trim().split('=');

            return [name.toLowerCase(), value];
        }),
    );

const cacheControlOf = async (rest: string): Promise<string | null> => {
    const res = await call(rest);

    assert.equal(res.status, 200);
    await res.body?.cancel();

    return res.headers.get('cache-control');
};

test('file: follows the storage redirect and relays the bytes and their headers', async () => {
    const res = await call(file('pinned'), { headers: { 'x-dfo-client': 'ts/1.0' } });

    assert.equal(res.status, 200);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PARQUET);
    assert.equal(res.headers.get('content-type'), 'application/vnd.apache.parquet');
    assert.equal(res.headers.get('content-length'), String(PARQUET.byteLength));
    assert.equal(res.headers.get('etag'), STORED_ETAG);
    assert.equal(res.headers.get('location'), null);
    assert.equal(res.headers.get('x-dfo-artifact-tier'), null);
    assert.equal(res.headers.get('x-goog-hash'), null);
    // The storage hop carries nothing of the caller's.
    assert.equal(storageRequests.at(-1)?.['x-dfo-client'], undefined);
});

for (const digest of ['pinned', 'working', 'none']) {
    test(`file: a ${digest} tier is cached publicly and tagged`, async () => {
        const res = await call(file(digest));

        assert.equal(res.status, 200);
        assert.ok(directives(res.headers.get('cache-control')).has('public'));
        assert.equal(res.headers.get('cache-tag'), CV);
        await res.body?.cancel();
    });
}

test('file: a pinned file is held longer than a working or untiered one', async () => {
    const pinned = directives(await cacheControlOf(file('pinned')));
    const working = await cacheControlOf(file('working'));

    assert.equal(await cacheControlOf(file('none')), working);
    assert.ok(Number(pinned.get('s-maxage')) > Number(directives(working).get('s-maxage')));
    assert.ok(Number(pinned.get('max-age')) > Number(directives(working).get('max-age')));
});

for (const [name, rest, status] of [
    ['a file redirect off storage', file('elsewhere'), 302],
    ['a file storage refuses', file('denied'), 302],
    ['the selector', `${SPEC}/${CV}/file?format=csv`, 302],
    ['a selector that answers itself', `${SPEC}/${CV}/file?format=rendered`, 200],
    ['a missing file', `${SPEC}/cv_other/files/pinned`, 404],
    ['a missing manifest', `${SPEC}/cv_other`, 404],
] as const) {
    test(`${name} is relayed as ${status}, no-store and untagged`, async () => {
        const res = await call(rest);

        assert.equal(res.status, status);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('cache-tag'), null);

        if (status === 302) {
            assert.ok(res.headers.get('location'));
        }

        await res.body?.cancel();
    });
}

test('manifest: a 200 is cached as briefly as a working file, and tagged', async () => {
    const res = await call(`${SPEC}/${CV}`);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), await cacheControlOf(file('working')));
    assert.equal(res.headers.get('cache-tag'), CV);
    assert.deepEqual(await res.json(), { artifacts: [] });
});

for (const [name, rest] of [
    ['an operation', 'operations/op_x'],
    ['an export', 'exports/exp_x'],
    ['a version list', `${SPEC}/versions`],
    ['an options list', `${SPEC}/options`],
    ['a path below a file', `${file('pinned')}/extra`],
    ['a spec id in the wrong case', `Spec_abc/${CV}`],
] as const) {
    test(`other routes: ${name} is forwarded with no read handling`, async () => {
        logged.mock.resetCalls();
        const res = await call(rest, { headers: { origin: 'http://localhost:3000' } });

        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), OTHER_CACHE_CONTROL);
        assert.equal(res.headers.get('cache-tag'), null);
        assert.equal(res.headers.get('vary'), null);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
        await res.arrayBuffer();
        assert.equal(loggedReads().length, 0);
    });
}

test('cache: a cacheable answer drops the headers of the request that filled it', async () => {
    const origin = 'http://localhost:3000';
    const cached = await call(`${SPEC}/${CV}`, { headers: { origin } });
    const uncached = await call(`${SPEC}/cv_other`, { headers: { origin } });

    assert.equal(cached.status, 200);
    assert.equal(cached.headers.get('x-dfo-trace-id'), null);
    assert.equal(cached.headers.get('server-timing'), null);
    assert.doesNotMatch(cached.headers.get('access-control-expose-headers')!, /Trace|RateLimit/i);
    assert.match(uncached.headers.get('access-control-expose-headers')!, /X-RateLimit-Remaining/);
    await Promise.all([cached.body?.cancel(), uncached.body?.cancel()]);
});

test('cache: dropPerRequestHeaders drops rate-limit, trace and timing headers only', () => {
    const headers = new Headers({
        'X-RateLimit-Limit': '120',
        'X-RateLimit-Remaining': '119',
        'X-RateLimit-Reset': '30',
        'X-DFO-Trace-Id': 't',
        'Server-Timing': 'app;dur=1',
        ETag: '"e"',
        'Content-Type': 'application/json',
    });

    dropPerRequestHeaders(headers);
    assert.deepEqual([...headers.keys()], ['content-type', 'etag']);
});

test('revalidation: a manifest relays dfo-apis 304 with the 200 cache headers', async () => {
    const fresh = await call(`${SPEC}/${CV}`);
    const res = await call(`${SPEC}/${CV}`, { headers: { 'if-none-match': MANIFEST_ETAG } });

    assert.equal(res.status, 304);
    assert.equal(res.headers.get('etag'), MANIFEST_ETAG);
    assert.equal(res.headers.get('cache-control'), fresh.headers.get('cache-control'));
    assert.equal(res.headers.get('cache-tag'), CV);
    await fresh.body?.cancel();
});

test('revalidation: a file sends If-None-Match to storage and relays its 304', async () => {
    const fresh = await call(file('pinned'));
    const res = await call(file('pinned'), { headers: { 'if-none-match': STORED_ETAG } });

    assert.equal(storageRequests.at(-1)?.['if-none-match'], STORED_ETAG);
    assert.equal(res.status, 304);
    assert.equal(res.headers.get('etag'), STORED_ETAG);
    assert.equal(res.headers.get('cache-control'), fresh.headers.get('cache-control'));
    assert.equal(res.headers.get('cache-tag'), CV);
    await fresh.body?.cancel();
});

test(
    'storage: no headers in time falls back to the 302, no-store, and logs an error',
    // Without the bound the call never ends, hence the timeout.
    { timeout: 2000 },
    async () => {
        loggedErrors.mock.resetCalls();
        const res = await call(file('hang'), { storageBounds: SHORT_BOUNDS });

        assert.equal(res.status, 302);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.ok(res.headers.get('location'));
        await res.body?.cancel();

        const [entry] = lines(loggedErrors.mock.calls);

        assert.equal(entry.severity, 'ERROR');
        assert.equal(entry.message, 'gateway.delivery_failed');
        assert.equal(entry.path, `/api/v1/datasets/${file('hang')}`);
        assert.equal(entry.trace_id, FILE_TRACE);
        assert.equal(entry.error, 'TimeoutError');
    },
);

test('storage: a refusal logs an error with the storage status', async () => {
    loggedErrors.mock.resetCalls();
    const res = await call(file('denied'));

    await res.body?.cancel();

    const [entry] = lines(loggedErrors.mock.calls);

    assert.equal(entry.message, 'gateway.delivery_failed');
    assert.equal(entry.storage_status, 403);
});

test(
    'storage: a body that stalls ends in an error, logged with its cause',
    // Without the bound the call never ends, hence the timeout.
    { timeout: 2000 },
    async () => {
        loggedErrors.mock.resetCalls();
        const res = await call(file('stall'), { storageBounds: SHORT_BOUNDS });
        const reader = res.body!.getReader();

        assert.deepEqual(Buffer.from((await reader.read()).value!), PARQUET.subarray(0, 4));
        await assert.rejects(reader.read(), { name: 'StorageStallError' });

        const [entry] = lines(loggedErrors.mock.calls);

        assert.equal(entry.severity, 'ERROR');
        assert.equal(entry.message, 'gateway.delivery');
        assert.equal(entry.door, 'files');
        assert.equal(entry.digest, 'stall');
        assert.equal(entry.trace_id, FILE_TRACE);
        assert.equal(entry.caller, apisRequests.at(-1)?.['x-dfo-caller']);
        assert.equal(entry.caller_source, 'vouched');
        assert.equal(entry.served_by, 'gateway');
        assert.equal(entry.status, 200);
        assert.equal(entry.complete, false);
        assert.equal(entry.bytes, 4);
        assert.match(entry.error, /^StorageStallError/);
    },
);

test('log: a client that cancels the body is logged at info, incomplete', async () => {
    logged.mock.resetCalls();
    loggedErrors.mock.resetCalls();
    const res = await call(file('slow'));

    await res.body!.cancel();
    held.pop()!.end();

    const [entry] = loggedReads();

    assert.equal(entry.severity, 'INFO');
    assert.equal(entry.complete, false);
    assert.equal(loggedErrors.mock.callCount(), 0);
});

// A gateway that buffered the file would never answer, hence the timeout.
test(
    'file: the first stored chunk reaches the client before storage finishes',
    { timeout: 5000 },
    async () => {
        const res = await call(file('slow'));
        const reader = res.body!.getReader();
        const first = await reader.read();

        assert.deepEqual(Buffer.from(first.value!), PARQUET.subarray(0, 4));

        const rest = reader.read();

        held.pop()!.end(PARQUET.subarray(4));
        assert.deepEqual(Buffer.from((await rest).value!), PARQUET.subarray(4));
        await reader.cancel();
    },
);

for (const [origin, allowed] of [
    ['https://developmentfinance.org', true],
    ['https://www.developmentfinance.org', true],
    ['https://preview.developmentfinance.org', true],
    ['http://localhost:3000', true],
    ['https://dfo-prototypes.one-org.workers.dev', true],
    ['https://pr-163-dfo-prototypes.one-org.workers.dev', true],
    ['https://06509654-dfo-prototypes.one-org.workers.dev', true],
    ['http://developmentfinance.org', false],
    ['https://developmentfinance.org.example.com', false],
    ['https://dfo-prototypes.one-org.workers.dev.example.com', false],
    ['https://pr-1-dfo-prototypes.other.workers.dev', false],
    ['https://evildfo-prototypes.one-org.workers.dev', false],
    ['http://localhost:4000', false],
    ['null', false],
] as const) {
    test(`isDfoOrigin: ${origin} is ${allowed ? 'allowed' : 'refused'}`, () => {
        assert.equal(isDfoOrigin(origin), allowed);
    });
}

test('cors: a DFO origin gets its origin back, and every read varies on Origin', async () => {
    const origin = 'https://pr-163-dfo-prototypes.one-org.workers.dev';
    const allowed = await call(file('pinned'), { headers: { origin } });
    const refused = await call(file('pinned'), { headers: { origin: 'https://example.org' } });

    assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
    assert.match(allowed.headers.get('access-control-expose-headers') ?? '', /\bETag\b/);
    assert.equal(allowed.headers.get('vary'), 'Origin');
    assert.equal(refused.headers.get('access-control-allow-origin'), null);
    assert.equal(refused.headers.get('vary'), 'Origin');
    await Promise.all([allowed.body?.cancel(), refused.body?.cancel()]);
});

test('cors: the gateway answers a DFO origin preflight for GET only', async () => {
    const res = await call(`${SPEC}/${CV}`, {
        method: 'OPTIONS',
        headers: {
            origin: 'http://localhost:3000',
            'access-control-request-method': 'GET',
            'access-control-request-headers': 'x-dfo-client',
        },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(res.headers.get('access-control-allow-methods'), 'GET');
    assert.match(res.headers.get('access-control-allow-headers') ?? '', /\bX-DFO-Client\b/i);
    assert.equal(res.headers.get('vary'), 'Origin');
});

test('cors: a preflight from another origin is forwarded, gets no CORS headers, and is logged', async () => {
    logged.mock.resetCalls();
    const res = await call(`${SPEC}/${CV}`, {
        method: 'OPTIONS',
        headers: { origin: 'https://example.org', 'access-control-request-method': 'GET' },
    });

    assert.notEqual(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    await res.body?.cancel();

    const [entry] = lines(logged.mock.calls);

    assert.equal(entry.severity, 'INFO');
    assert.equal(entry.message, 'gateway.cors_refused');
    assert.equal(entry.door, 'snapshot');
    assert.equal(entry.method, 'OPTIONS');
    assert.equal(entry.origin_host, 'example.org');
});

test('cors: a read from another origin is logged as refused', async () => {
    logged.mock.resetCalls();
    const res = await call(`${SPEC}/${CV}`, { headers: { origin: 'https://example.org' } });

    await res.arrayBuffer();

    const refused = lines(logged.mock.calls).filter((e) => e.message === 'gateway.cors_refused');

    assert.deepEqual(
        refused.map((e) => [e.method, e.origin_host]),
        [['GET', 'example.org']],
    );
});

test('cors: a HEAD preflight gets no gateway answer', async () => {
    const res = await call(`${SPEC}/${CV}`, {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'HEAD' },
    });

    assert.notEqual(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    await res.body?.cancel();
});

test('log: a file read is one gateway.delivery line, written when the body ends', async () => {
    logged.mock.resetCalls();
    const res = await call(file('pinned'), {
        headers: {
            origin: 'http://localhost:3000',
            referer: 'http://localhost:3000/prototypes/debt/?token=secret#x',
            'x-dfo-client': 'dfo-ts/0.4.0 (node 24)',
            'user-agent': 'node',
            'sec-fetch-site': 'cross-site',
        },
    });

    assert.equal(logged.mock.callCount(), 0);
    await res.arrayBuffer();
    assert.equal(logged.mock.callCount(), 1);

    const sent = apisRequests.at(-1)!;
    const [entry] = loggedReads();

    // The referer's path, query and fragment, a share token among them, stay out of the line.
    assert.doesNotMatch(JSON.stringify(entry), /prototypes|token|secret/);

    // The trace id is dfo-apis's, though the cached answer drops the header.
    assert.equal(res.headers.get('x-dfo-trace-id'), null);
    assert.match(String(sent['x-dfo-caller']), /^ip:[0-9a-f]{32}$/);
    assert.deepEqual(
        { ...entry, duration_ms: typeof entry.duration_ms },
        {
            severity: 'INFO',
            message: 'gateway.delivery',
            door: 'files',
            trace_id: FILE_TRACE,
            spec_id: SPEC,
            content_version: CV,
            digest: 'pinned',
            caller: sent['x-dfo-caller'],
            caller_source: 'vouched',
            surface: 'api',
            client: 'dfo-ts/0.4.0',
            user_agent: 'node',
            origin_host: 'localhost:3000',
            referer_host: 'localhost:3000',
            served_by: 'gateway',
            status: 200,
            tier: 'pinned',
            bytes: PARQUET.byteLength,
            complete: true,
            duration_ms: 'number',
        },
    );
});

test('log: a manifest read is a snapshot line with the trace id dfo-apis sent', async () => {
    logged.mock.resetCalls();
    const res = await call(`${SPEC}/${CV}`, {
        headers: { 'sec-fetch-site': 'same-origin', 'x-dfo-client': 'not a token' },
    });

    await res.arrayBuffer();

    const [entry] = loggedReads();

    assert.equal(res.headers.get('x-dfo-trace-id'), null);
    assert.equal(entry.door, 'snapshot');
    assert.equal(entry.trace_id, MANIFEST_TRACE);
    assert.equal(entry.spec_id, SPEC);
    assert.equal(entry.content_version, CV);
    assert.equal('digest' in entry, false);
    assert.equal(entry.caller, apisRequests.at(-1)?.['x-dfo-caller']);
    assert.equal(entry.caller_source, 'vouched');
    assert.equal(entry.surface, 'website');
    assert.equal(entry.client, null);
    assert.equal(entry.origin_host, null);
    assert.equal(entry.served_by, 'gateway');
    assert.equal(entry.status, 200);
    assert.equal(entry.bytes, '{"artifacts": []}'.length);
});

test('log: the selector and the manifest are logged by door', async () => {
    logged.mock.resetCalls();

    await (await call(`${SPEC}/${CV}/file?format=csv`)).arrayBuffer();
    await (await call(`${SPEC}/${CV}`)).arrayBuffer();

    assert.deepEqual(
        loggedReads().map((entry) => entry.door),
        ['file_selector', 'snapshot'],
    );
});

const ORIGIN = 'http://localhost:3000';

test('current: a 200 is cached for a minute, varies on Origin, is tagged from dfo-apis', async () => {
    const res = await call(SPEC, { headers: { origin: ORIGIN } });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
    assert.equal(res.headers.get('vary'), 'Origin');
    assert.equal(res.headers.get('cache-tag'), CV);
    assert.equal(res.headers.get('etag'), CURRENT_ETAG);
    assert.equal(res.headers.get('x-dfo-freshness'), 'pending');
    assert.equal(res.headers.get('x-dfo-content-version'), null);
    assert.equal(res.headers.get('x-dfo-trace-id'), null);
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(res.headers.get('access-control-expose-headers')!, /\bX-DFO-Freshness\b/);
    assert.deepEqual(await res.json(), { artifacts: [] });
});

test('current: a query string still reads as a current read', async () => {
    const res = await call(`${SPEC}?rendering=csv`);

    assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
    assert.equal(res.headers.get('cache-tag'), CV);
    await res.body?.cancel();
});

test('current: If-None-Match reaches dfo-apis and its 304 keeps the 200 headers', async () => {
    const res = await call(SPEC, { headers: { 'if-none-match': CURRENT_ETAG } });

    assert.equal(apisRequests.at(-1)?.['if-none-match'], CURRENT_ETAG);
    assert.equal(res.status, 304);
    assert.equal(res.headers.get('etag'), CURRENT_ETAG);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
    assert.equal(res.headers.get('vary'), 'Origin');
    assert.equal(res.headers.get('cache-tag'), CV);
    assert.equal(res.headers.get('x-dfo-freshness'), 'pending');
    assert.equal(res.headers.get('x-dfo-content-version'), null);
});

test('current: a dfo-apis that sends no freshness or version yields an untagged answer', async () => {
    logged.mock.resetCalls();
    const res = await call(`${SPEC}?mode=legacy`, { headers: { origin: ORIGIN } });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
    assert.equal(res.headers.get('cache-tag'), null);
    assert.equal(res.headers.get('x-dfo-freshness'), null);
    await res.arrayBuffer();
    assert.equal(loggedReads()[0].content_version, null);
});

for (const [name, mode, status] of [
    ['a 202', 'accepted', 202],
    ['a 404', 'missing', 404],
] as const) {
    test(`current: ${name} is no-store and untagged`, async () => {
        const res = await call(`${SPEC}?mode=${mode}`, { headers: { origin: ORIGIN } });

        assert.equal(res.status, status);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('cache-tag'), null);
        assert.equal(res.headers.get('vary'), 'Origin');
        assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
        await res.arrayBuffer();
    });
}

test('current: the preflight is answered and a foreign origin is logged as refused', async () => {
    logged.mock.resetCalls();
    const preflight = await call(SPEC, {
        method: 'OPTIONS',
        headers: { origin: ORIGIN, 'access-control-request-method': 'GET' },
    });
    const foreign = await call(SPEC, { headers: { origin: 'https://example.org' } });

    assert.equal(preflight.status, 204);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
    await foreign.arrayBuffer();

    const refused = lines(logged.mock.calls).filter((e) => e.message === 'gateway.cors_refused');

    assert.equal(refused.length, 1);
    assert.equal(refused[0].door, 'definition');
});

test('log: a current read is a definition line with the content version dfo-apis named', async () => {
    logged.mock.resetCalls();
    await (await call(SPEC, { headers: { 'sec-fetch-site': 'same-origin' } })).arrayBuffer();

    const [entry] = loggedReads();

    assert.equal(entry.door, 'definition');
    assert.equal(entry.trace_id, MANIFEST_TRACE);
    assert.equal(entry.spec_id, SPEC);
    assert.equal(entry.content_version, CV);
    assert.equal('digest' in entry, false);
    assert.equal(entry.served_by, 'gateway');
    assert.equal(entry.status, 200);
});
