import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActivityEntry, ActivityTool, StepState } from '../activity.ts';
import {
    causeOf,
    detailOf,
    outcomeParts,
    spanText,
    triesText,
    turnView,
    type StepRow,
    type TurnViewInput,
} from '../activityView.ts';

const FETCH = 'Fetch Outstanding external debt for Kenya and Nigeria';
const FETCH_FAIL =
    'The data this step needed has changed or is not held, so ask again to fetch it afresh.';

let seq = 0;

const step = (
    at: number,
    name: string,
    tool: string | null,
    state: StepState,
    extra: Partial<ActivityTool> = {},
): ActivityTool => ({
    id: `s${(seq += 1)}`,
    name,
    args: tool ?? undefined,
    startedAt: at,
    durationMs: 1000,
    state,
    ...extra,
});

const entry = (tools: ActivityTool[], endedAt?: number): ActivityEntry => ({
    turn: 1,
    prompt: 'How has external debt changed in Kenya and Nigeria since 2010?',
    startedAt: 0,
    endedAt,
    tools,
});

const view = (input: Partial<TurnViewInput> & { entry: ActivityEntry }) =>
    turnView({ cardTitles: {}, isLast: true, thinking: false, waiting: false, ...input });

const stepRows = (rows: ReturnType<typeof view>['rows']) =>
    rows.filter((row): row is StepRow => row.kind === 'step');

test('a turn with no failures: work steps on the rail, status lines in the log only', () => {
    const tools = [
        step(1, 'Working out the next step', null, 'complete'),
        step(2, 'Searching for data', 'search', 'complete', {
            summary: 'Kenya external debt · Found Outstanding external debt',
        }),
        step(3, 'Draw the chart', 'write_component', 'complete', { widgetId: 'w1' }),
    ];
    const result = view({ entry: entry(tools, 123_000), cardTitles: { w1: 'External debt' } });

    assert.deepEqual(
        result.rows.map((row) => row.key),
        [tools[1]!.id, tools[2]!.id],
    );
    assert.equal(result.log.length, 3);
    assert.deepEqual(
        result.log.map((line) => line.quiet),
        [true, false, false],
    );
    assert.deepEqual(result.outcome, {
        state: 'ended',
        startedAt: 0,
        durationMs: 123_000,
        cards: 1,
        notDone: 0,
    });
    assert.equal(result.question, 'How has external debt changed in Kenya and Nigeria since 2010?');
    assert.equal(stepRows(result.rows)[0]?.detail, 'Found Outstanding external debt');
    assert.deepEqual(stepRows(result.rows)[1]?.card, { id: 'w1', title: 'External debt' });
});

test('a retry that worked folds into its step with every try', () => {
    const tools = [
        step(10_000, FETCH, 'get_data', 'failed', { summary: FETCH_FAIL, durationMs: 1500 }),
        step(11, 'Working out the next step', null, 'complete'),
        step(20_000, FETCH, 'get_data', 'failed', { summary: FETCH_FAIL, durationMs: 800 }),
        step(30_000, FETCH, 'get_data', 'failed', { summary: FETCH_FAIL, durationMs: 300 }),
        step(40_000, FETCH, 'get_data', 'complete', { summary: 'Kenya and Nigeria, 2010–2024' }),
    ];
    const result = view({ entry: entry(tools, 50_000) });
    const rows = stepRows(result.rows);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.state, 'complete');
    assert.deepEqual(
        rows[0]?.retry?.attempts.map((attempt) => [attempt.key, attempt.worked]),
        [
            [tools[0]!.id, false],
            [tools[2]!.id, false],
            [tools[3]!.id, false],
            [tools[4]!.id, true],
        ],
    );
    assert.equal(rows[0]?.retry?.cause, 'The data this step needed has changed or is not held.');
    assert.equal(result.outcome.notDone, 0);
    assert.deepEqual(
        result.log.map((line) => [line.state, line.retriedAt]),
        [
            ['retried', 40_000],
            ['complete', null],
            ['retried', 40_000],
            ['retried', 40_000],
            ['complete', null],
        ],
    );
});

