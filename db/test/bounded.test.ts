import assert from 'node:assert/strict';
import test from 'node:test';
import type { Table } from '@google-cloud/bigquery';
import { type FailedOutcome, LoadError, loadWithin } from '../bounded.ts';

type JobState = { status: { state: string; errorResult?: { reason: string } } };

const RUNNING: JobState = { status: { state: 'RUNNING' } };
const DONE: JobState = { status: { state: 'DONE' } };
const FAILED: JobState = { status: { state: 'DONE', errorResult: { reason: 'stopped' } } };

/**
 * A table whose load job settles as `promise` does, whose cancel as
 * `cancel` does, and whose state reads as `state` returns, read by read.
 */
const fakeTable = ({
    promise,
    cancel = async () => [{}],
    states = [],
    upload = async () => undefined,
}: {
    promise: () => Promise<unknown>;
    cancel?: () => Promise<unknown>;
    states?: (JobState | 'hang')[];
    upload?: () => Promise<unknown>;
}) => {
    const calls: string[] = [];
    const table = {
        createLoadJob: async () => {
            calls.push('load');
            await upload();
            return [
                {
                    promise,
                    cancel: () => {
                        calls.push('cancel');
                        return cancel();
                    },
                    getMetadata: async () => {
                        calls.push('state');
                        const state = states.length > 1 ? states.shift()! : (states[0] ?? RUNNING);

                        return state === 'hang' ? never() : [state];
                    },
                },
            ];
        },
    } as unknown as Table;

    return { table, calls };
};

const never = () => new Promise<never>(() => undefined);

const BOUNDS = { timeoutMs: 20, cancelTimeoutMs: 20, confirmTimeoutMs: 60, pollMs: 5 };

test('loadWithin resolves a load that finishes in time', async () => {
    const { table, calls } = fakeTable({ promise: async () => [{}] });

    assert.deepEqual(
        await loadWithin({ table, file: '/tmp/day.ndjson', metadata: {}, ...BOUNDS }),
        {
            late: null,
        },
    );
    assert.deepEqual(calls, ['load']);
});

test(
    'loadWithin resolves a load BigQuery confirms finished after the Job stopped waiting',
    { timeout: 5_000 },
    async (t) => {
        const cases: [string, Parameters<typeof fakeTable>[0], string][] = [
            [
                'a load past its timeout whose cancel fails and that then finishes',
                {
                    promise: never,
                    cancel: async () => Promise.reject(new Error('cancel refused')),
                    states: [RUNNING, DONE],
                },
                'after the load ran past 0.02 s, cancel failed',
            ],
            [
                'a load whose client fails while its job finishes',
                {
                    promise: async () => Promise.reject(new Error('socket hang up')),
                    states: [DONE],
                },
                'after its client failed: socket hang up',
            ],
        ];

        for (const [label, fake, late] of cases) {
            await t.test(label, async () => {
                const { table } = fakeTable(fake);

                assert.deepEqual(
                    await loadWithin({ table, file: '/tmp/day.ndjson', metadata: {}, ...BOUNDS }),
                    { late },
                );
            });
        }
    },
);

test(
    'loadWithin names what BigQuery confirms a failed load left',
    { timeout: 5_000 },
    async (t) => {
        const cases: [
            string,
            Parameters<typeof fakeTable>[0],
            RegExp,
            FailedOutcome,
            (calls: string[]) => void,
        ][] = [
            [
                'a load job that fails',
                {
                    promise: async () => Promise.reject(new Error('load job failed')),
                    states: [FAILED],
                },
                /^load failed: load job failed$/,
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'state']),
            ],
            [
                'an upload that fails',
                { promise: never, upload: async () => Promise.reject(new Error('socket hang up')) },
                /^load failed: socket hang up$/,
                'kept',
                (calls) => assert.deepEqual(calls, ['load']),
            ],
            [
                'a load past its timeout that its cancel stops',
                { promise: never, states: [RUNNING, FAILED] },
                /^load ran past 0.02 s, cancel sent$/,
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'cancel', 'state', 'state']),
            ],
            [
                'a load past its timeout whose cancel hangs and whose job never ends',
                { promise: never, cancel: never, states: [RUNNING] },
                /^load ran past 0.02 s, cancel failed$/,
                'unknown',
                (calls) => assert.ok(calls.filter((call) => call === 'state').length > 1),
            ],
            [
                'a load past its timeout whose state reads hang',
                { promise: never, states: ['hang'] },
                /^load ran past 0.02 s, cancel sent$/,
                'unknown',
                (calls) => assert.deepEqual(calls, ['load', 'cancel', 'state']),
            ],
            [
                'a load past its timeout whose upload never creates its job',
                { promise: never, upload: never },
                /^load ran past 0.02 s with its upload unfinished$/,
                'unknown',
                (calls) => assert.deepEqual(calls, ['load']),
            ],
        ];

        for (const [label, fake, message, outcome, checkCalls] of cases) {
            await t.test(label, async () => {
                const { table, calls } = fakeTable(fake);
                const started = performance.now();

                await assert.rejects(
                    loadWithin({ table, file: '/tmp/day.ndjson', metadata: {}, ...BOUNDS }),
                    (error) => {
                        assert.ok(error instanceof LoadError);
                        assert.match(error.message, message);
                        assert.equal(error.outcome, outcome);
                        return true;
                    },
                );

                // Each step has its own bound, so one call never outlasts their sum,
                // with slack for the timers.
                assert.ok(
                    performance.now() - started <
                        BOUNDS.timeoutMs + BOUNDS.cancelTimeoutMs + BOUNDS.confirmTimeoutMs + 200,
                );
                checkCalls(calls);
            });
        }
    },
);
