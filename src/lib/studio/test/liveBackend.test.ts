/**
 * `readComponent`'s own failure paths: a ref outside the service's id form
 * reaches no URL, and each way the transport can fail is a `BackendError`
 * with a machine-readable code.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BackendError, readComponent } from '../liveBackend.ts';
import { APIS, componentRead } from './fixtures/component-read.ts';

const REF = { component_id: 'cmp_data', revision: 3 };

const backendOver = (answer: () => Response | Promise<Response>) => {
    const calls: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
        calls.push(String(url));

        return answer();
    };

    return { calls, backend: { apisBase: APIS, fetch: fetcher as typeof fetch } };
};

const failureOf = async (backend: ReturnType<typeof backendOver>['backend'], ref = REF) =>
    readComponent(backend, ref).then(
        () => assert.fail('the read should have failed'),
        (error: unknown) => error,
    );

const BAD_REFS = [
    { component_id: '..', revision: 1 },
    { component_id: '.', revision: 1 },
    { component_id: 'cmp_a/../b', revision: 1 },
    { component_id: 'cmp_a?x=1', revision: 1 },
    { component_id: 'cmp_', revision: 1 },
    { component_id: `cmp_${'a'.repeat(65)}`, revision: 1 },
    { component_id: 'cmp_ok', revision: 0 },
    { component_id: 'cmp_ok', revision: 1.5 },
];

test('a ref outside the service’s id form is request_invalid and reaches no URL', async () => {
    for (const ref of BAD_REFS) {
        const { calls, backend } = backendOver(() => Response.json({}));
        const failure = await failureOf(backend, ref);

        assert.ok(failure instanceof BackendError, JSON.stringify(ref));
        assert.equal(failure.code, 'request_invalid', JSON.stringify(ref));
        assert.equal(calls.length, 0, JSON.stringify(ref));
    }
});

test('each transport outcome is a back-end error with its own code', async () => {
    const cases: [string, () => Response, string][] = [
        [
            'dfo-apis unreachable',
            () => {
                throw new TypeError('fetch failed');
            },
            'backend_unreachable',
        ],
        [
            'the call times out',
            () => {
                throw new DOMException('timed out', 'TimeoutError');
            },
            'backend_timeout',
        ],
        [
            'a refusal with no readable code',
            () => Response.json({ code: 'Bad credential x' }, { status: 401 }),
            'backend_refused',
        ],
        ['a 200 outside the contract', () => new Response('not json'), 'backend_invalid'],
    ];

    for (const [name, answer, code] of cases) {
        const failure = await failureOf(backendOver(answer).backend);

        assert.ok(failure instanceof BackendError, name);
        assert.equal(failure.code, code, name);
        assert.ok(!failure.message.includes('Bad credential'), name);
    }
});

test('a refusal that says it is retryable is a retryable error', async () => {
    const { backend } = backendOver(() =>
        Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 }),
    );
    const failure = await failureOf(backend);

    assert.ok(failure instanceof BackendError);
    assert.equal(failure.code, 'service_unavailable');
    assert.equal(failure.status, 503);
    assert.equal(failure.retryable, true);
});

test('a read of a well-formed ref asks the service for that revision', async () => {
    const { calls, backend } = backendOver(() => Response.json(componentRead('cmp_data', 3, null)));

    await readComponent(backend, REF);

    assert.deepEqual(calls, [`${APIS}/api/presentation/components/cmp_data?revision=3`]);
});
