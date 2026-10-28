/**
 * `problem.ts`: the problem documents the proxy answers with when it refuses a call itself.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    missingProblem,
    notFoundProblem,
    problem,
    rateLimitedProblem,
    requestInvalidProblem,
    unauthorizedProblem,
    unreachableProblem,
} from '../problem.ts';

test('notFoundProblem: answers 404 with a not_found problem document and a trace id', async () => {
    const res = notFoundProblem('/api/v1/nowhere');
    const body = await res.json();

    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    assert.equal(body.code, 'not_found');
    assert.equal(body.type, '/codes/not_found');
    assert.equal(body.status, 404);
    assert.equal(body.retryable, false);
    assert.match(body.trace_id, /^[0-9a-f]{32}$/);
    assert.equal(res.headers.get('x-dfo-trace-id'), body.trace_id);
});

test('notFoundProblem: each answer has its own trace id', () => {
    const [a, b] = [notFoundProblem('/x'), notFoundProblem('/x')];

    assert.notEqual(a.headers.get('x-dfo-trace-id'), b.headers.get('x-dfo-trace-id'));
});

test('rateLimitedProblem: a retryable 429 problem that keeps the rate headers and Retry-After', async () => {
    const res = rateLimitedProblem({ limit: 60, reset: 7 }, { 'X-RateLimit-Limit': '60' });
    const body = await res.json();

    assert.equal(res.status, 429);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    assert.equal(res.headers.get('retry-after'), '7');
    assert.equal(res.headers.get('x-ratelimit-limit'), '60');
    assert.equal(body.code, 'rate_limited');
    assert.equal(body.status, 429);
    assert.equal(body.retryable, true);
    assert.equal(res.headers.get('x-dfo-trace-id'), body.trace_id);
});

test('unreachableProblem: a retryable 502 transient_unavailable problem with the detail given', async () => {
    const res = unreachableProblem('The studio agent is unreachable.', {
        'X-RateLimit-Limit': '60',
    });
    const body = await res.json();

    assert.equal(res.status, 502);
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
    assert.equal(res.headers.get('x-ratelimit-limit'), '60');
    assert.equal(body.code, 'transient_unavailable');
    assert.equal(body.detail, 'The studio agent is unreachable.');
    assert.equal(body.retryable, true);
});

test('unreachableProblem: names the status of an upstream that answered before its body failed', async () => {
    const before = await unreachableProblem('The studio agent is unreachable.', {}).json();
    const after = await unreachableProblem('The studio agent is unreachable.', {}, 422).json();

    assert.equal('upstream_status' in before, false);
    assert.equal(after.upstream_status, 422);
    assert.equal(after.code, 'transient_unavailable');
});

test('problem: titles the statuses the site refuses with and spreads the extra members', async () => {
    for (const [status, title] of [
        [400, 'Bad Request'],
        [401, 'Unauthorized'],
        [403, 'Forbidden'],
        [413, 'Content Too Large'],
        [422, 'Unprocessable Content'],
        [503, 'Service Unavailable'],
    ] as const) {
        const res = problem({
            status,
            code: 'live_too_many_cards',
            detail: 'Too many.',
            retryable: false,
            extra: { limit: 20 },
        });
        const body = await res.json();

        assert.equal(res.status, status);
        assert.equal(body.title, title);
        assert.equal(body.limit, 20);
        assert.equal(body.type, 'about:blank');
    }
});

test('problem: type links the registry codes and is about:blank for any other code', async () => {
    for (const [code, type] of [
        ['request_invalid', '/codes/request_invalid'],
        ['not_found', '/codes/not_found'],
        ['rate_limited', '/codes/rate_limited'],
        ['transient_unavailable', '/codes/transient_unavailable'],
        ['unauthorized', 'about:blank'],
        ['platform_refused', 'about:blank'],
    ] as const) {
        const body = await problem({
            status: 400,
            code,
            detail: 'Refused.',
            retryable: false,
        }).json();

        assert.equal(body.type, type, code);
    }
});

test('problem: an extra member cannot replace a common member', async () => {
    const res = problem({
        status: 400,
        code: 'request_invalid',
        detail: 'Bad.',
        retryable: false,
        extra: {
            code: 'other',
            status: 200,
            type: 'x',
            title: 'x',
            detail: 'x',
            retryable: true,
            trace_id: 'x',
            limit: 3,
        },
    });
    const body = await res.json();

    assert.deepEqual(
        { code: body.code, status: body.status, type: body.type, title: body.title },
        {
            code: 'request_invalid',
            status: 400,
            type: '/codes/request_invalid',
            title: 'Bad Request',
        },
    );
    assert.equal(body.detail, 'Bad.');
    assert.equal(body.retryable, false);
    assert.equal(body.trace_id, res.headers.get('x-dfo-trace-id'));
    assert.equal(body.limit, 3);
});

test('missingProblem, requestInvalidProblem, unauthorizedProblem: the registry codes with their statuses', async () => {
    for (const [res, status, code] of [
        [missingProblem('There is no such share.'), 404, 'not_found'],
        [requestInvalidProblem('Bad body.'), 400, 'request_invalid'],
        [unauthorizedProblem(), 401, 'unauthorized'],
    ] as const) {
        const body = await res.json();

        assert.equal(res.status, status);
        assert.equal(body.code, code);
        assert.equal(body.retryable, false);
        assert.equal(body.pointer, undefined);
    }
});

test('requestInvalidProblem: names the invalid member of the body when given one', async () => {
    const body = await requestInvalidProblem('The mode is wrong.', '/mode').json();

    assert.equal(body.pointer, '/mode');
    assert.equal(body.detail, 'The mode is wrong.');
});
