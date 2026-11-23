/**
 * A reopened conversation against the harness's state read: closed turns
 * merge in once, a pause comes back as its card, and a running turn nobody
 * holds is resumed.
 */
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';

import { canvasWidgetsOf } from '../../chat/canvas.ts';
import { createLegacyCanvas, takeManifest } from '../composition.ts';
import {
    approvalKeys,
    cardTurns,
    drawManifestCards,
    attachStep,
    cardsToRead,
    carryOnTurn,
    mergeClosedTurns,
    owedNewQuestion,
    producedCards,
    readConversation,
    RESUME_ATTEMPTS,
    sendNewQuestion,
    takeApproval,
    widgetFromRead,
    withMovedQuestion,
    withOwedQuestion,
    withTurnApprovals,
    type AttachStep,
} from '../conversationState.ts';
import { approvedFromFrame, planFromFrame, withApprovedPlan } from '../plan.ts';
import {
    ensureTurn,
    forkRecap,
    UNSENT_NOTE,
    withReadPrompts,
    heldTurns,
    isUnkeyedSave,
    keyUnkeyedSave,
    NEW_QUESTION_NOTE,
    promptTurns,
    readSince,
    withHarnessTurn,
    withInherited,
    withSessionLeft,
    offeredQuestionPageTurns,
    offeredQuestionTurn,
    pageTurnReplyAt,
    turnReplyAt,
    withAnswer,
    withFollowup,
    withNewQuestion,
    withReplyAt,
    withOfferedQuestion,
    withoutUnsentQuestion,
} from '../transcript.ts';
import {
    isStateRefusal,
    readComponent,
    runTurn,
    type StateRefusal,
    type StreamHandlers,
    type StreamRefusal,
} from '../studioClient.ts';
import type {
    ClosedTurn,
    CompositionManifest,
    ConversationRead,
    PlanApproved,
    PlanProposed,
    StudioFrame,
    TurnState,
} from '../wire.ts';
import { bodyOf } from './fixtures/recorded-wire.ts';

const closed = (turnIndex: number, reply = `reply ${turnIndex}`): ClosedTurn => ({
    turn_index: turnIndex,
    user_message: `question ${turnIndex}`,
    reply,
    component_ids: [],
});

const turnState = (overrides: Partial<TurnState>): TurnState => ({
    index: 2,
    status: 'running',
    trace_id: 'tr_1',
    lease_live: false,
    ...overrides,
});

const readOf = (overrides: Partial<ConversationRead>): ConversationRead => ({
    conversation_id: 'conv',
    closed_since: [],
    ...overrides,
});

const PLAN: PlanProposed = {
    event: 'plan.proposed',
    seq: 14,
    interrupt_id: 'int-7',
    plan_version_id: 'pv-1',
    version: 1,
    title: 'ODA to Rwanda in 2022 by sector',
    steps: [],
    actions: ['approve', 'amend', 'reject'],
    revision: 'rev-a',
} as PlanProposed;

test('mergeClosedTurns appends a closed turn newer than the snapshot once', () => {
    const held: ChatMessage[] = [
        { role: 'user', text: 'question 1', harnessTurn: 1 },
        { role: 'bot', text: 'reply 1' },
    ];

    const first = mergeClosedTurns(held, [closed(1), closed(2)], 2);

    assert.deepEqual(first.messages, [
        ...held,
        { role: 'user', text: 'question 2', harnessTurn: 2, turn: 2 },
        { role: 'bot', text: 'reply 2' },
    ]);
    assert.deepEqual(
        first.appended.map((turn) => turn.turn_index),
        [2],
    );

    // A second read of the same turns, from the merged transcript, adds nothing.
    const again = mergeClosedTurns(first.messages, [closed(1), closed(2)], 3);

    assert.equal(again.messages, first.messages);
    assert.deepEqual(again.appended, []);
});

test('mergeClosedTurns shows a forked first turn as the message after its recap', () => {
    const forked = [{ role: 'user', text: 'Health aid to Ghana' } as const];
    const recorded = { ...closed(1), user_message: `${forkRecap(forked)}and in 2021?` };

    assert.deepEqual(mergeClosedTurns([], [recorded], 1).messages[0], {
        role: 'user',
        text: 'and in 2021?',
        harnessTurn: 1,
        turn: 1,
    });
});

// Turn 1 as the harness's state read gives it (`_closed_turn`): the answer
// with the notes and the basis line the stream appended, as its
// `message.complete` sent them.
const RECORDED_CLOSED: ClosedTurn = {
    turn_index: 1,
    user_message: 'ODA to Kenya since 2018',
    reply:
        'ODA to Kenya rose from $2.5bn in 2018 to $3.4bn in 2022.\n\n' +
        'Matched "Kenya" to the recipient Kenya.\n\n' +
        'Basis: OECD CRS, gross disbursements, constant 2022 USD.',
    component_ids: ['cmp_kenya'],
    approved: null,
    error: null,
    new_question: null,
};

test("a held turn that closed cleanly takes the harness's reply, which the page saved mid-stream", () => {
    const prompt: ChatMessage = {
        role: 'user',
        text: 'ODA to Kenya since 2018',
        harnessTurn: 1,
        turn: 1,
    };
    // Saved while the answer streamed: the deltas so far.
    const truncated: ChatMessage[] = [prompt, { role: 'bot', text: 'ODA to Kenya rose from' }];

    // The read covers the page's latest turn, the one that streamed.
    assert.equal(readSince(truncated), 0);

    const { messages } = mergeClosedTurns(truncated, [RECORDED_CLOSED], 2);

    assert.deepEqual(messages, [prompt, { role: 'bot', text: RECORDED_CLOSED.reply }]);
    // Merging the same turn again changes nothing.
    assert.equal(mergeClosedTurns(messages, [RECORDED_CLOSED], 2).messages, messages);

    // A turn that closed with an error keeps the page's text, so a stopped
    // turn keeps its note, and fills only an empty reply.
    const stopped = { ...RECORDED_CLOSED, reply: 'ODA to Kenya', error: 'cancelled' };
    const noted: ChatMessage[] = [prompt, { role: 'bot', text: '_Stopped._' }];

    assert.equal(mergeClosedTurns(noted, [stopped], 2).messages, noted);
    assert.deepEqual(mergeClosedTurns([prompt, { role: 'bot', text: '' }], [stopped], 2).messages, [
        prompt,
        { role: 'bot', text: 'ODA to Kenya' },
    ]);

    // A turn whose stream sent no reply (`reply_shown: false`) changes nothing.
    assert.equal(
        mergeClosedTurns(truncated, [{ ...RECORDED_CLOSED, reply: '' }], 2).messages,
        truncated,
    );
});

test('a turn set aside for a new question shows a note, not an empty reply', () => {
    const { messages } = mergeClosedTurns(
        [],
        [{ ...closed(1, ''), new_question: 'ODA to Ghana' }],
        1,
    );

    assert.deepEqual(messages.at(-1), { role: 'bot', text: NEW_QUESTION_NOTE });
});

test('heldTurns counts only the turns the harness confirmed', () => {
    const messages: ChatMessage[] = [
        { role: 'user', text: 'a', turn: 1 },
        { role: 'bot', text: 'b' },
        { role: 'user', text: 'refused', refunded: true, turn: 2 },
        { role: 'bot', text: '' },
        { role: 'user', text: 'an answer', answer: true },
        { role: 'user', text: 'c', turn: 3 },
    ];

    // No prompt names its turn, so the transcript holds none.
    assert.equal(heldTurns(messages), 0);

    // A stream names the turn of the prompt it was opened for, which a
    // prompt saved before its stream named one does not count on from.
    const keyed = withHarnessTurn(messages, 1, 7);

    assert.equal(heldTurns(keyed), 7);
    assert.equal(heldTurns([...keyed, { role: 'user', text: 'd', turn: 4 }]), 7);
    assert.equal(readSince(keyed), 0);
    assert.equal(readSince([]), 0);
});