test('a retry matches by label and tool: another tool or label stands', async (t) => {
    const cases = [
        { name: 'same label, other tool', label: FETCH, tool: 'fetch' },
        { name: 'same tool, other label', label: 'Fetch debt owed to China', tool: 'get_data' },
    ];

    for (const { name, label, tool } of cases) {
        await t.test(name, () => {
            const tools = [
                step(1, FETCH, 'get_data', 'failed', { summary: FETCH_FAIL }),
                step(2, label, tool, 'complete'),
            ];
            const result = view({ entry: entry(tools, 5) });

            assert.deepEqual(
                stepRows(result.rows).map((row) => row.state),
                ['failed', 'complete'],
            );
            assert.equal(result.outcome.notDone, 1);
        });
    }
});

test('a standing failure then a skipped step: Not done with its cause, then Not run', () => {
    const tools = [
        step(1, 'Fetch External debt owed to China', 'get_data', 'failed', {
            summary: 'The data is not broken down the way that was asked.',
        }),
        step(2, 'Work out the share owed to China', 'share_of', 'skipped', {
            durationMs: undefined,
        }),
    ];
    const result = view({ entry: entry(tools, 5) });
    const rows = stepRows(result.rows);

    assert.deepEqual(
        rows.map((row) => [row.state, row.detail]),
        [
            ['failed', 'The data is not broken down the way that was asked.'],
            ['skipped', null],
        ],
    );
    assert.equal(result.outcome.notDone, 1);
});

test('parallel steps with one label stay apart: a failure beside a success stands', () => {
    // Two searches the harness opened together; B started before A ended.
    const tools = [
        step(1_000, 'Searching for data', 'search', 'failed', {
            summary: 'This step could not be completed.',
            durationMs: 2_000,
        }),
        step(1_200, 'Searching for data', 'search', 'complete', { durationMs: 3_000 }),
    ];
    const result = view({ entry: entry(tools, 9_000) });

    assert.deepEqual(
        stepRows(result.rows).map((row) => [row.state, row.retry]),
        [
            ['failed', null],
            ['complete', null],
        ],
    );
    assert.equal(result.outcome.notDone, 1);
});

test('arrival order decides a retry when the clock cannot', async (t) => {
    await t.test('a retry that arrived in the same chunk as the failure folds', () => {
        const tools = [
            step(1_000, FETCH, 'get_data', 'failed', {
                summary: FETCH_FAIL,
                durationMs: 2_000,
                startOrder: 1,
                settleOrder: 2,
            }),
            step(1_000, FETCH, 'get_data', 'complete', { startOrder: 3, settleOrder: 4 }),
        ];
        const result = view({ entry: entry(tools, 9_000) });

        assert.deepEqual(
            stepRows(result.rows).map((row) => [row.state, row.retry?.attempts.length]),
            [['complete', 2]],
        );
        assert.equal(result.outcome.notDone, 0);
    });

    await t.test('a step that started before the failure settled stays apart', () => {
        const tools = [
            step(1_000, 'Searching for data', 'search', 'failed', {
                durationMs: 0,
                startOrder: 1,
                settleOrder: 3,
            }),
            step(9_000, 'Searching for data', 'search', 'complete', {
                startOrder: 2,
                settleOrder: 4,
            }),
        ];
        const result = view({ entry: entry(tools, 9_500) });

        assert.equal(result.outcome.notDone, 1);
    });
});

test('a standing failure keeps its advice; a recovered try drops it', () => {
    const standing = view({
        entry: entry([step(1, FETCH, 'get_data', 'failed', { summary: FETCH_FAIL })], 5),
    });
    const recovered = view({
        entry: entry(
            [
                step(1_000, FETCH, 'get_data', 'failed', { summary: FETCH_FAIL }),
                step(5_000, FETCH, 'get_data', 'complete'),
            ],
            9_000,
        ),
    });

    assert.equal(stepRows(standing.rows)[0]?.detail, FETCH_FAIL);
    assert.equal(
        stepRows(recovered.rows)[0]?.retry?.cause,
        'The data this step needed has changed or is not held.',
    );
});

test('a failed status line that stands goes on the rail and counts', () => {
    const tools = [step(1, 'Working out the next step', null, 'failed')];
    const result = view({ entry: entry(tools, 5) });

    assert.deepEqual(
        result.rows.map((row) => row.key),
        [tools[0]!.id],
    );
    assert.equal(result.outcome.notDone, 1);
});

