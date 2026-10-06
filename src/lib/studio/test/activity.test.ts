import assert from 'node:assert/strict';
import test from 'node:test';

import {
    endTurnActivity,
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

test('end turn: open steps settle by how the turn ended', async (t) => {
    const before = [
        entry(1, ['running']),
        entry(2, ['pending', 'running', 'complete', 'failed', 'skipped']),
    ];
    const cases: {
        name: string;
        open: 'skipped' | 'failed' | undefined;
        expected: StepState[];
    }[] = [
        {
            name: 'stop skips them',
            open: 'skipped',
            expected: ['skipped', 'skipped', 'complete', 'failed', 'skipped'],
        },
        {
            name: 'an error or a broken stream fails them',
            open: 'failed',
            expected: ['failed', 'failed', 'complete', 'failed', 'skipped'],
        },
        {
            name: 'done leaves them as their frames left them',
            open: undefined,
            expected: ['pending', 'running', 'complete', 'failed', 'skipped'],
        },
    ];

    for (const { name, open, expected } of cases) {
        await t.test(name, () => {
            const after = endTurnActivity(before, 2, open);

            assert.deepEqual(states(after, 2), expected);
            assert.equal(typeof after[1]?.endedAt, 'number');
            assert.deepEqual(after[0], before[0], 'other turns are untouched');
        });
    }
});