test('a stream keys the prompt it was opened for, and never moves a confirmed turn', () => {
    const messages: ChatMessage[] = [
        { role: 'user', text: 'mine', harnessTurn: 1, turn: 1 },
        { role: 'bot', text: 'answer' },
        { role: 'user', text: 'sent', turn: 2 },
        { role: 'bot', text: '' },
        { role: 'user', text: 'queued after it', turn: 3 },
        { role: 'bot', text: '' },
    ];

    // Page turn 2's stream names harness turn 2: the prompt it carries
    // takes it, not the last prompt.
    const keyed = withHarnessTurn(messages, 2, 2);

    assert.deepEqual(
        [...promptTurns(keyed)],
        [
            [0, 1],
            [2, 2],
        ],
    );
    // A resume of turn 1 that page turn 3's stream carried leaves turn 1
    // where it is.
    assert.equal(withHarnessTurn(keyed, 3, 1), keyed);
    // A prompt that holds a turn is not relabelled.
    assert.equal(withHarnessTurn(keyed, 2, 5), keyed);
});

test('a new turn the harness numbers from 1 again keys its prompt once the page leaves the old session', () => {
    // The harness lost the session, and `/turn` began a new conversation
    // under the same id, whose first turn is 1 again.
    const messages: ChatMessage[] = [
        { role: 'user', text: 'first', harnessTurn: 1, turn: 1 },
        { role: 'bot', text: 'answer 1' },
        { role: 'user', text: 'second', harnessTurn: 2, turn: 2 },
        { role: 'bot', text: 'answer 2' },
        { role: 'user', text: 'third', turn: 3 },
        { role: 'bot', text: '' },
    ];

    const keyed = withHarnessTurn(withSessionLeft(messages, 3), 3, 1);

    assert.deepEqual([...promptTurns(keyed)], [[4, 1]]);
    assert.ok(keyed.slice(0, 4).every((message) => message.inherited));
    assert.equal(keyed[4]?.inherited, undefined);
    // The new session's turn 2 is held by no prompt, so a state read's
    // closed turn 2 is not taken for the old turn 2.
    assert.equal(turnReplyAt(keyed, 2), -1);

    // Left with no turn of its own, the whole transcript is inherited.
    assert.equal(heldTurns(withSessionLeft(messages)), 0);
});

test('the cards a legacy canvas counts as drawn: every closed turn, and an open turn the page holds', () => {
    const closedTurns = [
        { ...closed(1), component_ids: ['cmp_a'] },
        { ...closed(2), component_ids: ['cmp_b', 'cmp_c'] },
    ];

    for (const [status, drawn] of [
        ['paused', ['cmp_a', 'cmp_b', 'cmp_c', 'cmp_open']],
        ['running', ['cmp_a', 'cmp_b', 'cmp_c', 'cmp_open']],
        ['done', ['cmp_a', 'cmp_b', 'cmp_c']],
    ] as const) {
        const read = readOf({
            turn: turnState({ index: 3, status }),
            closed_since: closedTurns,
        });

        assert.deepEqual([...producedCards(read, ['cmp_open'])].sort(), drawn, status);
    }
});

test('a state read refused on a later page is the answer', async () => {
    const answers = [
        readOf({ closed_since: [closed(1), closed(2), closed(3)], closed_total: 5 }),
        { refusal: 'session_gone' as const, http: { status: 404, detail: null, error: null } },
    ];

    assert.deepEqual(await readConversation('conv', 0, undefined, async () => answers.shift()!), {
        refusal: 'session_gone',
        http: { status: 404, detail: null, error: null },
    });
});

test('a reload that missed five turns pages the read and appends five keyed pairs in order', async () => {
    const saved: ChatMessage[] = [
        { role: 'user', text: 'question 1', harnessTurn: 1 },
        { role: 'bot', text: 'reply 1' },
    ];
    const all = [1, 2, 3, 4, 5, 6].map((index) => closed(index));
    const calls: number[] = [];
    const read = await readConversation('conv', readSince(saved), undefined, async (_, since) => {
        calls.push(since);

        return readOf({
            turn: turnState({ index: 6, status: 'done' }),
            closed_since: all.filter((turn) => turn.turn_index > since).slice(0, 3),
            closed_total: 6,
        });
    });

    assert.deepEqual(calls, [0, 3]);
    assert.ok(read && !isStateRefusal(read));

    const { messages } = mergeClosedTurns(saved, read.closed_since, 2);

    assert.deepEqual(messages.slice(2), [
        ...[2, 3, 4, 5, 6].flatMap((index): ChatMessage[] => [
            { role: 'user', text: `question ${index}`, harnessTurn: index, turn: index },
            { role: 'bot', text: `reply ${index}` },
        ]),
    ]);
    assert.equal(heldTurns(messages), 6);
});

test('attaching to an open turn the snapshot never held shows its prompt', () => {
    const saved: ChatMessage[] = [
        { role: 'user', text: 'question 1', harnessTurn: 1 },
        { role: 'bot', text: 'reply 1' },
    ];
    const read = readOf({
        turn: turnState({ index: 2, user_message: 'question 2' }),
        closed_since: [closed(1)],
        closed_total: 1,
    });
    const step = attachStep(read);

    assert.deepEqual(step, { kind: 'resume', turnIndex: 2 });

    const messages = ensureTurn(saved, step.turnIndex, read.turn!.user_message!, 2);

    assert.deepEqual(messages.slice(2), [
        { role: 'user', text: 'question 2', harnessTurn: 2, turn: 2 },
        { role: 'bot', text: '' },
    ]);
    // The stream that carries it on writes into that reply, the last message.
    assert.equal(ensureTurn(messages, 2, 'question 2', 3), messages);
});

test('attachStep decides from the turn status and the lease', () => {
    const cases: [ConversationRead, AttachStep][] = [
        [readOf({}), { kind: 'none' }],
        [readOf({ turn: turnState({}) }), { kind: 'resume', turnIndex: 2 }],
        [
            readOf({ turn: turnState({ lease_live: true, retry_after_seconds: 30 }) }),
            { kind: 'wait', turnIndex: 2, seconds: 30 },
        ],
        [
            readOf({
                turn: turnState({ status: 'paused' }),
                pause: { interrupt_id: 'int-7', kind: 'plan', frames: [PLAN] },
            }),
            { kind: 'pause', turnIndex: 2, frames: [PLAN] },
        ],
        // A pause stored before its frames were kept cannot be shown.
        [
            readOf({
                turn: turnState({ status: 'paused' }),
                pause: { interrupt_id: 'int-7', kind: 'plan', frames: [] },
            }),
            { kind: 'none' },
        ],
        [readOf({ turn: turnState({ status: 'done' }) }), { kind: 'none' }],
    ];

    for (const [read, expected] of cases) {
        assert.deepEqual(attachStep(read), expected, JSON.stringify(read.turn));
    }
});

