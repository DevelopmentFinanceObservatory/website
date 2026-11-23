import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { clarifyFromFrame } from '../clarify.ts';
import { planFromFrame } from '../plan.ts';
import { sessionLeftChat, sessionRecap } from '../sessionLeft.ts';
import { forkRecap } from '../transcript.ts';
import type { ElicitationRequest, PlanProposed } from '../wire.ts';
import type { ChatMessage, ChatState } from '../../../components/organisms/Studio/hooks/useChat.ts';

const fixture = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const transcript: ChatMessage[] = [
    { role: 'user', text: 'Health aid to Ghana', turn: 1, harnessTurn: 1 },
    {
        role: 'bot',
        text: 'Health aid to Ghana rose.',
        chips: [
            {
                kind: 'apply_choice',
                label: 'Net',
                choice_id: 'c',
                option_id: 'o',
                turn: 1,
                spec_id: 's',
            },
        ],
    },
    { role: 'user', text: 'and in 2021?', turn: 2 },
    { role: 'bot', text: '' },
];

test('sessionLeftChat: the plan and question cards go with the session, and the transcript is inherited', () => {
    const state: ChatState = {
        messages: transcript,
        widgets: [],
        queued: [],
        activity: [],
        status: null,
        statusDetail: null,
        statusSince: null,
        stalled: false,
        thinking: false,
        clarify: clarifyFromFrame(
            fixture('event-14-elicitation-questions.json') as ElicitationRequest,
        ),
        plan: planFromFrame(fixture('event-22-plan-proposed-unit.json') as PlanProposed),
    };

    const left = sessionLeftChat(state);

    assert.equal(left.plan, null);
    assert.equal(left.clarify, null);
    assert.ok(left.messages.every((message) => message.inherited));
    assert.equal(left.messages[1]?.role === 'bot' && left.messages[1].chips, undefined);
});

test('sessionRecap: a turn refused for want of the session leaves its prompt out of the recap', () => {
    const recap = sessionRecap(transcript, 2);

    assert.equal(recap, forkRecap(transcript.slice(0, 2)));
    assert.ok(!recap?.includes('and in 2021?'));
    // A session left for any other reason recaps the whole transcript.
    assert.ok(sessionRecap(transcript)?.includes('and in 2021?'));
});

test('sessionRecap: a refunded prompt and its note stay out of the recap', () => {
    const reopened: ChatMessage[] = [
        { role: 'user', text: 'Health aid to Ghana', turn: 1 },
        { role: 'bot', text: 'Health aid to Ghana rose.' },
        { role: 'user', text: 'and in 2021?', turn: 2, refunded: true },
        { role: 'bot', text: 'Studio is busy. Try again.' },
        { role: 'user', text: 'and in Kenya?', turn: 3 },
        { role: 'bot', text: 'Kenya fell.' },
    ];

    assert.equal(
        sessionRecap(reopened),
        forkRecap([...reopened.slice(0, 2), ...reopened.slice(4)]),
    );
});
