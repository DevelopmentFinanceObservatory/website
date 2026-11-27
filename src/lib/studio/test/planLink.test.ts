import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { ChatMessage, TurnWidget } from '@/components/organisms/Studio/hooks/useChat';
import { planFromFrame, type ApprovedPlan } from '../plan.ts';
import { planLinks } from '../planLink.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated, PlanProposed } from '../wire.ts';

const plan = (title: string): ApprovedPlan => ({
    plan_version_id: `v-${title}`,
    version: 1,
    title,
    steps: [{ label: 'Fetch' }, { label: 'Chart', gives_answer: true }],
    choices: [],
});

const card = (id: string, turn: number): TurnWidget => ({
    kind: 'text',
    id,
    title: id,
    body: '',
    turn,
});

const messages: ChatMessage[] = [
    { role: 'user', text: 'Aid to Kenya', turn: 1 },
    { role: 'bot', text: 'Here.', plan: plan('Kenya plan') },
    { role: 'user', text: 'Words only', turn: 2 },
    { role: 'bot', text: 'An answer.' },
    { role: 'user', text: 'Aid to Ghana', turn: 3 },
    { role: 'bot', text: 'Here.', plan: plan('Ghana plan') },
];

test('planLinks gives each approved plan the cards its turn made, in canvas order', () => {
    const widgets = [card('c2', 1), card('g1', 3), card('w1', 2), card('c1', 1)];
    const links = planLinks({ messages, widgets });

    assert.deepEqual(links.plans, [
        { turn: 1, title: 'Kenya plan', cards: ['c2', 'c1'] },
        { turn: 3, title: 'Ghana plan', cards: ['g1'] },
    ]);
    assert.equal(links.planOf('c1')?.turn, 1);
    assert.equal(links.planOf('g1')?.title, 'Ghana plan');
    assert.equal(links.planOf('w1'), null);
    assert.equal(links.planOf('missing'), null);
});

test('planLinks keeps a unit-changed card, which keeps its turn, in its plan', () => {
    // placeCard swaps the replacement into the old card's place and turn.
    const widgets = [card('c1-unit', 1), card('c2', 1)];
    const links = planLinks({ messages, widgets });

    assert.deepEqual(links.planOf('c1-unit')?.cards, ['c1-unit', 'c2']);
});

test('planLinks leaves cards off the canvas out of a plan', () => {
    const widgets = [card('c1', 1), card('c2', 1)];
    const links = planLinks({ messages, widgets, visible: (id) => id !== 'c1' });

    assert.deepEqual(links.plans[0]?.cards, ['c2']);
    assert.equal(links.planOf('c1'), null);
});

test('planLinks keeps a card a later question replaced in its first question plan', () => {
    const made = (turn: number, id: string) => ({
        turn,
        prompt: '',
        startedAt: 0,
        tools: [
            {
                id: `m-${id}`,
                name: 'Make',
                args: 'make_charts',
                startedAt: 0,
                state: 'complete' as const,
                widgetId: id,
            },
        ],
    });
    const links = planLinks({
        messages,
        widgets: [card('c1-new', 2)],
        activity: [made(1, 'c1'), made(2, 'c1-new')],
        replaced: { 'c1-new': 'c1' },
    });

    assert.equal(links.planOf('c1-new')?.turn, 1);
});

// The harness's card frame (`event-06`) names plan `plan_01j9ze2k7c` and its
// step `s3`.
const created = JSON.parse(
    readFileSync(new URL('./fixtures/event-06-component-created.json', import.meta.url), 'utf8'),
) as ComponentCreated;

const planned = (id: string, turn: number, plan_version_id: string, plan_step_id: string) => {
    const widget = widgetFromComponent({
        ...created,
        component_id: id,
        created_from: { step_id: 's2', plan_version_id, plan_step_id },
    });

    assert.ok(widget && widget.kind !== 'text');

    return { ...widget, id, turn };
};

test('a card frame names its plan and step, which planLinks reads before the turn', () => {
    const widget = widgetFromComponent(created);

    assert.deepEqual(widget?.kind !== 'text' && widget?.planStep, {
        plan_version_id: 'plan_01j9ze2k7c',
        plan_step_id: 's3',
    });

    // Both plans number their steps from s1, so the pair names the step. The
    // card a later question drew on the first plan's result stays with it.
    const first = { ...plan('Kenya plan'), plan_version_id: 'plan_a' };
    const second = { ...plan('Ghana plan'), plan_version_id: 'plan_b' };
    const transcript: ChatMessage[] = [
        { role: 'user', text: 'Aid to Kenya', turn: 1 },
        { role: 'bot', text: 'Here.', plan: first },
        { role: 'user', text: 'Aid to Ghana', turn: 2 },
        { role: 'bot', text: 'Here.', plan: second },
    ];
    const links = planLinks({
        messages: transcript,
        widgets: [
            planned('k1', 2, 'plan_a', 's3'),
            planned('g1', 2, 'plan_b', 's3'),
            card('t1', 2),
            // A plan id no approved plan of the transcript carries.
            planned('x1', 1, 'plan_gone', 's1'),
        ],
    });

    assert.deepEqual(links.planOf('k1'), {
        turn: 1,
        title: 'Kenya plan',
        cards: ['k1', 'x1'],
        stepId: 's3',
    });
    assert.deepEqual([links.planOf('g1')?.turn, links.planOf('g1')?.stepId], [2, 's3']);
    // A card without ids, or with ids the transcript does not hold, falls
    // back to its turn, with no step.
    assert.deepEqual([links.planOf('t1')?.turn, links.planOf('t1')?.stepId], [2, null]);
    assert.deepEqual([links.planOf('x1')?.turn, links.planOf('x1')?.stepId], [1, null]);
});

test('the harness plan proposal ties each decision to steps of its own plan, and names the kinds a card row shows', () => {
    const frame = JSON.parse(
        readFileSync(new URL('./fixtures/event-03-plan-proposed.json', import.meta.url), 'utf8'),
    ) as PlanProposed;
    const proposed = planFromFrame(frame);
    const steps = new Set(proposed.steps.map((step) => step.id));

    for (const decision of proposed.decisions) {
        assert.ok(decision.step_ids && decision.step_ids.length > 0, decision.id);
        assert.ok(
            decision.step_ids.every((id) => steps.has(id)),
            decision.id,
        );
    }

    // `unit` matches a card's Unit row and `window` its Years row; a decision
    // with no kind matches no row, so Set by the plan lists it.
    assert.deepEqual(
        proposed.decisions.map((decision) => decision.kind ?? null),
        [null, 'unit', 'window'],
    );
});