// A carryOnTurn run with recorded calls: `resumes` answers each resume in
// turn (frames, or a refusal), `reads` each state read, and `onRefusal`
// stands for the stream's own refusal handler.
const run = async (
    first: AttachStep,
    {
        resumes = [],
        reads = [],
        onRefusal,
    }: {
        resumes?: (StudioFrame[] | StreamRefusal)[];
        reads?: (ConversationRead | StateRefusal | null)[];
        onRefusal?: StreamHandlers['onRefusal'];
    } = {},
) => {
    const frames: StudioFrame[] = [];
    const calls: string[] = [];
    const merged: ConversationRead[] = [];

    await carryOnTurn({
        conversationId: 'conv',
        first,
        handlers: { onFrame: (frame) => frames.push(frame), onRefusal },
        signal: new AbortController().signal,
        since: () => 1,
        onRead: (read) => merged.push(read),
        resume: async (conversationId, turnIndex, handlers: StreamHandlers) => {
            calls.push(`resume ${conversationId} ${turnIndex}`);
            const answer = resumes.shift();

            if (Array.isArray(answer)) {
                answer.forEach(handlers.onFrame);
            } else if (answer) {
                handlers.onRefusal?.(answer);
            }
        },
        read: async (conversationId, since) => {
            calls.push(`read ${conversationId} ${since}`);

            return reads.shift() ?? null;
        },
        sleep: async (ms) => {
            calls.push(`sleep ${ms}`);
        },
    });

    return { frames, calls, merged };
};

test('carryOnTurn resumes a running turn nobody holds and streams it', async () => {
    const done: StudioFrame = { event: 'done', seq: 40, trace_id: 'tr_1', composition: null };
    const { frames, calls } = await run(
        { kind: 'resume', turnIndex: 2 },
        { resumes: [[{ event: 'message.complete', seq: 39, text: 'The answer.' }, done]] },
    );

    assert.deepEqual(calls, ['resume conv 2']);
    assert.deepEqual(
        frames.map((frame) => frame.event),
        ['message.complete', 'done'],
    );
});

test('carryOnTurn shows a pending pause as the card the live stream would', async () => {
    const { frames, calls } = await run({ kind: 'pause', turnIndex: 2, frames: [PLAN] });

    assert.deepEqual(calls, []);
    assert.deepEqual(frames, [PLAN]);

    const card = planFromFrame(frames[0] as PlanProposed);

    assert.equal(card.interruptId, 'int-7');
    assert.equal(card.live, true);
});

test('carryOnTurn waits out a held turn, then shows the pause it reached', async () => {
    const busy: StreamRefusal = {
        status: 409,
        detail: 'busy',
        error: {
            error: 'transient_unavailable',
            retry: 'retry_after_delay',
            detail: 'busy',
            retry_after_seconds: 7,
        },
    };
    const paused = readOf({
        turn: turnState({ status: 'paused' }),
        pause: { interrupt_id: 'int-7', kind: 'plan', frames: [PLAN] },
    });
    const { frames, calls, merged } = await run(
        { kind: 'resume', turnIndex: 2 },
        { resumes: [busy], reads: [paused] },
    );

    assert.deepEqual(calls, ['resume conv 2', 'sleep 7000', 'read conv 1']);
    assert.deepEqual(merged, [paused]);
    assert.deepEqual(frames, [PLAN]);
});

test('carryOnTurn ends the turn once the harness has closed it', async () => {
    const { frames, calls } = await run(
        { kind: 'wait', turnIndex: 2, seconds: 3 },
        { reads: [readOf({ turn: turnState({ status: 'done' }), closed_since: [closed(2)] })] },
    );

    assert.deepEqual(calls, ['sleep 3000', 'read conv 1']);
    assert.deepEqual(
        frames.map((frame) => frame.event),
        ['done'],
    );
});

test('carryOnTurn rejects when the state cannot be read, so the turn ends failed', async () => {
    await assert.rejects(run({ kind: 'wait', turnIndex: 2, seconds: 1 }, { reads: [null] }));
});

test('carryOnTurn hands a refusal it does not retry to the stream, which ends the turn', async (t) => {
    const gone: StreamRefusal = {
        status: 404,
        detail: "no conversation 'conv'",
        error: {
            error: 'not_found',
            retry: 'do_not_retry',
            detail: "no conversation 'conv'",
            pointer: '/conversation_id',
        },
    };
    const cases: [string, AttachStep, Parameters<typeof run>[1], string[]][] = [
        [
            'a resume refused',
            { kind: 'resume', turnIndex: 2 },
            { resumes: [gone] },
            ['resume conv 2'],
        ],
        [
            'a read refused',
            { kind: 'wait', turnIndex: 2, seconds: 3 },
            { reads: [{ refusal: 'session_gone', http: gone }] },
            ['sleep 3000', 'read conv 1'],
        ],
    ];

    for (const [name, first, answers, expected] of cases) {
        await t.test(name, async () => {
            const heard: StreamRefusal[] = [];
            const { calls } = await run(first, {
                ...answers,
                onRefusal: (refusal) => {
                    heard.push(refusal);

                    return true;
                },
            });

            assert.deepEqual(heard, [gone]);
            assert.deepEqual(calls, expected);
        });
    }

    // A refusal the stream does not deal with ends the turn failed.
    await assert.rejects(run({ kind: 'resume', turnIndex: 2 }, { resumes: [gone] }));
});

test('carryOnTurn waits after any refused resume it may retry, and gives up after RESUME_ATTEMPTS', async () => {
    const conflict: StreamRefusal = {
        status: 409,
        detail: 'stale',
        error: { error: 'edit_conflict', retry: 'refresh_then_retry', detail: 'stale' },
    };
    const unavailable: StreamRefusal = {
        status: 503,
        detail: 'busy',
        error: {
            error: 'transient_unavailable',
            retry: 'retry_after_delay',
            detail: 'busy',
            retry_after_seconds: 5,
        },
    };
    const running = readOf({ turn: turnState({}) });
    const closedRead = readOf({
        turn: turnState({ status: 'done' }),
        closed_since: [closed(2)],
    });
    const { calls } = await run(
        { kind: 'resume', turnIndex: 2 },
        { resumes: [conflict, unavailable], reads: [running, closedRead] },
    );

    // A 409 naming no wait waits the default; a 503 the time it names.
    assert.deepEqual(calls, [
        'resume conv 2',
        'sleep 2000',
        'read conv 1',
        'resume conv 2',
        'sleep 5000',
        'read conv 1',
    ]);

    // A turn refused on every resume ends failed after a bounded number.
    let resumes = 0;

    await assert.rejects(
        carryOnTurn({
            conversationId: 'conv',
            first: { kind: 'resume', turnIndex: 2 },
            handlers: { onFrame: () => {} },
            signal: new AbortController().signal,
            since: () => 1,
            onRead: () => {},
            resume: async (_id, _turn, handlers: StreamHandlers) => {
                resumes += 1;
                handlers.onRefusal?.(resumes > 50 ? { ...conflict, status: 500 } : conflict);
            },
            read: async () => running,
            sleep: async () => {},
        }),
    );
    assert.equal(resumes, RESUME_ATTEMPTS);
});

test("owedNewQuestion sends a latest turn's new question once, while no turn follows it", () => {
    const asked = { ...closed(3, 'Set aside for a new question.'), new_question: 'ODA to Ghana' };
    const read = readOf({ turn: turnState({ index: 3, status: 'done' }), closed_since: [asked] });
    const upTo = (turns: number): ChatMessage[] =>
        Array.from({ length: turns }, (_, at): ChatMessage => ({
            role: 'user',
            text: `question ${at + 1}`,
            harnessTurn: at + 1,
        }));

    const owed = { turnIndex: 3, text: 'ODA to Ghana', tried: false };

    assert.deepEqual(owedNewQuestion(read, upTo(2)), owed);
    assert.deepEqual(owedNewQuestion(read, upTo(3)), owed);
    // The page holds a later turn, or the harness opened one.
    assert.equal(owedNewQuestion(read, upTo(4)), null);
    assert.equal(
        owedNewQuestion({ ...read, turn: turnState({ index: 4, status: 'running' }) }, upTo(3)),
        null,
    );
    assert.equal(owedNewQuestion({ ...read, closed_since: [closed(3)] }, upTo(3)), null);
    // A send of it the harness refused, which the meter gave back, or one it
    // never admitted, was tried: the page offers it rather than send it.
    for (const unsent of [
        { role: 'user', text: 'ODA to Ghana', refunded: true, fromNewQuestion: 3 },
        { role: 'user', text: 'ODA to Ghana', fromNewQuestion: 3 },
    ] satisfies ChatMessage[]) {
        assert.deepEqual(owedNewQuestion(read, [...upTo(3), unsent, { role: 'bot', text: '' }]), {
            ...owed,
            tried: true,
        });
    }

    // Once offered on the turn's reply, it is the user's to send.
    const offered: ChatMessage[] = [
        { role: 'user', text: 'question 3', harnessTurn: 3 },
        { role: 'bot', text: NEW_QUESTION_NOTE, followups: ['ODA to Ghana'] },
    ];

    assert.equal(owedNewQuestion(read, offered), null);
    assert.deepEqual(
        withFollowup(upTo(3).concat({ role: 'bot', text: '' }), 3, 'ODA to Ghana').at(-1),
        {
            role: 'bot',
            text: '',
            followups: ['ODA to Ghana'],
        },
    );
});