test('a running turn: the running step shows whatever its kind, the head is live', () => {
    const tools = [
        step(1, 'Searching for data', 'search', 'failed', {
            summary: 'This step could not be completed.',
        }),
        step(2_000, 'Searching for data', 'search', 'complete'),
        step(3_000, 'Reading what the search found', null, 'complete'),
        step(4_000, 'Working on a plan', null, 'running', { durationMs: undefined }),
    ];
    const live = view({ entry: entry(tools), thinking: true });

    assert.equal(live.outcome.state, 'live');
    assert.deepEqual(
        stepRows(live.rows).map((row) => row.state),
        ['complete', 'running'],
    );
    assert.equal(stepRows(live.rows)[0]?.retry?.attempts.length, 2);
    assert.equal(view({ entry: entry(tools), waiting: true }).outcome.state, 'waiting');
    assert.equal(view({ entry: entry(tools), isLast: false }).outcome.state, 'ended');
});

test('a restored turn that never closed reads as ended, with no length', () => {
    const tools = [step(1, 'Searching for data', 'search', 'skipped')];

    assert.deepEqual(view({ entry: entry(tools) }).outcome, {
        state: 'ended',
        startedAt: 0,
        cards: 0,
        notDone: 0,
        durationMs: null,
    });
});

test('a failed try with its retry still running folds into the running step', () => {
    const tools = [
        step(1, FETCH, 'get_data', 'failed', { summary: FETCH_FAIL }),
        step(2_000, FETCH, 'get_data', 'running'),
    ];
    const result = view({ entry: entry(tools), thinking: true });

    assert.deepEqual(
        stepRows(result.rows).map((row) => row.state),
        ['running'],
    );
    assert.equal(result.outcome.notDone, 0);
});

test('the approved plan sits before the first step after the approval', async (t) => {
    const tools = [
        step(1, 'Searching for data', 'search', 'complete'),
        step(5, 'Starting the plan', null, 'complete'),
        step(6, FETCH, 'get_data', 'complete'),
    ];
    const plan = { title: 'External debt since 2010', steps: [{}, {}, {}] };

    await t.test('with the approval time', () => {
        const result = view({ entry: { ...entry(tools, 9), approvedAt: 4 }, plan });

        assert.deepEqual(
            result.rows.map((row) => row.kind),
            ['step', 'plan', 'step'],
        );
        assert.deepEqual(
            result.log.map((line) => line.state),
            ['complete', 'plan', 'complete', 'complete'],
        );
        assert.equal(result.rows.find((row) => row.kind === 'plan')?.stepCount, 3);
    });

    await t.test('by arrival order when the clock ties', () => {
        // A buffered chunk: everything arrived in one millisecond.
        const ordered = [
            step(5, 'Searching for data', 'search', 'complete', { startOrder: 1, settleOrder: 2 }),
            step(5, 'Starting the plan', null, 'complete', { startOrder: 4, settleOrder: 5 }),
            step(5, FETCH, 'get_data', 'complete', { startOrder: 6, settleOrder: 7 }),
        ];
        const result = view({
            entry: { ...entry(ordered, 9), approvedAt: 5, approvedOrder: 3 },
            plan,
        });

        assert.deepEqual(
            result.rows.map((row) => row.kind),
            ['step', 'plan', 'step'],
        );
        assert.deepEqual(
            result.log.map((line) => line.state),
            ['complete', 'plan', 'complete', 'complete'],
        );
    });

    await t.test('a saved plan without its steps counts none', () => {
        const result = view({ entry: entry(tools, 9), plan: { title: 'Saved without steps' } });

        assert.equal(result.rows.find((row) => row.kind === 'plan')?.stepCount, 0);
    });

    await t.test('without it the plan heads the rail and stays out of the log', () => {
        const result = view({ entry: entry(tools, 9), plan });

        assert.deepEqual(
            result.rows.map((row) => row.kind),
            ['plan', 'step', 'step'],
        );
        assert.equal(result.log.length, 3);
    });
});

