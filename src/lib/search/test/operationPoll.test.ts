import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OPERATION_DEADLINE,
    pollOperation,
    type OperationEnvelope,
    type OperationPollError,
    type PollResponse,
} from '../operationPoll.ts';

// A no-op sleep so these tests run instantly regardless of the module's own
// default/backoff delays; the delays passed to it are asserted separately.
const noSleep = async () => {};

const jsonResponse = (status: number, body: unknown): PollResponse => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

test('pollOperation reports progress on every pending/running poll and returns the done manifest', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_abc',
        status: 'running',
        poll: '/api/datasets/operations/op_abc',
        retry_after_ms: 5,
        progress: { rows_written: 0, estimate_rows: 2_500_000 },
    };
    const responses = [
        jsonResponse(200, {
            operation: {
                operation_id: 'op_abc',
                status: 'running',
                poll: '/api/datasets/operations/op_abc',
                retry_after_ms: 5,
                progress: { rows_written: 1_200_000, estimate_rows: 2_500_000 },
            },
        }),
        jsonResponse(200, {
            operation: { operation_id: 'op_abc', status: 'done' },
            manifest: { content_version: 'cv_x', artifacts: [{ url: 'https://example/x' }] },
        }),
    ];
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
        urls.push(url);
        return responses.shift()!;
    };
    const progress: unknown[] = [];

    const manifest = await pollOperation(submitted, {
        fetchImpl,
        sleep: noSleep,
        onProgress: (p) => progress.push(p),
    });

    assert.deepEqual(manifest, {
        content_version: 'cv_x',
        artifacts: [{ url: 'https://example/x' }],
    });
    assert.deepEqual(urls, ['/api/datasets/operations/op_abc', '/api/datasets/operations/op_abc']);
    // The submitted envelope's own progress (0 of 2.5M) fires first, then
    // the one poll response that carried progress before the done poll.
    assert.deepEqual(progress, [
        { rows_written: 0, estimate_rows: 2_500_000 },
        { rows_written: 1_200_000, estimate_rows: 2_500_000 },
    ]);
});

test('pollOperation sleeps the server-supplied retry_after_ms, falling back to its own backoff when absent', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_backoff',
        status: 'pending',
        poll: '/poll',
        retry_after_ms: 250,
    };
    const responses = [
        jsonResponse(200, {
            operation: { operation_id: 'op_backoff', status: 'running', poll: '/poll' },
        }),
        jsonResponse(200, {
            operation: { operation_id: 'op_backoff', status: 'done' },
            manifest: { ok: true },
        }),
    ];
    const delays: number[] = [];

    const manifest = await pollOperation(submitted, {
        fetchImpl: async () => responses.shift()!,
        sleep: async (ms) => {
            delays.push(ms);
        },
        initialDelayMs: 1000,
    });

    assert.deepEqual(manifest, { ok: true });
    // First poll honours the server's own retry_after_ms (250); the second
    // poll's envelope carried none, so it falls back to the module's own
    // backoff, which has already advanced once (x1.5) by then regardless of
    // which delay the first sleep actually used.
    assert.deepEqual(delays, [250, 1500]);
});

test("pollOperation sanitizes retry_after_ms: a non-finite or negative hint falls back to the module's own backoff, a valid one is floored at 250ms and otherwise passed through unchanged", async () => {
    // Resolves in one poll, so the sleep passed before that poll is exactly
    // the value the module derived from `retryAfterMs`.
    const firstSleepFor = async (retryAfterMs: number | null): Promise<number> => {
        const delays: number[] = [];

        await pollOperation(
            {
                operation_id: 'op_sanitize',
                status: 'running',
                poll: '/poll',
                retry_after_ms: retryAfterMs,
            },
            {
                fetchImpl: async () =>
                    jsonResponse(200, { operation: { status: 'done' }, manifest: { ok: true } }),
                sleep: async (ms) => {
                    delays.push(ms);
                },
                initialDelayMs: 999,
            },
        );

        return delays[0];
    };

    // Not a finite number >= 0: ignored in favour of the module's own
    // backoff (initialDelayMs, here 999 so it can't be confused with the
    // 250ms floor).
    assert.equal(await firstSleepFor(-1), 999);
    assert.equal(await firstSleepFor(NaN), 999);
    // Below the floor: raised to it.
    assert.equal(await firstSleepFor(0), 250);
    assert.equal(await firstSleepFor(100), 250);
    // At or above the floor: passed through unchanged.
    assert.equal(await firstSleepFor(2000), 2000);
    assert.equal(await firstSleepFor(500_000), 500_000);
});

test('pollOperation throws when an envelope carries no poll path to follow', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_no_poll',
        status: 'running',
        poll: undefined,
    };

    await assert.rejects(
        pollOperation(submitted, { sleep: noSleep }),
        /op_no_poll carries no poll path/,
    );
});

test('pollOperation throws when a 200 poll response carries no operation', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_no_operation',
        status: 'running',
        poll: '/poll',
        retry_after_ms: 1,
    };

    await assert.rejects(
        pollOperation(submitted, {
            fetchImpl: async () => jsonResponse(200, {}),
            sleep: noSleep,
        }),
        /op_no_operation's poll response carried no operation/,
    );
});

test('pollOperation throws on a failed (non-2xx) poll response, carrying the refusal code', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_fail',
        status: 'running',
        poll: '/poll',
        retry_after_ms: 1,
    };

    await assert.rejects(
        pollOperation(submitted, {
            fetchImpl: async () =>
                jsonResponse(500, {
                    code: 'operation_failed',
                    detail: "operation 'op_fail' did not complete successfully: excel_limit",
                }),
            sleep: noSleep,
        }),
        (error: OperationPollError) => {
            assert.equal(error.code, 'operation_failed');
            assert.match(error.message, /excel_limit/);
            return true;
        },
    );
});