test("a moved new question leaves the transcript for a page that reads state, and stays offered on a guest's", () => {
    const messages: ChatMessage[] = [
        { role: 'user', text: 'question 3', turn: 3, harnessTurn: 3 },
        { role: 'bot', text: NEW_QUESTION_NOTE },
        { role: 'user', text: 'ODA to Ghana', turn: 4, fromNewQuestion: 3 },
        { role: 'bot', text: '' },
    ];

    // The state read brings in the turn that went ahead. The meter gave the
    // send's prompt back, so it leaves as a refund.
    assert.deepEqual(withMovedQuestion(messages, 3, 'ODA to Ghana', true), {
        messages: messages.slice(0, 2),
        refunds: 1,
    });
    // A guest reads no state, so the question stays for the user to send.
    const { messages: guest, refunds } = withMovedQuestion(messages, 3, 'ODA to Ghana', false);

    assert.equal(refunds, 1);
    assert.deepEqual(guest, [
        messages[0],
        {
            role: 'bot',
            text: NEW_QUESTION_NOTE,
            followups: ['ODA to Ghana'],
            newQuestion: 'ODA to Ghana',
        },
    ]);
    assert.equal(offeredQuestionTurn(guest, 'ODA to Ghana'), 3);

    // An earlier refused send of the question, refunded already, leaves with
    // it, so the meter hears both refunds.
    const resent: ChatMessage[] = [
        ...messages.slice(0, 2),
        { role: 'user', text: 'ODA to Ghana', turn: 4, fromNewQuestion: 3, refunded: true },
        { role: 'bot', text: 'Studio is busy.' },
        { role: 'user', text: 'ODA to Ghana', turn: 5, fromNewQuestion: 3 },
        { role: 'bot', text: '' },
    ];

    assert.equal(withMovedQuestion(resent, 3, 'ODA to Ghana', false).refunds, 2);
});

test('an owed question sent again replaces the send the harness never admitted', () => {
    const messages: ChatMessage[] = [
        { role: 'user', text: 'question 3', harnessTurn: 3 },
        { role: 'bot', text: NEW_QUESTION_NOTE },
        { role: 'user', text: 'ODA to Ghana', refunded: true, fromNewQuestion: 3 },
        { role: 'bot', text: '_Out of prompts._' },
        { role: 'user', text: 'ODA to Ghana', fromNewQuestion: 3 },
        { role: 'bot', text: '' },
    ];

    const shown = messages.slice(0, 4);

    // The refused send stays, as the transcript showed it.
    assert.deepEqual(withoutUnsentQuestion(messages, 3), shown);
    assert.equal(withoutUnsentQuestion(shown, 3), shown);

    // A send that never reached the harness goes with its reply, whatever
    // the reply says, so turn 3's reply stays turn 3's.
    for (const text of ['_The connection dropped._', '_Stopped._', '']) {
        const unsent: ChatMessage[] = [
            { role: 'user', text: 'question 3', harnessTurn: 3 },
            { role: 'bot', text: NEW_QUESTION_NOTE },
            { role: 'user', text: 'ODA to Ghana', fromNewQuestion: 3 },
            { role: 'bot', text },
        ];
        const kept = withoutUnsentQuestion(unsent, 3);

        assert.deepEqual(kept, unsent.slice(0, 2));
        assert.equal(turnReplyAt(kept, 3), 1);
    }
});

const BUSY: StreamRefusal = {
    status: 409,
    detail: 'busy',
    error: {
        error: 'transient_unavailable',
        retry: 'retry_after_delay',
        detail: 'busy',
        retry_after_seconds: 1,
    },
};

const MOVED: StreamRefusal = {
    status: 409,
    detail: "the request follows turn 3, and the conversation's latest turn is 4",
    error: {
        error: 'edit_conflict',
        retry: 'refresh_then_retry',
        constraint_id: 'turn_moved',
        pointer: '/after_turn',
        detail: "the request follows turn 3, and the conversation's latest turn is 4",
    },
};

// A page sending turn 3's new question through runTurn against a harness
// that answers each request with `answers` in order: a refusal, or an
// admitted turn 4.
const sendRun = async (t: TestContext, answers: (StreamRefusal | 'admitted')[]) => {
    const bodies: Record<string, unknown>[] = [];
    const calls: string[] = [];
    const refused: StreamRefusal[] = [];

    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
        calls.push('post');

        const answer = answers.shift();

        return answer === 'admitted'
            ? new Response('data: {"event":"done","seq":1,"trace_id":"t"}\n\n', {
                  headers: { 'x-dfo-turn-index': '4' },
              })
            : Response.json(answer?.error, { status: answer?.status ?? 500 });
    });

    await sendNewQuestion({
        turnIndex: 3,
        send: (afterTurn, handlers) =>
            runTurn('conv', 'ODA to Ghana', handlers, undefined, { after_turn: afterTurn }),
        handlers: {
            onFrame: () => {},
            onRefusal: (refusal) => {
                refused.push(refusal);

                return true;
            },
        },
        signal: new AbortController().signal,
        onMoved: () => calls.push('moved'),
        sleep: async (ms) => {
            calls.push(`sleep ${ms}`);
        },
    });

    return { bodies, calls, refused };
};

test('two pages owing one new question begin one turn', async (t) => {
    // Page A's request follows turn 3 and is admitted.
    const a = await sendRun(t, ['admitted']);

    assert.deepEqual(a.calls, ['post']);
    assert.equal(a.bodies[0]?.['after_turn'], 3);

    // Page B meets A's stream, waits, and the retry finds A's turn begun:
    // it is not sent again, and no refusal reaches the stream's handlers,
    // so the meter's give-back does not mark it.
    const b = await sendRun(t, [BUSY, MOVED]);

    assert.deepEqual(b.calls, ['post', 'sleep 1000', 'post', 'moved']);
    assert.deepEqual(
        b.bodies.map((body) => body['after_turn']),
        [3, 3],
    );
    assert.deepEqual(b.refused, []);

    // Any other refusal goes to the stream as before.
    const c = await sendRun(t, [{ status: 429, detail: 'limit', error: null }]);

    assert.deepEqual(c.calls, ['post']);
    assert.equal(c.refused[0]?.status, 429);
});

// A transcript holding harness turns `turns`, each a keyed prompt and reply.
const keyed = (turns: number[]): ChatMessage[] =>
    turns.flatMap((index): ChatMessage[] => [
        { role: 'user', text: `question ${index}`, harnessTurn: index },
        { role: 'bot', text: `reply ${index}` },
    ]);