test('a card chip needs the card title; the count does not', () => {
    const tools = [step(1, 'Draw the chart', 'write_component', 'complete', { widgetId: 'gone' })];
    const result = view({ entry: entry(tools, 5) });

    assert.equal(stepRows(result.rows)[0]?.card, null);
    assert.equal(result.outcome.cards, 1);
});

test('slow: a step of 10 s or more shows its duration', () => {
    const tools = [
        step(1, 'a', 'x', 'complete', { durationMs: 9_999 }),
        step(2, 'b', 'x', 'complete', { durationMs: 10_000 }),
    ];

    assert.deepEqual(
        stepRows(view({ entry: entry(tools, 5) }).rows).map((row) => row.slow),
        [false, true],
    );
});

test('causeOf drops the advice after ", so" and keeps any other sentence whole', async (t) => {
    const cases: { name: string; input: string | undefined; expected: string | null }[] = [
        {
            name: 'advice dropped',
            input: FETCH_FAIL,
            expected: 'The data this step needed has changed or is not held.',
        },
        {
            name: 'no ", so"',
            input: 'The data is not broken down the way that was asked.',
            expected: 'The data is not broken down the way that was asked.',
        },
        {
            name: '"so" without the comma',
            input: 'It failed so badly.',
            expected: 'It failed so badly.',
        },
        {
            name: 'a chart list keeps its titles and second reason',
            input: 'That covers more than one request or chart can hold, so ask about something narrower: Aid by donor; The card could not be drawn as asked: Aid by sector',
            expected:
                'That covers more than one request or chart can hold: Aid by donor; The card could not be drawn as asked: Aid by sector.',
        },
        {
            name: 'an "and" tail passes through',
            input: 'The service did not answer, and trying again in a moment may work.',
            expected: 'The service did not answer, and trying again in a moment may work.',
        },
        { name: 'nothing after ", so"', input: 'It failed, so ', expected: 'It failed, so' },
        { name: '", so" at the start', input: ', so what', expected: ', so what' },
        { name: 'empty', input: '  ', expected: null },
        { name: 'missing', input: undefined, expected: null },
    ];

    for (const { name, input, expected } of cases) {
        await t.test(name, () => assert.equal(causeOf(input), expected));
    }
});

test('detailOf: a search shows what it found, others their first sentence', () => {
    const base = step(1, 'x', 'search', 'complete');

    assert.equal(detailOf({ ...base, summary: 'q · Found A, B' }), 'Found A, B');
    assert.equal(detailOf({ ...base, summary: 'No separator here' }), 'No separator here');
    assert.equal(detailOf({ ...base, args: 'growth', summary: 'q · kept. Second.' }), 'q · kept.');
    assert.equal(detailOf({ ...base, args: 'growth', summary: 'x'.repeat(200) })?.length, 140);
});

test('formats: spans and tries', () => {
    assert.equal(spanText(38_400), '38 s');
    assert.equal(spanText(123_000), '2 min 3 s');
    assert.equal(
        triesText({
            cause: 'It broke.',
            attempts: [
                { key: 'a', startedAt: 0, durationMs: 1, worked: false },
                { key: 'b', startedAt: 1, durationMs: 1, worked: true },
            ],
        }),
        '1 try failed first: It broke.',
    );
});

test('the outcome line leaves out a zero count of cards or failures', async (t) => {
    const keys = (outcome: Parameters<typeof outcomeParts>[0]) =>
        outcomeParts(outcome, 38_000).map((part) => [part.key, part.alert ?? false]);
    const ended = { state: 'ended', startedAt: 0, durationMs: 123_000 } as const;

    await t.test('an ended turn with cards and a failure', () =>
        assert.deepEqual(keys({ ...ended, cards: 2, notDone: 1 }), [
            ['start', false],
            ['length', false],
            ['cards', false],
            ['notDone', true],
        ]),
    );
    await t.test('an ended turn with neither', () =>
        assert.deepEqual(keys({ ...ended, cards: 0, notDone: 0 }), [
            ['start', false],
            ['length', false],
        ]),
    );
    await t.test('a live turn with no cards yet', () =>
        assert.deepEqual(keys({ state: 'live', startedAt: 0, cards: 0, notDone: 0 }), [
            ['length', false],
        ]),
    );
});
