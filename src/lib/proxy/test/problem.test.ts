/**
 * `problem.ts`: the problem document for a route the proxy does not have.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { notFoundProblem } from '../problem.ts';

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