test("a fork's first turn is keyed from 1, whatever the source's prompts held", () => {
    // Saved before the stream named the fork's first turn, which the
    // harness recorded after the recap of the copied transcript.
    const copied = withInherited(keyed([1, 2, 3, 4, 5]));
    const fork: ChatMessage[] = [
        ...copied,
        { role: 'user', text: 'my question', turn: 6 },
        { role: 'bot', text: '' },
    ];

    assert.equal(heldTurns(fork), 0);
    assert.equal(readSince(fork), 0);

    const first = {
        turn_index: 1,
        user_message: `${forkRecap(copied)}my question`,
        reply: 'the answer',
        component_ids: [],
    };
    const confirmed = withReadPrompts(fork, [first]);

    assert.equal(heldTurns(confirmed), 1);

    const { messages } = mergeClosedTurns(confirmed, [first], 7);

    assert.deepEqual(messages.at(-1), { role: 'bot', text: 'the answer' });
});

test("a prompt the harness never confirmed holds no turn another tab's reply can fill", () => {
    // The page sent `mine` and was closed before its stream named the turn.
    // Another tab's turn 2 then closed.
    const page: ChatMessage[] = [
        ...keyed([1]),
        { role: 'user', text: 'mine', turn: 2 },
        { role: 'bot', text: '' },
    ];
    const theirs = { ...closed(2, 'their answer'), user_message: 'theirs' };

    assert.equal(readSince(page), 0);

    // The read's latest turn is theirs, so `mine` shows as unsent.
    const read = withReadPrompts(page, [theirs]);
    const { messages, appended } = mergeClosedTurns(read, [closed(1), theirs], 3);

    assert.deepEqual(messages.slice(2), [
        { role: 'user', text: 'mine', turn: 2, unkeyed: true },
        { role: 'bot', text: UNSENT_NOTE },
        { role: 'user', text: 'theirs', harnessTurn: 2, turn: 3 },
        { role: 'bot', text: 'their answer' },
    ]);
    assert.deepEqual(
        appended.map((turn) => turn.turn_index),
        [2],
    );
    // Without the read, the merge still leaves `mine` alone.
    assert.deepEqual(mergeClosedTurns(page, [theirs], 3).messages.slice(2, 4), page.slice(2));
});

test("the page's last prompt takes the first later turn the harness recorded it on", async (t) => {
    const page: ChatMessage[] = [
        ...keyed([1]),
        { role: 'user', text: 'ODA to Ghana', turn: 2 },
        { role: 'bot', text: '' },
    ];

    await t.test('the next turn with its text confirms it, with or without a later turn', () => {
        const next = { turn_index: 2, user_message: 'ODA to Ghana' };

        for (const turns of [[next], [next, { turn_index: 3, user_message: 'question 3' }]]) {
            const read = withReadPrompts(page, turns);

            assert.deepEqual(
                [...promptTurns(read)],
                [
                    [0, 1],
                    [2, 2],
                ],
            );
            // The closed turn it holds is not appended again.
            assert.deepEqual(mergeClosedTurns(read, [{ ...closed(2), ...next }], 3).appended, []);
        }
    });

    await t.test("a later turn with its text confirms it, past another tab's turn", () => {
        for (const turns of [
            [{ turn_index: 3, user_message: 'ODA to Ghana' }],
            [
                { turn_index: 2, user_message: 'question 2' },
                { turn_index: 3, user_message: 'ODA to Ghana' },
            ],
        ]) {
            assert.deepEqual(
                [...promptTurns(withReadPrompts(page, turns))],
                [
                    [0, 1],
                    [2, 3],
                ],
            );
        }
    });

    await t.test('another text, or no later turn, leaves it unsent', () => {
        for (const turns of [
            [{ turn_index: 2, user_message: 'ODA to Kenya' }],
            [{ turn_index: 1, user_message: 'question 1' }],
            [],
        ]) {
            const read = withReadPrompts(page, turns);

            assert.deepEqual([...promptTurns(read)], [[0, 1]]);
            assert.deepEqual(read.slice(2), [
                { role: 'user', text: 'ODA to Ghana', turn: 2, unkeyed: true },
                { role: 'bot', text: UNSENT_NOTE },
            ]);
        }
    });

    await t.test('an earlier prompt with no turn is unsent even when the last one matches', () => {
        const earlier: ChatMessage[] = [
            { role: 'user', text: 'lost', turn: 1 },
            { role: 'bot', text: 'partial' },
            { role: 'user', text: 'ODA to Ghana', turn: 2 },
            { role: 'bot', text: '' },
        ];
        const read = withReadPrompts(earlier, [{ turn_index: 1, user_message: 'ODA to Ghana' }]);

        assert.deepEqual(read, [
            { role: 'user', text: 'lost', turn: 1, unkeyed: true },
            { role: 'bot', text: 'partial' },
            { role: 'user', text: 'ODA to Ghana', turn: 2, harnessTurn: 1 },
            { role: 'bot', text: '' },
        ]);
    });

    await t.test('a transcript whose prompts all hold their turns is unchanged', () => {
        const held = keyed([1, 2]);

        assert.equal(withReadPrompts(held, [{ turn_index: 3, user_message: 'question 3' }]), held);
    });
});

test("an owed new question closes its own turn's reply, past a later unsent prompt", () => {
    // Turn 1's plan took the typed text as a new question; the page then
    // sent `later`, which the harness never admitted.
    const page: ChatMessage[] = [
        { role: 'user', text: 'question 1', turn: 1, harnessTurn: 1 },
        { role: 'user', text: 'Since 2018.', answer: true },
        { role: 'bot', text: '' },
        { role: 'user', text: 'later', turn: 2, unkeyed: true },
        { role: 'bot', text: UNSENT_NOTE },
    ];

    assert.deepEqual(withOwedQuestion(page, 1, 'Since 2018.', true), [
        page[0],
        { role: 'bot', text: NEW_QUESTION_NOTE },
        ...page.slice(3),
    ]);
    // A turn the page did not hold keeps its reply as the read wrote it.
    assert.equal(withOwedQuestion(page, 1, 'Since 2018.', false), page);
});

test("a paused turn the page's later unsent prompt does not hold joins the transcript last", () => {
    // The page held turn 1, then sent `later`, which the harness never
    // admitted; the harness's turn 2, another tab's, is paused.
    const page: ChatMessage[] = [
        ...keyed([1]),
        { role: 'user', text: 'later', turn: 2 },
        { role: 'bot', text: '' },
    ];
    const read = readOf({
        turn: turnState({ index: 2, status: 'paused', user_message: 'question 2' }),
        pause: { interrupt_id: 'int-7', kind: 'plan', frames: [PLAN] },
        closed_since: [closed(1)],
    });
    const confirmed = withReadPrompts(page, [
        {
            turn_index: 2,
            user_message: read.turn!.user_message!,
        },
    ]);
    const step = attachStep(read);

    assert.equal(step.kind, 'pause');
    // The paused turn is one the page does not hold, so it gets its own
    // prompt, and its reply, the one the pause's stream writes, is last.
    assert.equal(heldTurns(confirmed), 1);

    const messages = ensureTurn(confirmed, 2, 'question 2', 3);

    assert.equal(turnReplyAt(messages, 2), messages.length - 1);
    assert.deepEqual(messages.slice(2, 4), [
        { role: 'user', text: 'later', turn: 2, unkeyed: true },
        { role: 'bot', text: UNSENT_NOTE },
    ]);
});

