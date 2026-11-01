import assert from 'node:assert/strict';
import test from 'node:test';

import {
    endTurnActivity,
    recordApproval,
    recordStep,
    restoreActivity,
    type ActivityEntry,
    type StepState,
} from '../activity.ts';

const step = (id: string, state?: StepState) => ({
    id,
    name: id,
    args: undefined,
    startedAt: 0,
    ...(state && { state }),
});

const entry = (turn: number, states: StepState[]): ActivityEntry => ({
    turn,
    prompt: `turn ${turn}`,
    startedAt: 0,
    tools: states.map((state, index) => step(`s${index}`, state) as ActivityEntry['tools'][0]),
});

const states = (activity: ActivityEntry[], turn: number) =>
    activity.find((item) => item.turn === turn)?.tools.map((tool) => tool.state);

test('restore: a saved step state comes back settled', async (t) => {
    const cases: { name: string; saved: StepState | undefined; expected: StepState }[] = [
        {
            name: 'no state (an old save) ended before the save',
            saved: undefined,
            expected: 'complete',
        },
        { name: 'pending cannot be live after a restore', saved: 'pending', expected: 'skipped' },
        { name: 'running cannot be live after a restore', saved: 'running', expected: 'skipped' },
        { name: 'complete stays', saved: 'complete', expected: 'complete' },
        { name: 'failed stays', saved: 'failed', expected: 'failed' },
        { name: 'skipped stays', saved: 'skipped', expected: 'skipped' },
    ];

    for (const { name, saved, expected } of cases) {
        await t.test(name, () => {
            const [restored] = restoreActivity([
                { turn: 1, prompt: 'p', startedAt: 0, tools: [step('s1', saved)] },
            ]);

            assert.equal(restored?.tools[0]?.state, expected);
        });
    }
});

test('restore: fields of older saves are dropped', () => {
    const old = {
        turn: 1,
        prompt: 'p',
        startedAt: 0,
        thoughts: 'old thoughts',
        tools: [{ ...step('s1'), statusLine: true }],
    };
    const [restored] = restoreActivity([old]);

    assert.ok(restored && !('thoughts' in restored));
    assert.ok(restored && !('statusLine' in (restored.tools[0] ?? {})));
});

test('restore: the plan approval time is kept, and a save without it has none', () => {
    const [stamped, unstamped] = restoreActivity([
        { ...entry(1, ['complete']), approvedAt: 42 },
        entry(2, ['complete']),
    ]);

    assert.equal(stamped?.approvedAt, 42);
    assert.equal(unstamped?.approvedAt, undefined);
});

test('end turn: open steps settle by how the turn ended, and a failure with no answer fails the turn', async (t) => {
    const before = [
        entry(1, ['running']),
        entry(2, ['pending', 'running', 'complete', 'failed', 'skipped']),
    ];
    const SKIPPED: StepState[] = ['skipped', 'skipped', 'complete', 'failed', 'skipped'];
    const FAILED: StepState[] = ['failed', 'failed', 'complete', 'failed', 'skipped'];
    const cases: {
        name: string;
        open: 'skipped' | 'failed' | undefined;
        answered: boolean;
        expected: StepState[];
        failed?: true;
    }[] = [
        {
            name: 'stop skips them, unanswered',
            open: 'skipped',
            answered: false,
            expected: SKIPPED,
        },
        { name: 'stop skips them, answered', open: 'skipped', answered: true, expected: SKIPPED },
        {
            name: 'an error before any answer fails them and the turn',
            open: 'failed',
            answered: false,
            expected: FAILED,
            failed: true,
        },
        {
            name: 'an error after some answer fails them, not the turn',
            open: 'failed',
            answered: true,
            expected: FAILED,
        },
        {
            name: 'done leaves them as their frames left them',
            open: undefined,
            answered: false,
            expected: ['pending', 'running', 'complete', 'failed', 'skipped'],
        },
    ];

    for (const { name, open, answered, expected, failed } of cases) {
        await t.test(name, () => {
            const after = endTurnActivity(before, 2, open, answered);

            assert.deepEqual(states(after, 2), expected);
            assert.equal(after[1]?.failed, failed);
            assert.equal(typeof after[1]?.endedAt, 'number');
            assert.deepEqual(after[0], before[0], 'other turns are untouched');
        });
    }
});

test('record: steps and the approval are numbered in arrival order', () => {
    const frame = (step_id: string, status: StepState) => ({
        step_id,
        label: step_id,
        status,
        tool: 'search',
    });
    let entry: ActivityEntry = { turn: 1, prompt: 'p', startedAt: 0, tools: [] };

    entry = recordStep(entry, frame('a', 'running'), 5);
    entry = recordStep(entry, frame('b', 'running'), 5);
    entry = recordStep(entry, frame('a', 'failed'), 5);
    entry = recordApproval(entry, 5);
    entry = recordStep(entry, frame('c', 'complete'), 5);
    // A later frame for a settled step keeps its first settle.
    entry = recordStep(entry, frame('a', 'failed'), 5);

    assert.deepEqual(
        entry.tools.map((tool) => [tool.id, tool.startOrder, tool.settleOrder]),
        [
            ['a', 1, 3],
            ['b', 2, undefined],
            ['c', 5, 5],
        ],
    );
    assert.equal(entry.approvedOrder, 4);
});

test('restore: the arrival order and a failed turn are kept', () => {
    const [restored] = restoreActivity([
        {
            turn: 1,
            prompt: 'p',
            startedAt: 0,
            approvedOrder: 3,
            failed: true,
            tools: [{ ...step('s1', 'complete'), startOrder: 1, settleOrder: 2 }],
        },
    ]);

    assert.equal(restored?.approvedOrder, 3);
    assert.equal(restored?.failed, true);
    assert.deepEqual(
        restored?.tools.map((tool) => [tool.startOrder, tool.settleOrder]),
        [[1, 2]],
    );
});
