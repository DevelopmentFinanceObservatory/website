/**
 * `datasetsFetch.ts`: a refusal the Datasets API marks retryable is repeated
 * a bounded number of times, after the wait its `Retry-After` names or a
 * doubling backoff, and only for calls the API documents as safe to repeat.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_RETRIES, retryAfterMs, retryingFetch } from '../datasetsFetch.ts';

const BUSY = { code: 'service_unavailable', retryable: true };

const answer = (status: number, body: unknown = null, headers: Record<string, string> = {}) =>
    new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/problem+json', ...headers },
    });

// Answers each call with the next of `answers`, the last one repeating, and
// records every call and every wait.
const scripted = (...answers: (() => Response)[]) => {
    const calls: { url: string; method: string }[] = [];
    const waits: number[] = [];
    const fetchImpl = retryingFetch({
        fetchImpl: async (input, init) => {
            calls.push({ url: String(input), method: init?.method ?? 'GET' });

            return answers[Math.min(calls.length, answers.length) - 1]!();
        },
        sleep: async (ms) => {
            waits.push(ms);
        },
    });

    return { calls, waits, fetchImpl };
};

for (const status of [503, 429]) {
    test(`a retryable ${status} is retried after the backoff, then the answer returns`, async () => {
        const { calls, waits, fetchImpl } = scripted(
            () => answer(status, BUSY),
            () => answer(200, { content_version: 'cv_1' }),
        );

        const res = await fetchImpl('https://api/api/datasets/spec_1/cv_1');

        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { content_version: 'cv_1' });
        assert.equal(calls.length, 2);
        assert.deepEqual(waits, [500]);
    });
}

test('a Retry-After in seconds sets the wait', async () => {
    const { waits, fetchImpl } = scripted(
        () => answer(503, BUSY, { 'Retry-After': '2' }),
        () => answer(200, {}),
    );

    await fetchImpl('https://api/api/datasets/spec_1/cv_1');

    assert.deepEqual(waits, [2000]);
});

test('retryAfterMs reads seconds and HTTP dates, and nothing else', () => {
    const now = Date.parse('2026-10-11T12:00:00Z');

    assert.equal(retryAfterMs('3', now), 3000);
    assert.equal(retryAfterMs('Sun, 11 Oct 2026 12:00:05 GMT', now), 5000);
    assert.equal(retryAfterMs('Sun, 11 Oct 2026 11:59:00 GMT', now), 0);
    assert.equal(retryAfterMs('soon', now), null);
    assert.equal(retryAfterMs(null, now), null);
});

for (const [name, refusal] of [
    ['a 503 the API marks not retryable', () => answer(503, { ...BUSY, retryable: false })],
    ['a 503 with no problem body', () => answer(503)],
    ['a 400 marked retryable', () => answer(400, BUSY)],
    ['a refusal naming a wait over the cap', () => answer(503, BUSY, { 'Retry-After': '3600' })],
] as const) {
    test(`${name} goes back at once`, async () => {
        const { calls, waits, fetchImpl } = scripted(refusal, () => answer(200, {}));

        const res = await fetchImpl('https://api/api/datasets/spec_1/cv_1');

        assert.equal(res.status, refusal().status);
        assert.equal(calls.length, 1);
        assert.deepEqual(waits, []);
    });
}

test('retries stop after MAX_RETRIES and the last refusal returns', async () => {
    const { calls, waits, fetchImpl } = scripted(() => answer(503, BUSY));

    const res = await fetchImpl('https://api/api/datasets/spec_1/cv_1');

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), BUSY);
    assert.equal(calls.length, MAX_RETRIES + 1);
    assert.deepEqual(waits, [500, 1000, 2000]);
});

for (const [path, retried] of [
    ['/api/datasets', true],
    ['https://api/api/datasets/spec_1/members', true],
    ['https://api/api/datasets/spec_1/options', true],
    ['https://api/api/datasets/spec_1/cv_1/pin', true],
    ['https://api/api/datasets/register', false],
    ['https://api/api/datasets/frames/publish', false],
] as const) {
    test(`a POST to ${path} is ${retried ? '' : 'not '}retried`, async () => {
        const { calls, fetchImpl } = scripted(
            () => answer(503, BUSY),
            () => answer(200, {}),
        );

        await fetchImpl(path, { method: 'POST', body: '{}' });

        assert.equal(calls.length, retried ? 2 : 1);
    });
}

test("the call's own abort ends the wait", async () => {
    const controller = new AbortController();
    const fetchImpl = retryingFetch({
        fetchImpl: async () => {
            controller.abort();

            return answer(503, BUSY);
        },
    });

    await assert.rejects(
        fetchImpl('https://api/api/datasets/spec_1/cv_1', { signal: controller.signal }),
        { name: 'AbortError' },
    );
});
