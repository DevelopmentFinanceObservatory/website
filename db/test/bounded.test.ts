import assert from 'node:assert/strict';
import test from 'node:test';
import type { Table } from '@google-cloud/bigquery';
import { type FailedOutcome, LoadError, type LoadResult, loadWithin } from '../bounded.ts';

type JobState = { status: { state: string; errorResult?: { reason: string } } };

const RUNNING: JobState = { status: { state: 'RUNNING' } };
const DONE: JobState = { status: { state: 'DONE' } };
const FAILED: JobState = { status: { state: 'DONE', errorResult: { reason: 'stopped' } } };

const never = () => new Promise<never>(() => undefined);
const reject = (code?: number) => async () =>
    Promise.reject(Object.assign(new Error('boom'), { code }));

type Fake = {
    /** The upload: a rejection is an upload or create call that failed. */
    upload?: () => Promise<unknown>;
    /** The job's `promise()`, the client's wait for the job. */
    promise?: () => Promise<unknown>;
    cancel?: () => Promise<unknown>;
    /** The job's states, read by read, the last repeated. */
    states?: (JobState | 'hang')[];
    /** The read of the job id after a failed upload. */
    lookup?: () => Promise<unknown>;
};

/**
 * A table whose load runs as `fake` says, and the calls it gets: `load`,
 * `lookup` for a read of the job id by `bigQuery.job`, `cancel` and
 * `state`.
 */
const fakeTable = ({
    upload = async () => undefined,
    promise = never,
    cancel = async () => [{}],
    states = [RUNNING],
    lookup = async () => [RUNNING],
}: Fake) => {
    const calls: string[] = [];
    const jobIds: { created?: string; looked?: string } = {};
    const job = (looked: boolean) => {
        let lookedUp = !looked;

        return {
            promise,
            cancel: () => {
                calls.push('cancel');
                return cancel();
            },
            getMetadata: async () => {
                if (!lookedUp) {
                    lookedUp = true;
                    calls.push('lookup');
                    return lookup();
                }

                calls.push('state');
                const state = states.length > 1 ? states.shift()! : states[0]!;

                return state === 'hang' ? never() : [state];
            },
        };
    };
    const table = {
        location: 'EU',
        bigQuery: {
            job: (id: string) => {
                jobIds.looked = id;
                return job(true);
            },
        },
        createLoadJob: async (_file: string, metadata: { jobId?: string }) => {
            calls.push('load');
            jobIds.created = metadata.jobId;
            await upload();
            return [job(false)];
        },
    } as unknown as Table;

    return { table, calls, jobIds };
};

const BOUNDS = { timeoutMs: 20, cancelTimeoutMs: 20, confirmTimeoutMs: 60, pollMs: 5 };

// Each step has its own bound, so one call never outlasts their sum, with slack for the timers.
const SLOT_MS = BOUNDS.timeoutMs + BOUNDS.cancelTimeoutMs + BOUNDS.confirmTimeoutMs + 200;

test(
    'loadWithin resolves a load whose table BigQuery confirms replaced',
    { timeout: 5_000 },
    async (t) => {
        const cases: [string, Fake, LoadResult['late'], string[]][] = [
            ['a load that finishes in time', { promise: async () => [{}] }, null, ['load']],
            [
                'a load past its timeout whose cancel fails and that then finishes',
                { cancel: reject(), states: [RUNNING, DONE] },
                'timeout',
                ['load', 'cancel', 'state', 'state'],
            ],
            [
                'a load whose client fails while its job runs on and finishes',
                { promise: reject(), cancel: reject(), states: [RUNNING, DONE] },
                'failure',
                ['load', 'cancel', 'state', 'state'],
            ],
            [
                'an upload that fails after its job was created, and that job finishes',
                { upload: reject(), cancel: reject(), states: [DONE] },
                'failure',
                ['load', 'lookup', 'cancel', 'state'],
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

test('loadWithin names what a failed load left in its table', { timeout: 5_000 }, async (t) => {
    const cases: [string, Fake, FailedOutcome, string[] | ((calls: string[]) => void)][] = [
        [
            'a load job that fails',
            { promise: reject(), states: [FAILED] },
            'kept',
            ['load', 'cancel', 'state'],
        ],
        [
            'a load whose client fails while its job never ends and its cancel fails',
            { promise: reject(), cancel: reject(), states: [RUNNING] },
            'unknown',
            (calls) => assert.deepEqual(calls.slice(0, 3), ['load', 'cancel', 'state']),
        ],
        [
            'a load past its timeout that its cancel stops',
            { states: [RUNNING, FAILED] },
            'kept',
            ['load', 'cancel', 'state', 'state'],
        ],
        [
            'a load past its timeout whose cancel hangs and whose job never ends',
            { cancel: never, states: [RUNNING] },
            'unknown',
            (calls) => assert.deepEqual(calls.slice(0, 3), ['load', 'cancel', 'state']),
        ],
        [
            'a load past its timeout whose state reads hang',
            { states: ['hang'] },
            'unknown',
            ['load', 'cancel', 'state'],
        ],
        [
            'a load past its timeout whose upload never creates its job',
            { upload: never },
            'unknown',
            ['load'],
        ],
        [
            'an upload that fails before BigQuery knows its job id',
            { upload: reject(), lookup: reject(404) },
            'kept',
            ['load', 'lookup'],
        ],
        [
            'an upload that fails with its job id unreadable',
            { upload: reject(), lookup: reject(500) },
            'unknown',
            ['load', 'lookup'],
        ],
        [
            'an upload that fails with its job id read hanging',
            { upload: reject(), lookup: never },
            'unknown',
            ['load', 'lookup'],
        ],
        [
            'an upload that fails after its job was created, and that its cancel stops',
            { upload: reject(), states: [FAILED] },
            'kept',
            ['load', 'lookup', 'cancel', 'state'],
        ],
    ];

    for (const [label, fake, outcome, calls] of cases) {
        await t.test(label, async () => {
            const { table, calls: made } = fakeTable(fake);
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

            if (typeof calls === 'function') {
                calls(made);
            } else {
                assert.deepEqual(made, calls);
            }
        });
    }
});

test('loadWithin creates the load under its own job id and reads that id after a failed upload', async () => {
    const { table, jobIds } = fakeTable({ upload: reject(), lookup: reject(404) });
    const metadata = { sourceFormat: 'NEWLINE_DELIMITED_JSON' } as const;

    await assert.rejects(
        loadWithin({ table, file: '/tmp/day.ndjson', metadata: { ...metadata }, ...BOUNDS }),
    );
    assert.match(jobIds.created ?? '', /^website_export_[0-9a-f-]{36}$/);
    assert.equal(jobIds.looked, jobIds.created);
});