test('a held open turn with an unsent prompt after it streams into its own reply', () => {
    // The page holds turn 1 (page turn 1), left running, then sent `later`
    // (page turn 2), which the harness never admitted.
    const page: ChatMessage[] = [
        { role: 'user', text: 'question 1', turn: 1, harnessTurn: 1 },
        { role: 'bot', text: '' },
        { role: 'user', text: 'later', turn: 2 },
        { role: 'bot', text: '' },
    ];
    const read = readOf({ turn: turnState({ index: 1, user_message: 'question 1' }) });
    const step = attachStep(read);

    assert.deepEqual(step, { kind: 'resume', turnIndex: 1 });
    assert.equal(heldTurns(page), 1);

    // The carried-on stream is page turn 1's: its deltas, its approved
    // plan, an answer to its pause and a new question it hands on all land
    // on turn 1's reply, and `later`'s reply stays as it was.
    const at = (messages: ChatMessage[]) => pageTurnReplyAt(messages, 1);
    const streamed = withReplyAt(page, at(page), (reply) => ({
        ...reply,
        text: reply.text + 'The answer.',
    }));

    assert.deepEqual(streamed[1], { role: 'bot', text: 'The answer.' });
    assert.deepEqual(streamed.slice(2), page.slice(2));

    const plan = approvedFromFrame(approvedOf('rev-a'));

    assert.deepEqual(withApprovedPlan(page, plan, at(page))[1], { role: 'bot', text: '', plan });

    const answered = withAnswer(page, 'Since 2018.', at(page));

    assert.deepEqual(answered.slice(1, 3), [
        { role: 'user', text: 'Since 2018.', answer: true },
        { role: 'bot', text: '' },
    ]);
    assert.deepEqual(withNewQuestion(answered, 'Since 2018.', at(answered)), [
        page[0],
        { role: 'bot', text: NEW_QUESTION_NOTE },
        ...page.slice(2),
    ]);

    // A transcript without page turn stamps writes into the last reply.
    const unstamped: ChatMessage[] = [
        { role: 'user', text: 'question 1' },
        { role: 'bot', text: '' },
    ];

    assert.equal(pageTurnReplyAt(unstamped, 1), 1);
});

// An unkeyed transcript of prompt/reply pairs.
const unkeyedPairs = (pairs: [string, string][]): ChatMessage[] =>
    pairs.flatMap(([text, reply]): ChatMessage[] => [
        { role: 'user', text },
        { role: 'bot', text: reply },
    ]);

const recorded = (turnIndex: number, userMessage: string, reply = ''): ClosedTurn => ({
    turn_index: turnIndex,
    user_message: userMessage,
    reply,
    component_ids: [],
});

test("an unkeyed save's unsent prompt takes no earlier turn's reply", () => {
    // Turns 1 and 2 were admitted; the third prompt never reached the harness.
    const save = unkeyedPairs([
        ['ODA to Kenya', 'Kenya answer'],
        ['and Ghana', ''],
        ['and Rwanda', ''],
    ]);
    const turns = [
        recorded(1, 'ODA to Kenya', 'Kenya answer'),
        recorded(2, 'and Ghana', 'Ghana answer'),
    ];
    const keyed = keyUnkeyedSave(save, turns);

    assert.deepEqual(
        [...promptTurns(keyed)],
        [
            [0, 1],
            [2, 2],
        ],
    );
    assert.equal(keyed[4]!.role === 'user' && keyed[4]!.unkeyed, true);
    assert.ok(keyed.every((message) => !message.inherited));

    const { messages } = mergeClosedTurns(keyed, turns, 4);

    assert.deepEqual(
        messages.map((message) => message.text),
        ['ODA to Kenya', 'Kenya answer', 'and Ghana', 'Ghana answer', 'and Rwanda', ''],
    );
});

test("an old fork's copied history stays inherited when the save lacks a turn", () => {
    // Forked from x and y, the fork sent z as its first turn with the recap
    // of the copied transcript. Another tab then ran turn 2, which the save
    // lacks.
    const copied = unkeyedPairs([
        ['ODA to Kenya', 'Kenya answer'],
        ['and Ghana', 'Ghana answer'],
    ]);
    const save = [...copied, ...unkeyedPairs([['and Rwanda', 'Rwanda answer']])];
    const turns = [
        recorded(1, `${forkRecap(copied)}and Rwanda`, 'Rwanda answer'),
        recorded(2, 'and Uganda', 'Uganda answer'),
    ];
    const keyed = keyUnkeyedSave(save, turns);

    assert.deepEqual(
        keyed.map((message) => !!message.inherited),
        [true, true, true, true, false, false],
    );
    assert.deepEqual([...promptTurns(keyed)], [[4, 1]]);
    assert.equal(readSince(keyed), 0);

    const { messages, appended } = mergeClosedTurns(keyed, turns, 4);

    assert.deepEqual(
        appended.map((turn) => turn.turn_index),
        [2],
    );
    assert.deepEqual(
        messages.slice(4).map((message) => message.text),
        ['and Rwanda', 'Rwanda answer', 'and Uganda', 'Uganda answer'],
    );

    // The copied history asked the fork's first question too: the recap of
    // the messages before each prompt tells them apart.
    const repeated = unkeyedPairs([
        ['and Rwanda', 'old Rwanda answer'],
        ['and Ghana', 'Ghana answer'],
    ]);
    const again = keyUnkeyedSave(
        [...repeated, ...unkeyedPairs([['and Rwanda', 'Rwanda answer']])],
        [recorded(1, `${forkRecap(repeated)}and Rwanda`)],
    );

    assert.deepEqual([...promptTurns(again)], [[4, 1]]);
});

test('an unkeyed save keys repeated prompts only where their order settles them', () => {
    const save = unkeyedPairs([
        ['ODA to Kenya', 'a'],
        ['yes', 'b'],
        ['yes', 'c'],
        ['ODA to Ghana', 'd'],
        ['yes', 'e'],
    ]);
    // Turn 4's answer added a `(then: …)` line, and the session lacks the
    // last `yes`, which has no turn of its own to be told from turn 2 or 3.
    const turns = [
        recorded(1, 'ODA to Kenya'),
        recorded(2, 'yes'),
        recorded(3, 'yes'),
        recorded(4, 'ODA to Ghana\n(then: by sector)'),
    ];
    const keyed = keyUnkeyedSave(save, turns);

    assert.deepEqual(
        [...promptTurns(keyed)],
        [
            [0, 1],
            [2, 2],
            [4, 3],
            [6, 4],
        ],
    );
    assert.equal(keyed[8]!.role === 'user' && keyed[8]!.unkeyed, true);

    // Where a run of repeats differs in length from the turns, none is keyed.
    const fewer = keyUnkeyedSave(save, [
        recorded(1, 'ODA to Kenya'),
        recorded(2, 'yes'),
        recorded(3, 'ODA to Ghana'),
    ]);

    assert.deepEqual(
        [...promptTurns(fewer)],
        [
            [0, 1],
            [6, 3],
        ],
    );
    // A keyed or a marked transcript is no unkeyed save.
    assert.equal(keyUnkeyedSave(keyed, turns), keyed);
});

test('an unkeyed save that gained a keyed turn keys the prompts before it', () => {
    // The first read of an old save failed, then the page ran turn 3, which
    // its stream keyed. The prompt after it was saved before its turn came.
    const save: ChatMessage[] = [
        ...unkeyedPairs([
            ['ODA to Kenya', 'Kenya answer'],
            ['and Ghana', 'Ghana answer'],
        ]),
        { role: 'user', text: 'and Rwanda', harnessTurn: 3, turn: 3 },
        { role: 'bot', text: 'Rwanda answer' },
        { role: 'user', text: 'and Uganda', turn: 4 },
        { role: 'bot', text: '' },
    ];
    const turns = [
        recorded(1, 'ODA to Kenya', 'Kenya answer'),
        recorded(2, 'and Ghana', 'Ghana answer'),
        recorded(3, 'and Rwanda', 'Rwanda answer'),
    ];

    assert.equal(isUnkeyedSave(save), true);

    const keyed = keyUnkeyedSave(save, turns);

    assert.deepEqual(
        [...promptTurns(keyed)],
        [
            [0, 1],
            [2, 2],
            [4, 3],
        ],
    );
    // The prompt after the keyed turn is left for withReadPrompts.
    assert.deepEqual(keyed[6], save[6]);
    assert.deepEqual(mergeClosedTurns(keyed, turns, 5).appended, []);
    assert.equal(isUnkeyedSave(keyed), false);
});

