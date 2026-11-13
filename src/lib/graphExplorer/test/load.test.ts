/**
 * `load.ts`: when the loader waits for a document still being built, and the
 * error it raises for each other failure, over a scripted fetch and clock.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILD_WAIT_MS, LoadError, loadDocument, retryDelay } from '../load.ts';
import { readOntology } from '../wire.ts';
import { ontologyBody } from './fixtures.ts';

test('a 503 with Retry-After in seconds waits that long', () => {
    assert.equal(retryDelay({ status: 503, retryAfter: '5', waitedMs: 0, nowMs: 0 }), 5000);
});

test('a 503 with Retry-After as a date waits until then', () => {
    const nowMs = Date.parse('2026-11-13T12:00:00Z');
    assert.equal(
        retryDelay({
            status: 503,
            retryAfter: 'Fri, 13 Nov 2026 12:00:07 GMT',
            waitedMs: 0,
            nowMs,
        }),
        7000,
    );
});

test('the wait is at least a second and never runs past the minute', () => {
    assert.equal(retryDelay({ status: 503, retryAfter: '0', waitedMs: 0, nowMs: 0 }), 1000);
    assert.equal(
        retryDelay({ status: 503, retryAfter: '30', waitedMs: BUILD_WAIT_MS - 2000, nowMs: 0 }),
        2000,
    );
    assert.equal(
        retryDelay({ status: 503, retryAfter: '5', waitedMs: BUILD_WAIT_MS, nowMs: 0 }),
        null,
    );
});

test('an unreadable Retry-After still waits', () => {
    assert.equal(retryDelay({ status: 503, retryAfter: 'soon', waitedMs: 0, nowMs: 0 }), 5000);
});

test('only a 503 that carries Retry-After is retried', () => {
    assert.equal(retryDelay({ status: 503, retryAfter: null, waitedMs: 0, nowMs: 0 }), null);
    assert.equal(retryDelay({ status: 504, retryAfter: '5', waitedMs: 0, nowMs: 0 }), null);
    assert.equal(retryDelay({ status: 500, retryAfter: null, waitedMs: 0, nowMs: 0 }), null);
});

/** A fetch answering from a script, a clock the sleeps advance, and the waits it saw. */
const rig = (answers: (() => Response)[]) => {
    let clock = 0;
    const waits: number[] = [];
    const urls: string[] = [];
    const options = {
        fetch: async (url: string | URL | Request) => {
            urls.push(String(url));
            const next = answers.shift();
            if (!next) throw new Error('no scripted answer left');
            return next();
        },
        sleep: async (ms: number) => {
            clock += ms;
        },
        now: () => clock,
        onWait: (ms: number) => waits.push(ms),
    };
    return { options, waits, urls };
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
    });

const building = () => json({ title: 'Service unavailable' }, 503, { 'retry-after': '5' });

test('the loader waits out a build, then reads the document', async () => {
    const { options, waits, urls } = rig([building, building, () => json(ontologyBody())]);
    const document = await loadDocument(
        'The ontology',
        '/api/graph/ontology',
        readOntology,
        options,
    );
    assert.ok(document.nodes.length > 0);
    assert.deepEqual(waits, [5000, 5000]);
    assert.equal(urls.length, 3);
});

test('a build still running after a minute fails and says so', async () => {
    const { options, waits } = rig(Array.from({ length: 20 }, () => building));
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, options),
        (error: unknown) =>
            error instanceof LoadError &&
            error.message ===
                'The ontology could not be loaded: it was still being built after a minute.',
    );
    assert.equal(
        waits.reduce((sum, ms) => sum + ms, 0),
        BUILD_WAIT_MS,
    );
});

test('another failing status names the status and the problem detail', async () => {
    const { options, waits } = rig([
        () => json({ title: 'Bad gateway', detail: 'The graph did not answer' }, 502),
    ]);
    await assert.rejects(
        loadDocument('The datasets', '/api/graph/ontology/provenances', readOntology, options),
        {
            name: 'LoadError',
            message:
                'The datasets could not be loaded: the Graph API answered 502 (The graph did not answer).',
        },
    );
    assert.deepEqual(waits, []);
});

test('a changed wire shape fails with the guard error', async () => {
    const body = ontologyBody() as { nodes: Record<string, unknown>[] };
    delete body.nodes[0]!.declared_by;
    const { options } = rig([() => json(body)]);
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, options),
        {
            name: 'LoadError',
            message:
                'The ontology has a shape this page does not read: ontology.nodes[0].declared_by: expected a member.',
        },
    );
});

test('a body that is not JSON and a request that fails each name the document', async () => {
    const notJson = rig([() => new Response('<html>', { status: 200 })]);
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, notJson.options),
        { name: 'LoadError', message: 'The ontology arrived, but not as JSON.' },
    );

    const offline = rig([
        () => {
            throw new TypeError('fetch failed');
        },
    ]);
    await assert.rejects(
        loadDocument('The ontology', '/api/graph/ontology', readOntology, offline.options),
        {
            name: 'LoadError',
            message: 'The ontology could not be requested: the Graph API did not answer.',
        },
    );
});

test('an abort rejects with the signal reason, not a LoadError', async () => {
    const controller = new AbortController();
    const reason = new DOMException('stopped', 'AbortError');
    const { options } = rig([building, building]);
    const waiting = loadDocument('The ontology', '/api/graph/ontology', readOntology, {
        ...options,
        signal: controller.signal,
        sleep: (_ms, signal) =>
            new Promise((_resolve, reject) => {
                if (signal?.aborted) return reject(signal.reason);
                signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
    });
    controller.abort(reason);
    await assert.rejects(waiting, (error: unknown) => error === reason);
});
