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
import type { ActivityStepFrame, ComponentCreated, PlanApproved, StudioFrame } from '../wire.ts';

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

test('a plan shows one planned place per answering step until the step draws or its line opens', () => {
    const steps = [
        { id: 's1', label: 'Find aid' },
        { id: 's2', label: 'Chart aid', gives_answer: true },
    ];
    const waiting = { steps, answerStepId: 's2' };
    const offered = after([read<StudioFrame>('event-03-plan-proposed.json')]);

    assert.deepEqual(
        plannedCards({ state: offered, waiting, cards: [] }).map(({ id, type, turn }) => [
            id,
            type,
            turn,
        ]),
        [['planned:s2', null, 2]],
    );
    assert.deepEqual(plannedCards({ state: NO_COMING, waiting: null, cards: [] }), []);

    const approved: PlanApproved = {
        event: 'plan.approved',
        seq: 1,
        plan_version_id: 'pv1',
        version: 1,
        title: 'Aid',
        steps,
        choices: [],
    };
    const running = after([approved]);
    const planned = (state: ComingState, cards: Widget[] = []) =>
        plannedCards({ state, waiting: null, cards }).map((card) => card.id);

    assert.deepEqual(planned(running), ['planned:pv1/s2']);

    // Its drawing line opens: its announced places replace the planned one.
    const opened = comingAfter(running, { ...line, plan_version_id: 'pv1', plan_step_id: 's2' }, 2);

    assert.deepEqual(planned(opened), []);
    assert.deepEqual(
        comingCards(opened.announced, []).map((card) => card.id),
        ['s1.0', 's1.1'],
    );

    // A card drawn for the step ends it too.
    const card = {
        kind: 'text',
        id: 't',
        title: 't',
        body: '',
    } satisfies Widget;
    const drawn = {
        kind: 'key_number',
        id: 'c1',
        label: 'Aid',
        value: '1',
        planStep: { plan_version_id: 'pv1', plan_step_id: 's2' },
    } satisfies Widget;

    assert.deepEqual(planned(running, [card]), ['planned:pv1/s2']);
    assert.deepEqual(planned(running, [drawn]), []);
    // The stream's end leaves no running plan.
    assert.deepEqual(planned(comingEnded(running)), []);
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