test("a fork owes its own turn's new question despite the source's", () => {
    const fork: ChatMessage[] = [
        ...withInherited([
            ...keyed([1, 2]),
            { role: 'user', text: 'ODA to Ghana', harnessTurn: 3, fromNewQuestion: 2 },
        ]),
        ...keyed([1, 2]),
    ];
    const asked = { ...closed(2, ''), new_question: 'ODA to Kenya' };
    const read = readOf({ turn: turnState({ index: 2, status: 'done' }), closed_since: [asked] });

    assert.deepEqual(owedNewQuestion(read, fork), {
        turnIndex: 2,
        text: 'ODA to Kenya',
        tried: false,
    });
});

test('a turn another tab ran fills its gap in order', () => {
    const held = keyed([1, 2, 3, 5]);

    // The read starts from the turn the transcript lacks.
    assert.equal(readSince(held), 3);

    const { messages, appended } = mergeClosedTurns(held, [closed(4), closed(5)], 5);

    assert.deepEqual(messages, [
        ...keyed([1, 2, 3]),
        { role: 'user', text: 'question 4', harnessTurn: 4, turn: 5 },
        { role: 'bot', text: 'reply 4' },
        ...keyed([5]),
    ]);
    assert.deepEqual(
        appended.map((turn) => turn.turn_index),
        [4],
    );
});

test("an unkeyed save's chip prompts pair with the turns the harness recorded for them", () => {
    // The harness records a chip's turn as `count {label}`. A page shows the
    // chip's prompt as its bare label, or as its action.
    const save = unkeyedPairs([
        ['ODA to Kenya', 'a'],
        ['Grant equivalent', 'b'],
        ['Count as gross disbursements', 'c'],
        ['Switch to bilateral', 'd'],
    ]);
    const turns = [
        recorded(1, 'ODA to Kenya'),
        recorded(2, 'count Grant equivalent'),
        recorded(3, 'count gross disbursements'),
        recorded(4, 'count bilateral\n(then: approve)'),
    ];
    const keyed = keyUnkeyedSave(save, turns);

    assert.deepEqual(
        [...promptTurns(keyed)],
        [
            [0, 1],
            [2, 2],
            [4, 3],
            [6, 4],
        ],
    );
    assert.deepEqual(mergeClosedTurns(keyed, turns, 5).appended, []);
});

const RECORDED_READ = bodyOf('component_read.at_revision');
const CARD = RECORDED_READ['component_id'] as string;

const manifestOf = (blocks: [string, number][], revision = 4): CompositionManifest => ({
    composition_id: 'cps_1',
    revision,
    actor: 'model',
    blocks: blocks.map(([id, cardRevision]) => ({
        component_id: id,
        revision: cardRevision,
        type: 'line_chart',
        title: id,
    })),
    counts: { all: blocks.length, stats: 0, charts: blocks.length, tables: 0, notes: 0 },
});

test("a state read draws the card another tab made, and a held card's newer revision", async (t) => {
    t.mock.method(globalThis, 'fetch', async (url: string) => {
        const revision = Number(new URL(url, 'https://site.example').searchParams.get('revision'));

        return Response.json({ ...bodyOf('component_read.at_revision'), revision });
    });

    // The page holds cmp_held at revision 1 and never saw CARD.
    const held = { kind: 'text' as const, id: 'cmp_held', title: 'Held', body: '', turn: 1 };
    const manifest = manifestOf([
        ['cmp_held', 1],
        [CARD, 1],
    ]);
    const toRead = cardsToRead(manifest, new Map([['cmp_held', 1]]), new Set(['cmp_held']));

    assert.deepEqual(
        toRead.map((block) => block.component_id),
        [CARD],
    );

    const read = await readComponent(CARD, 1);

    assert.ok(read);

    const drawn = widgetFromRead(toRead[0]!, read);

    assert.equal(drawn?.kind, 'chart');
    assert.equal(drawn?.id, CARD);
    assert.deepEqual(
        canvasWidgetsOf({
            widgets: [held, { ...drawn!, turn: 2 }],
            pinnedIds: [],
            removedIds: [],
            canvas: takeManifest(null, manifest)?.baseline,
        }).map((widget) => widget.id),
        ['cmp_held', CARD],
    );

    // Later the manifest names CARD at revision 2; the page holds 1.
    const newer = cardsToRead(manifestOf([[CARD, 2]], 5), new Map([[CARD, 1]]), new Set([CARD]));

    assert.deepEqual(
        newer.map((block) => block.revision),
        [2],
    );

    const revised = widgetFromRead(newer[0]!, (await readComponent(CARD, 2))!, drawn!);

    assert.equal(revised?.kind === 'chart' && revised.ref?.revision, 2);

    // A card held at the manifest's revision, or a newer one, is not read.
    assert.deepEqual(
        cardsToRead(manifestOf([[CARD, 2]]), new Map([[CARD, 2]]), new Set([CARD])),
        [],
    );
});

// A plan.approved frame of revision `revision`, titled after it.
const approvedOf = (revision: string): PlanApproved => ({
    event: 'plan.approved',
    seq: 1,
    plan_version_id: `pv-${revision}`,
    version: 1,
    revision,
    title: `plan ${revision}`,
    steps: [],
    choices: [],
});

test("a resume's repeated approvals leave the plan the page holds", () => {
    // The page holds turn 2's reply with plan B. The state read before the
    // resume names the turn's approvals, A then B, and the resume opens with
    // their frames.
    const messages: ChatMessage[] = [
        ...keyed([1]),
        { role: 'user', text: 'question 2', harnessTurn: 2 },
        { role: 'bot', text: '', plan: approvedFromFrame(approvedOf('rev-b')) },
    ];
    const held = approvalKeys(messages);
    let shown = withTurnApprovals(messages, 2, [approvedOf('rev-a'), approvedOf('rev-b')], held);

    assert.equal(shown, messages);

    for (const frame of [approvedOf('rev-a'), approvedOf('rev-b')]) {
        const plan = takeApproval(frame, 2, held);

        if (plan) {
            shown = withApprovedPlan(shown, plan);
        }
    }

    assert.equal(shown, messages);

    // A plan the page has not seen is taken once, and its repeat ignored.
    const later = approvedOf('rev-c');

    assert.equal(takeApproval(later, 2, held)?.revision, 'rev-c');
    assert.equal(takeApproval(later, 2, held), null);

    // A later turn that approves a plan of the same content, and so the same
    // revision, takes it.
    assert.equal(takeApproval(approvedOf('rev-b'), 3, held)?.revision, 'rev-b');
});

