import assert from 'node:assert/strict';
import test from 'node:test';
import type { Table } from '@google-cloud/bigquery';
import { type FailedOutcome, LoadError, type LoadResult, loadWithin } from '../bounded.ts';

type JobState = { status: { state: string; errorResult?: { reason: string } } };

const RUNNING: JobState = { status: { state: 'RUNNING' } };
const DONE: JobState = { status: { state: 'DONE' } };
const FAILED: JobState = { status: { state: 'DONE', errorResult: { reason: 'stopped' } } };
// BigQuery's answer for a job id it does not know.
const NOT_FOUND = 'not found';

const never = () => new Promise<never>(() => undefined);
const reject = async () => Promise.reject(new Error('boom'));

type Fake = {
    /** The upload and create call: a rejection is a client error before the job. */
    upload?: () => Promise<unknown>;
    /** The client's wait for the created job. */
    promise?: () => Promise<unknown>;
    cancel?: () => Promise<unknown>;
    /** The job id's states, read by read, the last repeated. */
    states?: (JobState | typeof NOT_FOUND | 'hang')[];
    /** The job's state once a cancel was sent, when the cancel stops it. */
    afterCancel?: JobState;
};

/**
 * A table whose load runs as `fake` says, the calls it gets (`load`,
 * `cancel`, `state`), and the job ids it was given and looked up.
 */
const fakeTable = ({
    upload = async () => undefined,
    promise = never,
    cancel = async () => [{}],
    states = [RUNNING],
    afterCancel,
}: Fake) => {
    const calls: string[] = [];
    const jobIds: { created?: string; looked?: string; location?: string } = {};
    const table = {
        location: 'EU',
        bigQuery: {
            job: (id: string, { location }: { location?: string }) => {
                jobIds.looked = id;
                jobIds.location = location;
                return {
                    cancel: () => {
                        calls.push('cancel');
                        return cancel();
                    },
                    getMetadata: async () => {
                        calls.push('state');
                        const state =
                            afterCancel !== undefined && calls.includes('cancel')
                                ? afterCancel
                                : states.length > 1
                                  ? states.shift()!
                                  : states[0]!;

                        if (state === 'hang') {
                            return never();
                        }

                        if (state === NOT_FOUND) {
                            throw Object.assign(new Error('Not found'), { code: 404 });
                        }

                        return [state];
                    },
                };
            },
        },
        createLoadJob: async (_file: string, metadata: { jobId?: string }) => {
            calls.push('load');
            jobIds.created = metadata.jobId;
            await upload();
            return [{ promise }];
        },
    } as unknown as Table;

    return { table, calls, jobIds };
};

const BOUNDS = { timeoutMs: 40, cancelTimeoutMs: 20, confirmTimeoutMs: 60, pollMs: 5 };

// Each step has its own bound, so one call never outlasts their sum, with slack for the timers.
const SLOT_MS = BOUNDS.timeoutMs + BOUNDS.cancelTimeoutMs + BOUNDS.confirmTimeoutMs + 200;

const count = (calls: string[], call: string) => calls.filter((made) => made === call).length;

test(
    'loadWithin resolves a load BigQuery confirms DONE without an error',
    { timeout: 5_000 },
    async (t) => {
        const cases: [string, Fake, LoadResult['late'], string[]][] = [
            ['a load that finishes in time', { promise: async () => [{}] }, null, ['load']],
            [
                'a load past its timeout whose cancel is refused and that then finishes',
                { cancel: reject, states: [RUNNING, DONE] },
                'timeout',
                ['load', 'cancel', 'state', 'state'],
            ],
            [
                'a load whose client fails while its job runs on and finishes',
                { promise: reject, states: [RUNNING, DONE] },
                'failure',
                ['load', 'state', 'state'],
            ],
            [
                'an upload whose client fails before BigQuery shows the job it then finishes',
                { upload: reject, states: [NOT_FOUND, DONE] },
                'failure',
                ['load', 'state', 'state'],
            ],
        ];

        for (const [label, fake, late, calls] of cases) {
            await t.test(label, async () => {
                const { table, calls: made } = fakeTable(fake);
                const started = performance.now();

                assert.deepEqual(
                    await loadWithin({ table, file: '/tmp/day.ndjson', metadata: {}, ...BOUNDS }),
                    { late },
                );
                assert.ok(performance.now() - started < SLOT_MS);
                assert.deepEqual(made, calls);
            });
        }
    },
);

test(
    'loadWithin names what BigQuery confirms a failed load left',
    { timeout: 5_000 },
    async (t) => {
        const cases: [string, Fake, FailedOutcome, (calls: string[]) => void][] = [
            [
                'a load job that fails',
                { promise: reject, states: [FAILED] },
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'state']),
            ],
            [
                'a load whose client fails while its job runs past the load bound',
                { promise: reject, states: [RUNNING] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(calls.indexOf('cancel') > 2);
                },
            ],
            [
                'a load whose client fails while its job runs past the load bound, then its cancel stops it',
                { promise: reject, states: [RUNNING], afterCancel: FAILED },
                'kept',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.equal(calls.at(-1), 'state');
                },
            ],
            [
                'an upload that fails with its job id unknown to BigQuery',
                { upload: reject, states: [NOT_FOUND] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(count(calls, 'state') > 1);
                },
            ],
            [
                'an upload that fails with its job state unreadable',
                { upload: reject, states: ['hang'] },
                'unknown',
                (calls) => assert.deepEqual(calls, ['load', 'state', 'cancel', 'state']),
            ],
            [
                'a load past its timeout that its cancel stops',
                { states: [RUNNING, FAILED] },
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'cancel', 'state', 'state']),
            ],
            [
                'a load past its timeout whose cancel hangs and whose job never ends',
                { cancel: never, states: [RUNNING] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(count(calls, 'state') > 1);
                },
            ],
            [
                'a load past its timeout whose upload never creates its job',
                { upload: never, states: [NOT_FOUND] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(count(calls, 'state') > 1);
                },
            ],
        ];

        for (const [label, fake, outcome, checkCalls] of cases) {
            await t.test(label, async () => {
                const { table, calls } = fakeTable(fake);
                const started = performance.now();

                await assert.rejects(
                    loadWithin({ table, file: '/tmp/day.ndjson', metadata: {}, ...BOUNDS }),
                    (error) => {
                        assert.ok(error instanceof LoadError);
                        assert.equal(error.outcome, outcome);
                        return true;
                    },
                );
                assert.ok(performance.now() - started < SLOT_MS);
                checkCalls(calls);
            });
        }
    },
);

test('loadWithin reads back the job id it created the load under, in the table location', async () => {
    const { table, jobIds } = fakeTable({ promise: reject, states: [FAILED] });

    await assert.rejects(loadWithin({ table, file: '/tmp/day.ndjson', metadata: {}, ...BOUNDS }));
    assert.equal(typeof jobIds.created, 'string');
    assert.equal(jobIds.looked, jobIds.created);
    assert.equal(jobIds.location, 'EU');
});
