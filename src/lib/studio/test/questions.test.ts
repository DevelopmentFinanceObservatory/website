import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { ApprovedPlan } from '../plan.ts';
import { firstSentence, promptsOf, questionsOf, replyPreview } from '../questions.ts';

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

test('a reply preview runs on as prose, keeps bold spans, and says when the reply holds more', () => {
    const plain = (text: string) => ({ text, strong: false });
    const strong = (text: string) => ({ text, strong: true });
    const long = `${'Aid rose again. '.repeat(25)}End.`;
    const cases: [string, string, ReturnType<typeof replyPreview>][] = [
        ['a short reply', '_Aid rose._', { parts: [plain('Aid rose.')], more: false }],
        [
            'paragraphs run on, with link targets and emphasis dropped',
            '## Kenya\n\nAid rose [3.5%](https://example.org).\n\n> It fell _later_.',
            { parts: [plain('Kenya Aid rose 3.5%. It fell later.')], more: false },
        ],
        [
            'bold spans',
            '**Kenya** received **US$2bn** in 2022.',
            {
                parts: [strong('Kenya'), plain(' received '), strong('US$2bn'), plain(' in 2022.')],
                more: false,
            },
        ],
        [
            'a list ends it',
            'Aid rose.\n\n- Kenya\n- Chad',
            { parts: [plain('Aid rose.')], more: true },
        ],
        [
            'a table ends it',
            'Aid by year:\n| Year | Aid |\n| --- | --- |',
            { parts: [plain('Aid by year:')], more: true },
        ],
    ];

    for (const [name, text, preview] of cases) {
        assert.deepEqual(replyPreview(text), preview, name);
    }

    const cut = replyPreview(long);
    const excerpt = cut.parts.map((part) => part.text).join('');

    assert.equal(cut.more, true);
    assert.ok(long.startsWith(excerpt) && long[excerpt.length] === ' ', 'cut at a word boundary');
    assert.ok(excerpt.length > 300 && excerpt.length <= 320, 'cut near the cap');
});
