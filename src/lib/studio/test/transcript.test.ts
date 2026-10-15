import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessage } from '../../../components/organisms/Studio/hooks/useChat.ts';
import type { ShareMark } from '../../chat/history.ts';
import { isPrompt, shareMarkAfter, withAnswer } from '../transcript.ts';

const paused: ChatMessage[] = [
    { role: 'user', text: 'Show me aid to Kenya' },
    { role: 'bot', text: '' },
];

test("an answer goes before the paused turn's reply, which stays last for the stream", () => {
    assert.deepEqual(withAnswer(paused, 'Gross disbursements'), [
        { role: 'user', text: 'Show me aid to Kenya' },
        { role: 'user', text: 'Gross disbursements', answer: true },
        { role: 'bot', text: '' },
    ]);
});

test('a second pause in the same turn keeps the answers in order', () => {
    const twice = withAnswer(withAnswer(paused, 'Gross disbursements'), 'Make it since 2018.');

    assert.deepEqual(
        twice.map((message) => message.text),
        ['Show me aid to Kenya', 'Gross disbursements', 'Make it since 2018.', ''],
    );
});

test('the transcript it is given is left as it was', () => {
    withAnswer(paused, 'Gross disbursements');

    assert.equal(paused.length, 2);
});

test('answers do not number turns: the reply still belongs to the first turn', () => {
    const messages = withAnswer(withAnswer(paused, 'Gross disbursements'), 'Since 2018.');

    assert.equal(messages.slice(0, messages.length - 1).filter(isPrompt).length, 1);
});

test('only a turn-opening user message is a prompt', () => {
    assert.equal(isPrompt({ role: 'user', text: 'Show me aid to Kenya' }), true);
    assert.equal(isPrompt({ role: 'user', text: 'Gross disbursements', answer: true }), false);
    assert.equal(isPrompt({ role: 'bot', text: 'According to the OECD…' }), false);
});

// The mark useConversationSave records for a share of `messages`.
const markFor = (messages: ChatMessage[]): ShareMark => ({
    messageIndex: messages.length,
    userMessages: messages.filter((message) => message.role === 'user').length,
    shareId: 'share',
    at: 0,
});

test('a share taken during a pause stays above the answer given after it', () => {
    const mark = markFor(paused);
    const answered = withAnswer(paused, 'You chose: Gross disbursements');

    assert.equal(answered[shareMarkAfter(answered, mark)]?.text, 'Show me aid to Kenya');
});

test('a share of a re-offered plan whose reply has text stays above the next amendment', () => {
    // A refused amendment re-offers the plan with the refusal in the reply.
    const reoffered: ChatMessage[] = [
        paused[0],
        { role: 'user', text: 'Make it since 2018.', answer: true },
        { role: 'bot', text: 'That change could not be made.' },
    ];
    const mark = markFor(reoffered);
    const amended = withAnswer(reoffered, 'Make it since 2019.');

    assert.equal(amended[shareMarkAfter(amended, mark)]?.text, 'Make it since 2018.');
});

test('a share of a finished turn sits after its reply, before the next prompt', () => {
    const finished: ChatMessage[] = [paused[0], { role: 'bot', text: 'According to the OECD…' }];
    const mark = markFor(finished);

    assert.equal(shareMarkAfter(finished, mark), 1);
    assert.equal(shareMarkAfter([...finished, { role: 'user', text: 'And Ghana?' }], mark), 1);
});

test('a mark saved before userMessages keeps its message count', () => {
    const mark: ShareMark = { messageIndex: 2, shareId: 'share', at: 0 };

    assert.equal(shareMarkAfter(withAnswer(paused, 'Since 2018.'), mark), 1);
});