test('pollOperation refuses once the wall-clock deadline elapses without a terminal state', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_stuck',
        status: 'running',
        poll: '/poll',
        retry_after_ms: 1,
    };
    // A fake clock that advances 1ms per read, so the loop runs a bounded
    // number of iterations rather than spinning against the real clock for
    // the whole deadline.
    let clock = 0;
    const now = () => clock++;

    await assert.rejects(
        pollOperation(submitted, {
            fetchImpl: async () =>
                jsonResponse(200, {
                    operation: {
                        operation_id: 'op_stuck',
                        status: 'running',
                        poll: '/poll',
                        retry_after_ms: 1,
                    },
                }),
            sleep: noSleep,
            now,
            deadlineMs: 5,
        }),
        { message: /did not reach a terminal state within 5ms/, code: OPERATION_DEADLINE },
    );
});

test('pollOperation ends a stalled fetch or body read at the deadline', async () => {
    const stalled = new Promise<never>(() => {});
    const submitted: OperationEnvelope = {
        operation_id: 'op_stalled',
        status: 'running',
        poll: '/poll',
    };
    const stalls: Record<string, () => Promise<PollResponse>> = {
        fetch: () => stalled,
        'body read': async () => ({ ok: true, status: 200, json: () => stalled }),
    };

    for (const [stage, fetchImpl] of Object.entries(stalls)) {
        await assert.rejects(
            pollOperation(submitted, { fetchImpl, sleep: noSleep, deadlineMs: 20 }),
            /did not reach a terminal state within 20ms/,
            stage,
        );
    }
});

test('pollOperation honours a caller-supplied deadline shorter than the default', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_short',
        status: 'running',
        poll: '/poll',
        retry_after_ms: 1,
    };

    const manifest = await pollOperation(submitted, {
        fetchImpl: async () =>
            jsonResponse(200, { operation: { status: 'done' }, manifest: { ok: true } }),
        sleep: noSleep,
        deadlineMs: 50_000,
    });

    assert.deepEqual(manifest, { ok: true });
});

test('pollOperation clamps each sleep to the time left before the deadline, not the server-supplied retry_after_ms verbatim', async () => {
    const submitted: OperationEnvelope = {
        operation_id: 'op_clamp',
        status: 'running',
        poll: '/poll',
        // Oversized on purpose: unclamped, this alone would hold the loop
        // asleep for over three hours regardless of `deadlineMs`.
        retry_after_ms: 10_000_000,
    };
    let clock = 0;
    const now = () => clock;
    const delays: number[] = [];

    await assert.rejects(
        pollOperation(submitted, {
            now,
            deadlineMs: 5_000,
            sleep: async (ms) => {
                delays.push(ms);
                clock += ms;
            },
            fetchImpl: async () =>
                jsonResponse(200, {
                    operation: {
                        operation_id: 'op_clamp',
                        status: 'running',
                        poll: '/poll',
                        retry_after_ms: 10_000_000,
                    },
                }),
        }),
        /did not reach a terminal state within 5000ms/,
    );

    assert.deepEqual(delays, [5_000]);
});

test('pollOperation aborts a sleep in progress via its signal, never issuing the poll it was waiting for', async () => {
    const controller = new AbortController();
    let fetchCalls = 0;
    const submitted: OperationEnvelope = {
        operation_id: 'op_abort_sleep',
        status: 'running',
        poll: '/poll',
        retry_after_ms: 60_000,
    };

    const pending = pollOperation(submitted, {
        signal: controller.signal,
        // Only the abort can settle this await.
        sleep: () => new Promise(() => {}),
        fetchImpl: async () => {
            fetchCalls += 1;
            return jsonResponse(200, { operation: { status: 'done' }, manifest: { ok: true } });
        },
    });

    controller.abort();

    await assert.rejects(pending, (error: Error) => {
        assert.equal(error.name, 'AbortError');
        return true;
    });
    assert.equal(fetchCalls, 0);
});

test('pollOperation aborts a fetch in progress via its signal', async () => {
    const controller = new AbortController();
    let fetchSignal: AbortSignal | undefined;
    const submitted: OperationEnvelope = {
        operation_id: 'op_abort_fetch',
        status: 'running',
        poll: '/poll',
        retry_after_ms: 0,
    };

    const pending = pollOperation(submitted, {
        signal: controller.signal,
        sleep: noSleep,
        fetchImpl: (_url, signal) => {
            fetchSignal = signal;
            // Only the abort can settle this await.
            return new Promise(() => {});
        },
    });

    // Flushes the microtask queue (the no-op sleep's own resolution, and the
    // fetch call it feeds into) before aborting mid-fetch.
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await assert.rejects(pending, (error: Error) => {
        assert.equal(error.name, 'AbortError');
        return true;
    });
    assert.equal(fetchSignal?.aborted, true);
});

test('pollOperation rejects immediately on an already-aborted signal, issuing no poll at all', async () => {
    const controller = new AbortController();

    controller.abort();

    let fetchCalls = 0;
    const submitted: OperationEnvelope = {
        operation_id: 'op_pre_aborted',
        status: 'running',
        poll: '/poll',
        retry_after_ms: 0,
    };

    await assert.rejects(
        pollOperation(submitted, {
            signal: controller.signal,
            sleep: noSleep,
            fetchImpl: async () => {
                fetchCalls += 1;
                return jsonResponse(200, { operation: { status: 'done' }, manifest: { ok: true } });
            },
        }),
        (error: Error) => {
            assert.equal(error.name, 'AbortError');
            return true;
        },
    );
    assert.equal(fetchCalls, 0);
});
