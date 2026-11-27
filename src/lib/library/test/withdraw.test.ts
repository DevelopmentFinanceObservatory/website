import assert from 'node:assert/strict';
import test from 'node:test';

import { withdraw, type WithdrawDeps, type WithdrawOutcome } from '../withdraw.ts';

const SHARE = { slug: 'health-oda', shareId: 'Share001', shareWriteToken: 'shw_1' };

// A row that holds its token until it is withdrawn, and a take-down, cleanup
// record and row write that answer, one call after another, as each case
// says. A take-down past the listed answers is done, as dfo-apis answers a
// share already gone.
const fakes = ({
    takeDown = [],
    cleanupCommits = [],
    rowWrites = [],
}: {
    takeDown?: string[];
    cleanupCommits?: boolean[];
    rowWrites?: boolean[];
}) => {
    const row = { withdrawn: false, token: SHARE.shareWriteToken as string | null };
    const cleanup: string[] = [];
    const deps: WithdrawDeps = {
        share: async () => (row.token ? { ...SHARE, shareWriteToken: row.token } : null),
        takeDown: async () => takeDown.shift() ?? 'done',
        keepForCleanup: async (record) => {
            if (!(cleanupCommits.shift() ?? true)) {
                throw new Error('connection refused');
            }

            cleanup.push(record.reason);
        },
        withdraw: async () => {
            if (!(rowWrites.shift() ?? true)) {
                throw new Error('connection refused');
            }

            if (!row.token) {
                return 'not_found';
            }

            row.withdrawn = true;
            row.token = null;

            return { slug: SHARE.slug };
        },
        isWithdrawn: async () => row.withdrawn,
    };

    return { deps, cleanup, row };
};

const WITHDRAWN = { withdrawn: true, token: null };
const PUBLISHED = { withdrawn: false, token: SHARE.shareWriteToken };

test('an artifact is withdrawn only once its share is settled', async (t) => {
    const quiet = t.mock.method(console, 'error', () => {});

    const cases: {
        name: string;
        setup: Parameters<typeof fakes>[0];
        // What each call answers and the row it leaves, in turn.
        calls: {
            answer: WithdrawOutcome | 'not_found';
            row: object;
        }[];
        cleanup: string[];
    }[] = [
        {
            name: 'taken down',
            setup: { takeDown: ['done'] },
            calls: [
                { answer: 'withdrawn', row: WITHDRAWN },
                { answer: 'not_found', row: WITHDRAWN },
            ],
            cleanup: [],
        },
        {
            name: 'recorded for cleanup',
            setup: { takeDown: ['transient_unavailable'], cleanupCommits: [true] },
            calls: [{ answer: 'withdrawn', row: WITHDRAWN }],
            cleanup: ['transient_unavailable'],
        },
        {
            name: 'neither, then a retry',
            setup: { takeDown: ['transient_unavailable'], cleanupCommits: [false] },
            calls: [
                { answer: 'unsettled', row: PUBLISHED },
                { answer: 'withdrawn', row: WITHDRAWN },
            ],
            cleanup: [],
        },
        {
            name: 'settled, the row write fails, then a retry',
            setup: { takeDown: ['done'], rowWrites: [false] },
            calls: [
                { answer: 'unwritten', row: PUBLISHED },
                { answer: 'withdrawn', row: WITHDRAWN },
            ],
            cleanup: [],
        },
    ];

    for (const one of cases) {
        const { deps, cleanup, row } = fakes(one.setup);

        for (const [index, call] of one.calls.entries()) {
            const label = `${one.name}, call ${index + 1}`;

            assert.deepEqual(
                await withdraw(deps, 'a1', 'admin'),
                call.answer === 'not_found'
                    ? call.answer
                    : { slug: SHARE.slug, outcome: call.answer },
                label,
            );

            assert.deepEqual(row, call.row, label);
        }

        assert.deepEqual(cleanup, one.cleanup, one.name);
    }

    assert.equal(
        quiet.mock.calls.some((call) => call.arguments[0] === 'share_cleanup_not_recorded'),
        true,
    );
});

test('two withdrawals at once both answer withdrawn', async () => {
    const { deps, row } = fakes({});
    let takeDowns = 0;
    const counted: WithdrawDeps = {
        ...deps,
        takeDown: async (share) => {
            takeDowns += 1;

            return deps.takeDown(share);
        },
    };

    assert.deepEqual(
        await Promise.all([withdraw(counted, 'a1', 'admin'), withdraw(counted, 'a1', 'admin')]),
        [
            { slug: SHARE.slug, outcome: 'withdrawn' },
            { slug: SHARE.slug, outcome: 'withdrawn' },
        ],
    );
    // Both read the share before either withdrew the row.
    assert.equal(takeDowns, 2);
    assert.deepEqual(row, WITHDRAWN);
});
