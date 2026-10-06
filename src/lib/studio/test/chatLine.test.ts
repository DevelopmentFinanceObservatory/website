import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createStallWatch,
    createStepLine,
    createWorkingGrace,
    IDLE,
    PREAMBLE_CAP,
    preambleLine,
    STALL_MS,
    STOPPED_NOTE,
    stoppedReply,
    WORKING,
    WORKING_GRACE_MS,
    withEllipsis,
} from '../chatLine.ts';
import type { ActivityStepFrame } from '../wire.ts';

type Step = [step_id: string, status: ActivityStepFrame['status'], label: string, detail?: string];

// The line each frame of a sequence leaves, as label (and detail), or null.
const lines = (steps: Step[]) => {
    const apply = createStepLine();

    return steps.map(([step_id, status, label, detail]) => {
        const line = apply({ step_id, status, label, detail });

        if (line === null || line === IDLE) {
            return line;
        }

        return line.detail ? `${line.label} | ${line.detail}` : line.label;
    });
};

test('step line: each frame leaves the line the chat rule gives', async (t) => {
    const cases: { name: string; steps: Step[]; expected: (string | null)[] }[] = [
        {
            name: 'a completed tool hands back to idle, not its own label',
            steps: [
                ['s1', 'running', 'Searching'],
                ['s1', 'complete', 'Searching'],
            ],
            expected: ['Searching', IDLE],
        },
        {
            name: 'a step that arrives already complete leaves idle',
            steps: [['s1', 'complete', 'Searched']],
            expected: [IDLE],
        },
        {
            name: 'a failed step hands back like a complete one',
            steps: [
                ['s1', 'running', 'Fetching'],
                ['s1', 'failed', 'Fetching'],
            ],
            expected: ['Fetching', IDLE],
        },
        {
            name: 'a pending frame leaves the line unchanged',
            steps: [
                ['s1', 'running', 'Planning'],
                ['s2', 'pending', 'Fetch the data'],
            ],
            expected: ['Planning', null],
        },
        {
            name: 'the most recently opened running step shows; its end hands back to the earlier one',
            steps: [
                ['s1', 'running', 'Searching'],
                ['s2', 'running', 'Fetching', 'GDP'],
                ['s2', 'complete', 'Fetching'],
            ],
            expected: ['Searching', 'Fetching | GDP', 'Searching'],
        },
        {
            name: 'an older step ending leaves the newer line in place',
            steps: [
                ['s1', 'running', 'Searching'],
                ['s2', 'running', 'Fetching'],
                ['s1', 'complete', 'Searching'],
            ],
            expected: ['Searching', 'Fetching', 'Fetching'],
        },
        {
            name: 'a later running frame updates the detail only',
            steps: [
                ['s1', 'running', 'Fetching', 'year 1'],
                ['s1', 'running', 'Renamed', 'year 2'],
            ],
            expected: ['Fetching | year 1', 'Fetching | year 2'],
        },
        {
            name: 'order is by first frame, so a pending step that starts later still ranks by its pending frame',
            steps: [
                ['p1', 'pending', 'Plan step one'],
                ['s1', 'running', 'Status line'],
                ['p1', 'running', 'Plan step one'],
            ],
            expected: [null, 'Status line', 'Status line'],
        },
    ];

    for (const { name, steps, expected } of cases) {
        await t.test(name, () => assert.deepEqual(lines(steps), expected));
    }
});

// Drives the step line and the grace together, as useChat does, and returns
// the labels the line shows after each tick of a timeline.
const shown = (
    t: test.TestContext,
    timeline: ([at: number, ...step: Step] | [at: number])[],
) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const apply = createStepLine();
    let label = 'start';
    const grace = createWorkingGrace(() => {
        label = WORKING;
    });
    const seen: string[] = [];
    let now = 0;

    for (const [at, step_id, status, text, detail] of timeline) {
        t.mock.timers.tick(at - now);
        now = at;

        if (step_id !== undefined && status !== undefined && text !== undefined) {
            const update = apply({ step_id, status, label: text, detail });

            if (update === IDLE) {
                grace.idle();
            } else if (update) {
                grace.cancel();
                label = update.label;
            }
        }

        seen.push(label);
    }

    return seen;
};