test('a state read restores the approved plan of a turn whose stream the page lost', () => {
    const messages: ChatMessage[] = [
        ...keyed([1]),
        { role: 'user', text: 'question 2', harnessTurn: 2 },
        { role: 'bot', text: '' },
    ];
    const held = approvalKeys(messages);
    const restored = withTurnApprovals(
        messages,
        2,
        [approvedOf('rev-a'), approvedOf('rev-b')],
        held,
    );
    const reply = restored.at(-1);

    assert.ok(reply?.role === 'bot');
    assert.equal(reply.plan?.revision, 'rev-b');
    assert.deepEqual([...held], ['2:rev-a', '2:rev-b']);

    // Turn 3 approving the same plan content gets its own approved plan.
    const again = withTurnApprovals(
        [
            ...restored,
            { role: 'user', text: 'question 3', harnessTurn: 3 },
            { role: 'bot', text: '' },
        ],
        3,
        [approvedOf('rev-b')],
        held,
    );
    const third = again.at(-1);

    assert.ok(third?.role === 'bot');
    assert.equal(third.plan?.revision, 'rev-b');

    // Read again, or after the stream's own frame, nothing changes; nor for
    // a turn the page does not hold.
    assert.equal(withTurnApprovals(restored, 2, [approvedOf('rev-b')], held), restored);
    assert.equal(withTurnApprovals(messages, 5, [approvedOf('rev-z')], new Set()), messages);
});

// Prompt/reply pairs keyed on harness turns, each stamped with a page turn.
const stamped = (pairs: [number, number][]): ChatMessage[] =>
    pairs.flatMap(([index, turn]): ChatMessage[] => [
        { role: 'user', text: `question ${index}`, harnessTurn: index, turn },
        { role: 'bot', text: `reply ${index}` },
    ]);

test("a card a read's closed turn made is filed under that turn's page turn, held or appended", () => {
    // The page holds turns 1 and 2, the read appends turn 3; turn 2's card
    // landed after the page left, and turn 3's arrived with it.
    const { messages } = mergeClosedTurns(
        stamped([
            [1, 1],
            [2, 2],
        ]),
        [closed(3)],
        3,
    );
    const turns = cardTurns(messages, [
        { ...closed(2), component_ids: ['cmp_late'] },
        { ...closed(3), component_ids: ['cmp_new'] },
    ]);

    assert.deepEqual(
        [...turns],
        [
            ['cmp_late', 2],
            ['cmp_new', 3],
        ],
    );

    // Page turns run past the harness's when the page ran turns that opened
    // none (a refused prompt): each card takes its prompt's stamp.
    const refused: ChatMessage[] = [
        { role: 'user', text: 'refused', refunded: true, turn: 1 },
        { role: 'bot', text: '_No._' },
        ...stamped([
            [1, 2],
            [2, 3],
        ]),
    ];

    assert.deepEqual(
        [...cardTurns(refused, [{ ...closed(2), component_ids: ['cmp_x'] }])],
        [['cmp_x', 3]],
    );
});

test("a turn a read inserts in a gap leaves every later turn's cards where they were", () => {
    // The page ran harness turns 1, 2 and 4 as page turns 1 to 3; another
    // tab ran turn 3, which the read inserts before turn 4.
    const page = stamped([
        [1, 1],
        [2, 2],
        [4, 3],
    ]);
    const { messages } = mergeClosedTurns(page, [closed(3), closed(4)], 4);

    assert.deepEqual(
        [
            ...cardTurns(messages, [
                { ...closed(3), component_ids: ['cmp_other_tab'] },
                { ...closed(4), component_ids: ['cmp_mine'] },
            ]),
        ],
        [
            ['cmp_other_tab', 4],
            ['cmp_mine', 3],
        ],
    );
});

test('a card a state read draws during a failed legacy reconcile joins the legacy canvas', async () => {
    // The legacy canvas shows cmp_1; removing the hidden cmp_old fails.
    const legacy = createLegacyCanvas({
        ids: ['cmp_1'],
        hidden: new Map([['cmp_old', 1]]),
        pinned: [],
        produced: Promise.resolve(new Set<string>()),
        mutate: async () => null,
        onTake: () => assert.fail('the reconcile failed'),
        onLocal: () => {},
        onChange: () => {},
    });
    const manifest = manifestOf([
        ['cmp_old', 1],
        ['cmp_1', 1],
        [CARD, 1],
    ]);

    await legacy.offer(manifest);

    const drawn: string[] = [];

    await drawManifestCards({
        manifest,
        held: new Map([['cmp_1', 1]]),
        seen: new Set(['cmp_1', 'cmp_old']),
        inFlight: new Set(),
        isCurrent: () => true,
        keep: legacy.keep,
        onDrawn: (block) => drawn.push(block.component_id),
        read: async (id, revision) => ({
            component_id: id,
            revision,
            catalog_version: '',
            payload: {},
            fact_summary: { series: [], series_cut: 0, window: null, unit: null },
        }),
    });

    assert.deepEqual(drawn, [CARD]);
    // Saved now, the legacy canvas shows the card, so the next open does not
    // take it for one the save hid.
    assert.deepEqual(legacy.ids(), ['cmp_1', CARD]);
});

test("a refused new question is offered on the last reply, which the turn's reply then is", () => {
    // Turn 3 handed back the question; the page's send was refused 429.
    const refused: ChatMessage[] = [
        { role: 'user', text: 'question 3', harnessTurn: 3, turn: 3 },
        { role: 'bot', text: NEW_QUESTION_NOTE },
        { role: 'user', text: 'ODA to Ghana', refunded: true, fromNewQuestion: 3, turn: 4 },
        { role: 'bot', text: '_You have used your prompts for today._' },
    ];
    const offered = withOfferedQuestion(refused, 3, 'ODA to Ghana');

    // Page turn 4 leaves with its prompt, and its Activity entry with it.
    assert.deepEqual(offeredQuestionPageTurns(refused, 3), [4]);
    assert.deepEqual(offeredQuestionPageTurns(offered, 3), []);

    assert.deepEqual(offered, [
        refused[0],
        {
            role: 'bot',
            text: NEW_QUESTION_NOTE,
            followups: ['ODA to Ghana'],
            newQuestion: 'ODA to Ghana',
        },
    ]);

    // A click on the offer sends it as the turn that follows turn 3.
    assert.equal(offeredQuestionTurn(offered, 'ODA to Ghana'), 3);
    assert.equal(offeredQuestionTurn(offered, 'something else'), undefined);
    assert.equal(offeredQuestionTurn(refused, 'ODA to Ghana'), undefined);

    // The offer holds on reopen, whatever whitespace the harness kept.
    const read = readOf({
        turn: turnState({ index: 3, status: 'done' }),
        closed_since: [{ ...closed(3, ''), new_question: '  ODA to Ghana\n' }],
    });

    assert.equal(owedNewQuestion(read, offered), null);
});

test('a card a missed turn revised is kept on a legacy canvas the save hid it from', async () => {
    const legacy = createLegacyCanvas({
        ids: ['cmp_1'],
        hidden: new Map([
            ['cmp_hidden', 1],
            ['cmp_old', 1],
        ]),
        pinned: [],
        produced: Promise.resolve(new Set<string>()),
        mutate: async () => null,
        onTake: () => assert.fail('the reconcile failed'),
        onLocal: () => {},
        onChange: () => {},
    });
    // A turn after the save revised cmp_hidden, so the reconcile leaves it;
    // the remove of cmp_old fails.
    const manifest = manifestOf([
        ['cmp_old', 1],
        ['cmp_1', 1],
        ['cmp_hidden', 2],
    ]);

    await legacy.offer(manifest);
    await drawManifestCards({
        manifest,
        held: new Map([
            ['cmp_old', 1],
            ['cmp_1', 1],
            ['cmp_hidden', 1],
        ]),
        seen: new Set(['cmp_1', 'cmp_hidden', 'cmp_old']),
        inFlight: new Set(),
        isCurrent: () => true,
        keep: legacy.keep,
        onDrawn: () => {},
        read: async (id, revision) => ({
            component_id: id,
            revision,
            catalog_version: '',
            payload: {},
            fact_summary: { series: [], series_cut: 0, window: null, unit: null },
        }),
    });

    assert.deepEqual(legacy.ids(), ['cmp_1', 'cmp_hidden']);
});
