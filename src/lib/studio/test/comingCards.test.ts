import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Widget } from '../../chat/widgets.ts';
import {
    comingAfter,
    comingCards,
    comingEnded,
    comingEntriesOf,
    type ComingState,
    NO_COMING,
    NONE_COMING,
    plannedCards,
    savedCards,
} from '../comingCards.ts';
import type { ActivityStepFrame, ComponentCreated, StudioFrame } from '../wire.ts';

const read = <T>(name: string): T =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;

// The harness's running line announcing two cards (s1.0, s1.1), and a card
// naming s1.0.
const line = read<ActivityStepFrame>('event-24-activity-step-coming-cards.json');
const created = read<ComponentCreated>('event-06-component-created.json');
const ids = (state: ComingState) => state.announced.map((card) => card.id);
const after = (frames: StudioFrame[], state = NO_COMING) =>
    frames.reduce((held, frame) => comingAfter(held, frame, 2), state);
const step = (status: ActivityStepFrame['status'], id = line.step_id): ActivityStepFrame => ({
    event: 'activity.step',
    seq: 9,
    step_id: id,
    label: 'Making charts',
    status,
});

test('an announced card holds a place from its running line until a card names it, its line closes, or the stream ends', () => {
    const announced = after([line]);

    assert.deepEqual(
        announced.announced.map(({ id, type, title, turn, stepId }) => [
            id,
            type,
            title,
            turn,
            stepId,
        ]),
        [
            ['s1.0', 'stat_card', 'Official aid to Ethiopia', 2, 's1'],
            ['s1.1', 'line_chart', 'Official aid to Ethiopia by donor', 2, 's1'],
        ],
    );
    // The same line again adds nothing, and another line's close leaves it.
    assert.equal(after([line, step('complete', 's9')], announced), announced);
    assert.deepEqual(ids(after([created], announced)), ['s1.1']);

    for (const end of [
        step('complete'),
        step('failed'),
        { event: 'done', seq: 9, trace_id: 't' },
        { event: 'error', seq: 9, error: { error: 'internal', detail: 'x' } },
        read<StudioFrame>('event-03-plan-proposed.json'),
        read<StudioFrame>('event-14-elicitation-questions.json'),
    ] as StudioFrame[]) {
        assert.deepEqual(ids(after([end], announced)), [], end.event);
    }

    // A stream that drops ends them too.
    assert.deepEqual(ids(comingEnded(announced)), []);
    assert.equal(comingEnded(NO_COMING), NO_COMING);
});

test('an announced entry of another type, or without an id or a title, is dropped', () => {
    assert.deepEqual(
        comingEntriesOf([
            { placeholder_id: 'a.0', type: 'scatter_chart', title: 'T' },
            { placeholder_id: 'a.1', type: 'table', title: 'T' },
            { placeholder_id: '', type: 'table', title: 'T' },
            { placeholder_id: 'a.3', type: 'table' },
            'a.4',
        ]).map((entry) => entry.id),
        ['a.1'],
    );
    assert.deepEqual(comingEntriesOf(null), []);
});

// The recorded plan run's approval stream (e2e/studio-replay/fixtures/
// plan.json), with `coming` added to its drawing line as the harness sends
// it there and nowhere else.
const planRun = (): StudioFrame[] => {
    const recorded = JSON.parse(
        readFileSync(
            new URL('../../../../e2e/studio-replay/fixtures/plan.json', import.meta.url),
            'utf8',
        ),
    ) as { turns: { segments: { frames: StudioFrame[] }[] }[] };
    const frames = recorded.turns[0]?.segments[3]?.frames ?? [];

    return frames.map((frame) =>
        frame.event === 'activity.step' &&
        frame.tool === 'make_charts' &&
        frame.status === 'running'
            ? {
                  ...frame,
                  coming: [
                      { placeholder_id: `${frame.step_id}.0`, type: 'line_chart', title: 'Gates' },
                      { placeholder_id: `${frame.step_id}.1`, type: 'line_chart', title: 'G7' },
                  ],
              }
            : frame,
    );
};

test('a running plan shows its answering step as planned until the turn’s first drawing line, which takes its place', () => {
    const frames = planRun();
    const drawingAt = frames.findIndex(
        (frame) => frame.event === 'activity.step' && Array.isArray(frame.coming),
    );
    const at = (count: number) => after(frames.slice(0, count));
    const shown = (state: ComingState) =>
        comingCards(state.announced, plannedCards({ state, waiting: null, cards: [] })).map(
            ({ id, type }) => [id, type],
        );

    assert.ok(drawingAt > 1);
    // From the approval until the drawing line there is one planned place for s4.
    assert.deepEqual(shown(at(1)), [['planned:plan_replay_gates_g7/s4', null]]);
    assert.deepEqual(shown(at(drawingAt)), [['planned:plan_replay_gates_g7/s4', null]]);
    // The drawing line's cards replace it, with no plan-id match.
    assert.deepEqual(shown(at(drawingAt + 1)), [
        ['s8.0', 'line_chart'],
        ['s8.1', 'line_chart'],
    ]);
    // Its line closes, and the stream's `done` ends the run.
    assert.deepEqual(shown(at(drawingAt + 2)), []);
    assert.deepEqual(shown(at(frames.length)), []);
});

test('a waiting plan shows its answering step as planned, and a card drawn for a running plan’s step ends it', () => {
    const steps = [
        { id: 's1', label: 'Find aid' },
        { id: 's2', label: 'Chart aid', gives_answer: true },
    ];
    const offered = after([read<StudioFrame>('event-03-plan-proposed.json')]);

    assert.deepEqual(
        plannedCards({ state: offered, waiting: { steps, answerStepId: 's2' }, cards: [] }).map(
            ({ id, type, turn }) => [id, type, turn],
        ),
        [['planned:s2', null, 2]],
    );
    assert.deepEqual(plannedCards({ state: NO_COMING, waiting: null, cards: [] }), []);

    const running = after([
        {
            event: 'plan.approved',
            seq: 1,
            plan_version_id: 'pv1',
            version: 1,
            title: 'Aid',
            steps,
            choices: [],
        },
    ]);
    const drawn = {
        kind: 'key_number',
        id: 'c1',
        label: 'Aid',
        value: '1',
        planStep: { plan_version_id: 'pv1', plan_step_id: 's2' },
    } satisfies Widget;
    const planned = (cards: Widget[]) =>
        plannedCards({ state: running, waiting: null, cards }).map((card) => card.id);

    assert.deepEqual(planned([]), ['planned:pv1/s2']);
    assert.deepEqual(planned([drawn]), []);
});

test('no placeholders read as the one empty list', () => {
    assert.equal(comingCards([], []), NONE_COMING);
});

test('a saved card names no placeholder', () => {
    const other = { id: 'c2', turn: 1 };
    const landed = { id: 'c1', turn: 2, placeholderId: 's1.0' };
    const cards = [landed, other];

    assert.deepEqual(JSON.parse(JSON.stringify(savedCards(cards))), [{ id: 'c1', turn: 2 }, other]);
    assert.equal(savedCards([other]).length, 1);
    // The live card keeps it.
    assert.equal(landed.placeholderId, 's1.0');
});