test('working grace: the line keeps its label until no step has run for the grace period', async (t) => {
    await t.test('a step handing over within the grace never shows Working', (t) => {
        const seen = shown(t, [
            [0, 's1', 'running', 'Searching'],
            [100, 's1', 'complete', 'Searching'],
            [110, 's2', 'running', 'Fetching'],
            [110 + WORKING_GRACE_MS * 2],
        ]);

        assert.deepEqual(seen, ['Searching', 'Searching', 'Fetching', 'Fetching']);
    });

    await t.test('nothing running for the grace period shows Working', (t) => {
        const seen = shown(t, [
            [0, 's1', 'running', 'Searching'],
            [100, 's1', 'complete', 'Searching'],
            [100 + WORKING_GRACE_MS - 1],
            [100 + WORKING_GRACE_MS],
        ]);

        assert.deepEqual(seen, ['Searching', 'Searching', 'Searching', WORKING]);
    });

    await t.test('a second idle frame does not restart the clock', (t) => {
        const seen = shown(t, [
            [0, 's1', 'running', 'Searching'],
            [100, 's1', 'complete', 'Searching'],
            [250, 's2', 'complete', 'Fetched'],
            [100 + WORKING_GRACE_MS],
        ]);

        assert.deepEqual(seen, ['Searching', 'Searching', 'Searching', WORKING]);
    });

    await t.test('cancel stops a pending fall back', (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        let fired = 0;
        const grace = createWorkingGrace(() => (fired += 1));

        grace.idle();
        grace.cancel();
        t.mock.timers.tick(WORKING_GRACE_MS * 2);

        assert.equal(fired, 0);
    });
});

test('preamble line: the first sentence, on one line, capped', async (t) => {
    const long = `${'word '.repeat(40)}end.`;
    const cases: [name: string, text: string, expected: string][] = [
        [
            'a partial sentence shows as streamed',
            '  Checking the\ngrowth of',
            'Checking the growth of',
        ],
        ['only the first sentence shows', 'Checking GDP. Then I will chart it.', 'Checking GDP.'],
        [
            'a decimal point does not end the sentence',
            'Growth was 2.5 percent. More',
            'Growth was 2.5 percent.',
        ],
        ['whitespace alone is empty', ' \n ', ''],
        ['a long sentence cuts at a word with an ellipsis', long, `${'word '.repeat(23).trim()}…`],
    ];

    for (const [name, text, expected] of cases) {
        await t.test(name, () => {
            const line = preambleLine(text);

            assert.equal(line, expected);
            assert.ok(line.length <= PREAMBLE_CAP);
        });
    }
});

test('with ellipsis: one trailing ellipsis, however the label ends', async (t) => {
    const cases: [name: string, label: string, expected: string][] = [
        ['a plain label gains one', 'Searching', 'Searching…'],
        ['a truncated preamble keeps its one', 'Checking the growth of…', 'Checking the growth of…'],
        ['three dots collapse to one', 'Searching...', 'Searching…'],
        ['a sentence period gives way to it', 'Checking GDP.', 'Checking GDP…'],
    ];

    for (const [name, label, expected] of cases) {
        await t.test(name, () => assert.equal(withEllipsis(label), expected));
    }
});

test('stall watch: silence flips stalled, a beat clears it, stop ends the watch', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const flips: boolean[] = [];
    const watch = createStallWatch((stalled) => flips.push(stalled));

    watch.beat();
    t.mock.timers.tick(STALL_MS - 1);
    watch.beat();
    t.mock.timers.tick(STALL_MS - 1);
    assert.deepEqual(flips, [], 'each beat restarts the clock');

    t.mock.timers.tick(1);
    assert.deepEqual(flips, [true]);

    watch.beat();
    assert.deepEqual(flips, [true, false]);

    t.mock.timers.tick(STALL_MS);
    watch.stop();
    assert.deepEqual(flips, [true, false, true, false]);

    watch.beat();
    t.mock.timers.tick(STALL_MS * 2);
    assert.deepEqual(flips, [true, false, true, false], 'a beat after stop starts nothing');
});

test('stopped reply: the preamble that arrived, else the stopped note', async (t) => {
    const cases: { name: string; preamble: string; expected: string }[] = [
        {
            name: 'a preamble is kept whole',
            preamble: 'Checking the growth of GDP. Then the debt.',
            expected: 'Checking the growth of GDP. Then the debt.',
        },
        { name: 'no preamble leaves the note', preamble: '', expected: STOPPED_NOTE },
        { name: 'whitespace alone leaves the note', preamble: ' \n ', expected: STOPPED_NOTE },
    ];

    for (const { name, preamble, expected } of cases) {
        await t.test(name, () => assert.equal(stoppedReply(preamble), expected));
    }
});
