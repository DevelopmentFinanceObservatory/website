import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessage, TurnWidget } from '@/components/organisms/Studio/hooks/useChat';
import type { ApprovedPlan } from '../plan.ts';
import { planLinks } from '../planLink.ts';

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
