import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { ApprovedPlan } from '../plan.ts';
import { firstSentence, promptsOf, questionsOf } from '../questions.ts';

const ask = (text: string, turn: number, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ role: 'user', text, turn, ...extra }) as ChatMessage;

const reply = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ role: 'bot', text, ...extra }) as ChatMessage;

const approved: ApprovedPlan = {
    plan_version_id: 'pv',
    version: 1,
    title: 'Plan',
    steps: [{ label: 'Find aid to Kenya' }],
    choices: [],
};

test('a refunded prompt is a refused question whose reply is the refusal', () => {
    const messages = [
        ask('Aid to Kenya', 1),
        reply('Kenya received US$2bn.'),
        ask('Aid to Chad', 2, { refunded: true }),
        reply('That question was refused.'),
    ];

    assert.deepEqual(
        questionsOf(messages, []).map((question) => [
            question.turn,
            question.refused,
            question.reply,
        ]),
        [
            [1, false, 'Kenya received US$2bn.'],
            [2, true, 'That question was refused.'],
        ],
    );
});

test('an answer to a paused turn belongs to the question it answers', () => {
    const messages = [
        ask('Aid to Kenya', 1),
        reply('Which years?'),
        ask('2015 to 2023', 1, { answer: true }),
        reply('Aid rose.', { followups: ['And Uganda?'] }),
    ];
    const [question, ...rest] = questionsOf(messages, []);

    assert.equal(rest.length, 0);
    assert.equal(question?.reply, 'Aid rose.');
    assert.deepEqual(question?.followups, ['And Uganda?']);
});

test('a card change is a prompt and no question', () => {
    const messages = [
        ask('Aid to Kenya', 1),
        reply('Kenya received US$2bn.'),
        ask('Constant 2023 US dollars', 2, { edit: { card: 'c1', row: 'unit' } }),
        reply(''),
    ];

    assert.deepEqual(
        promptsOf(messages, []).map((question) => question.edit?.card ?? null),
        [null, 'c1'],
    );
    assert.deepEqual(
        questionsOf(messages, []).map((question) => question.turn),
        [1],
    );
});

test('a question keeps the plan an earlier bot message of it carries', () => {
    const messages = [
        ask('Aid to Kenya', 1),
        reply('', { plan: approved }),
        ask('Go on', 1, { answer: true }),
        reply('Aid rose.'),
    ];

    assert.equal(questionsOf(messages, [])[0]?.plan, approved);
});

test('a first sentence is plain text cut at the end of its sentence', () => {
    for (const [text, sentence] of [
        ['\n\n**Aid** rose 3.5% in 2023. It fell later.', 'Aid rose 3.5% in 2023.'],
        [
            '**Kenya** received [US$2bn](https://example.org) in 2022.',
            'Kenya received US$2bn in 2022.',
        ],
        ['- First `item`! Then more', 'First item!'],
        ['## Heading line', 'Heading line'],
        ['_Stopped._', 'Stopped.'],
        ['_The card could not change. Its data_is gone._', 'The card could not change.'],
        ['See [the data](https://example.org) here? Yes.', 'See the data here?'],
        ['No ending', 'No ending'],
        ['', ''],
    ]) {
        assert.equal(firstSentence(text), sentence);
    }
});
