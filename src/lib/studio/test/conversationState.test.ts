/**
 * A reopened conversation against the harness's state read: closed turns
 * merge in once, a pause comes back as its card, and a running turn nobody
 * holds is resumed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';

import {
    attachStep,
    carryOnTurn,
    mergeClosedTurns,
    owedNewQuestion,
    readConversation,
    type AttachStep,
} from '../conversationState.ts';
import { planFromFrame } from '../plan.ts';
import {
    ensureTurn,
    heldTurns,
    NEW_QUESTION_NOTE,
    readSince,
    withHarnessTurn,
    withInherited,
    withInheritedBefore,
} from '../transcript.ts';
import type { StreamHandlers, StreamRefusal } from '../studioClient.ts';
import type {
    ClosedTurn,
    ConversationRead,
    PlanProposed,
    StudioFrame,
    TurnState,
} from '../wire.ts';

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

    const first = mergeClosedTurns(held, [closed(1, 'harness text'), closed(2)]);

    assert.deepEqual(first.messages, [
        ...held,
        { role: 'user', text: 'question 2', harnessTurn: 2 },
        { role: 'bot', text: 'reply 2' },
    ]);
    assert.deepEqual(
        first.appended.map((turn) => turn.turn_index),
        [2],
    );

    // A second read of the same turns, from the merged transcript, adds nothing.
    const again = mergeClosedTurns(first.messages, [closed(1), closed(2)]);

    assert.equal(again.messages, first.messages);
    assert.deepEqual(again.appended, []);
});

test("mergeClosedTurns fills a held turn's reply only when it is empty", () => {
    const left: ChatMessage[] = [
        { role: 'user', text: 'question 1' },
        { role: 'bot', text: '' },
    ];

    assert.deepEqual(mergeClosedTurns(left, [closed(1)]).messages, [
        left[0],
        { role: 'bot', text: 'reply 1' },
    ]);

    const answered: ChatMessage[] = [left[0]!, { role: 'bot', text: 'the page kept this' }];

    assert.equal(mergeClosedTurns(answered, [closed(1)]).messages, answered);
});

test('a turn set aside for a new question shows a note, not an empty reply', () => {
    const { messages } = mergeClosedTurns([], [{ ...closed(1, ''), new_question: 'ODA to Ghana' }]);

    assert.deepEqual(messages.at(-1), { role: 'bot', text: NEW_QUESTION_NOTE });
});

test('heldTurns counts on from the last prompt that names its harness turn', () => {
    const messages: ChatMessage[] = [
        { role: 'user', text: 'a' },
        { role: 'bot', text: 'b' },
        { role: 'user', text: 'refused', refunded: true },
        { role: 'bot', text: '' },
        { role: 'user', text: 'an answer', answer: true },
        { role: 'user', text: 'c' },
    ];

    // A save from before prompts named their turn counts accepted prompts.
    assert.equal(heldTurns(messages), 2);
    // A named turn anchors the count, and a prompt saved before its stream
    // named one counts on from it.
    const keyed = withHarnessTurn(messages, 7);

    assert.equal(heldTurns(keyed), 7);
    assert.equal(heldTurns([...keyed, { role: 'user', text: 'd' }]), 8);
    // The last held turn comes back in the read, for a reply it never got.
    assert.equal(readSince(messages), 1);
    assert.equal(readSince([]), 0);
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

    const { messages } = mergeClosedTurns(saved, read!.closed_since);

    assert.deepEqual(messages.slice(2), [
        ...[2, 3, 4, 5, 6].flatMap((index): ChatMessage[] => [
            { role: 'user', text: `question ${index}`, harnessTurn: index },
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

    const messages = ensureTurn(saved, step.turnIndex, read.turn!.user_message!);

    assert.deepEqual(messages.slice(2), [
        { role: 'user', text: 'question 2', harnessTurn: 2 },
        { role: 'bot', text: '' },
    ]);
    // The stream that carries it on writes into that reply, the last message.
    assert.equal(ensureTurn(messages, 2, 'question 2'), messages);
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
// turn (frames, or a refusal), `reads` each state read.
const run = async (
    first: AttachStep,
    {
        resumes = [],
        reads = [],
    }: {
        resumes?: (StudioFrame[] | StreamRefusal)[];
        reads?: (ConversationRead | null)[];
    } = {},
) => {
    const frames: StudioFrame[] = [];
    const calls: string[] = [];
    const merged: ConversationRead[] = [];

    await carryOnTurn({
        conversationId: 'conv',
        first,
        handlers: { onFrame: (frame) => frames.push(frame) },
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

test("owedNewQuestion sends a latest turn's new question once, while no turn follows it", () => {
    const asked = { ...closed(3, 'Set aside for a new question.'), new_question: 'ODA to Ghana' };
    const read = readOf({ turn: turnState({ index: 3, status: 'done' }), closed_since: [asked] });
    const upTo = (turns: number): ChatMessage[] =>
        Array.from({ length: turns }, (_, at): ChatMessage => ({
            role: 'user',
            text: `question ${at + 1}`,
            harnessTurn: at + 1,
        }));

    assert.deepEqual(owedNewQuestion(read, upTo(2)), { turnIndex: 3, text: 'ODA to Ghana' });
    assert.deepEqual(owedNewQuestion(read, upTo(3)), { turnIndex: 3, text: 'ODA to Ghana' });
    // The page holds a later turn, or the harness opened one.
    assert.equal(owedNewQuestion(read, upTo(4)), null);
    assert.equal(
        owedNewQuestion({ ...read, turn: turnState({ index: 4, status: 'running' }) }, upTo(3)),
        null,
    );
    assert.equal(owedNewQuestion({ ...read, closed_since: [closed(3)] }, upTo(3)), null);
    // A send of it the harness refused keeps its prompt, so it is not sent again.
    assert.equal(
        owedNewQuestion(read, [
            ...upTo(3),
            { role: 'user', text: 'ODA to Ghana', refunded: true, fromNewQuestion: 3 },
        ]),
        null,
    );
});

// A transcript holding harness turns `turns`, each a keyed prompt and reply.
const keyed = (turns: number[]): ChatMessage[] =>
    turns.flatMap((index): ChatMessage[] => [
        { role: 'user', text: `question ${index}`, harnessTurn: index },
        { role: 'bot', text: `reply ${index}` },
    ]);

test("a fork's first turn is keyed from 1, whatever the source's prompts held", () => {
    // Saved before the stream named the fork's first turn.
    const fork: ChatMessage[] = [
        ...withInherited(keyed([1, 2, 3, 4, 5])),
        { role: 'user', text: 'my question' },
        { role: 'bot', text: '' },
    ];

    assert.equal(heldTurns(fork), 1);
    assert.equal(readSince(fork), 0);

    const { messages } = mergeClosedTurns(fork, [closed(1, 'the answer')]);

    assert.deepEqual(messages.at(-1), { role: 'bot', text: 'the answer' });

    // A fork that went on before prompts carried their turn: seven prompts,
    // of which the session's two turns are the last two.
    const unkeyed = Array.from({ length: 7 }, (_, at): ChatMessage[] => [
        { role: 'user', text: `question ${at + 1}` },
        { role: 'bot', text: `reply ${at + 1}` },
    ]).flat();
    const marked = withInheritedBefore(unkeyed, 2);

    assert.equal(heldTurns(marked), 2);
    assert.equal(marked.filter((message) => message.inherited).length, 10);
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

    assert.deepEqual(owedNewQuestion(read, fork), { turnIndex: 2, text: 'ODA to Kenya' });
});

test('a turn another tab ran fills its gap in order', () => {
    const held = keyed([1, 2, 3, 5]);

    // The read starts from the turn the transcript lacks.
    assert.equal(readSince(held), 3);

    const { messages, appended } = mergeClosedTurns(held, [closed(4), closed(5)]);

    assert.deepEqual(messages, keyed([1, 2, 3, 4, 5]));
    assert.deepEqual(
        appended.map((turn) => turn.turn_index),
        [4],
    );
});
