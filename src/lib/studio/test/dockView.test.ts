/**
 * `dockView.ts`: the Prompt dock's context row, sheet, pills, cap and quiet
 * send, from the chat state and the reader's sheet choice.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessage } from '../../../components/organisms/Studio/hooks/useChat.ts';
import type { ActivityEntry } from '../activity.ts';
import {
    type DockInput,
    dockField,
    dockView,
    firstSentence,
    pendingItem,
    planKey,
    planStep,
    runningLabel,
    streamBlocks,
} from '../dockView.ts';
import type { ApprovedPlan } from '../plan.ts';

const ask = (text: string, turn: number, extra: object = {}): ChatMessage => ({
    role: 'user',
    text,
    turn,
    ...extra,
});
const reply = (text: string, extra: object = {}): ChatMessage => ({ role: 'bot', text, ...extra });

const input = (over: Partial<DockInput> = {}): DockInput => ({
    messages: [],
    activity: [],
    widgets: [],
    canvasCards: 0,
    thinking: false,
    plan: null,
    clarify: false,
    walled: false,
    editTarget: null,
    draft: '',
    sheet: 'auto',
    sheetTurn: null,
    focus: false,
    setAside: null,
    planFolded: null,
    ...over,
});

// An answered first question that drew one card, with two suggestions.
const charted = input({
    messages: [
        ask('Aid to Kenya', 1),
        reply('Aid rose. It doubled.', { followups: ['And Ghana?'] }),
    ],
    widgets: [{ turn: 1 }],
    canvasCards: 1,
});

const approved = (steps: number): ApprovedPlan => ({
    plan_version_id: 'pv',
    version: 1,
    title: 'Plan',
    steps: Array.from({ length: steps }, (_, at) => ({ label: `Step ${at + 1}` })),
    choices: [],
});

test('before any question the dock shows the field alone', () => {
    const view = dockView(input());

    assert.deepEqual(
        [view.question, view.row, view.sheet, view.pills, view.cap],
        [null, null, 'none', false, 'normal'],
    );
});

test('each row of the context table, in its order of precedence', () => {
    const cases: [string, Partial<DockInput>, string | null][] = [
        ['working', { messages: [ask('Q', 1), reply('')], thinking: true }, 'status'],
        [
            'plan waits, even during a switch',
            {
                messages: [ask('Q', 1), reply('')],
                thinking: true,
                plan: { live: true, version: 1 },
            },
            'plan',
        ],
        [
            'plan set aside, nothing answered',
            { messages: [ask('Q', 1), reply('')], setAside: 1 },
            'set_aside',
        ],
        [
            'set aside on an earlier question does not hold',
            { messages: [ask('Q', 1), reply(''), ask('R', 2), reply('')], setAside: 1 },
            null,
        ],
        ['card selected', { ...charted, editTarget: { id: 'c', title: 'Aid chart' } }, 'about'],
        [
            'card selected while working: status first',
            {
                messages: [ask('Q', 1), reply('')],
                thinking: true,
                editTarget: { id: 'c', title: 'T' },
            },
            'status',
        ],
        ['answered and folded', charted, 'folded'],
    ];

    for (const [name, over, kind] of cases) {
        assert.equal(dockView(input(over)).row?.kind ?? null, kind, name);
    }
});

test('the folded row reads the reply first sentence and opens', () => {
    assert.deepEqual(dockView(charted).row, { kind: 'folded', text: 'Aid rose.', openable: true });
});

test('a reply that placed cards arrives folded, one that placed none arrives open', () => {
    const words = input({
        messages: [ask('Q1', 1), reply('Chart.'), ask('Q2', 2), reply('Only words.')],
        widgets: [{ turn: 1 }],
        canvasCards: 1,
    });

    assert.equal(dockView(charted).sheet, 'none');
    assert.equal(dockView(words).sheet, 'reply');
    assert.equal(dockView(words).held, false);
    assert.equal(dockView(words).cap, 'normal');
});

test('the reader choice wins, on the question it was made on only', () => {
    assert.equal(dockView({ ...charted, sheet: 'open', sheetTurn: 1 }).sheet, 'reply');
    assert.equal(dockView({ ...charted, sheet: 'open', sheetTurn: 0 }).sheet, 'none');
    assert.equal(dockView({ ...charted, sheet: 'thread', sheetTurn: 1 }).sheet, 'thread');
});

test('an answer in words on an empty canvas stays open with the higher cap until the reader folds it', () => {
    const words = input({
        messages: [ask('Q', 1), reply('Words only.', { followups: ['More?'] })],
    });
    const held = dockView(words);

    assert.deepEqual(
        [held.sheet, held.held, held.cap, held.pills],
        ['reply', true, 'words', false],
    );

    const folded = dockView({ ...words, sheet: 'folded', sheetTurn: 1 });

    assert.deepEqual(
        [folded.sheet, folded.row?.kind, folded.cap, folded.pills],
        ['none', 'folded', 'normal', true],
    );
    // A fold made on another question does not carry.
    assert.equal(dockView({ ...words, sheet: 'folded', sheetTurn: 7 }).sheet, 'reply');
    // Once the canvas holds a card the usual rules apply: no cards from
    // this question, so it is open, but no longer held.
    assert.deepEqual(
        [dockView({ ...words, canvasCards: 1 }).held, dockView({ ...words, canvasCards: 1 }).cap],
        [false, 'normal'],
    );
});

test('a streaming reply opens at its first words and folds when its first card lands, unless opened', () => {
    const streaming = input({ messages: [ask('Q', 1), reply('First words')], thinking: true });

    assert.equal(dockView({ ...streaming, messages: [ask('Q', 1), reply('')] }).sheet, 'none');
    assert.equal(dockView(streaming).sheet, 'reply');
    assert.equal(dockView(streaming).row?.kind, 'status');
    assert.equal(dockView(streaming).held, false);

    const landed = { ...streaming, widgets: [{ turn: 1 }], canvasCards: 1 };

    assert.equal(dockView(landed).sheet, 'none');
    assert.equal(dockView({ ...landed, sheet: 'open', sheetTurn: 1 }).sheet, 'reply');
});

test('pills show only at rest or beside the folded row, never in focus, beside a sheet or behind the wall', () => {
    const cases: [string, Partial<DockInput>, boolean][] = [
        ['folded reply', charted, true],
        ['focus mode', { ...charted, focus: true }, false],
        ['reply open', { ...charted, sheet: 'open', sheetTurn: 1 }, false],
        ['card selected', { ...charted, editTarget: { id: 'c', title: 'T' } }, false],
        ['clarifying question', { ...charted, clarify: true }, false],
        ['guest wall', { ...charted, walled: true }, false],
        ['no suggestions', { ...charted, messages: [ask('Q', 1), reply('Done.')] }, false],
        [
            'apply-choice chips count as suggestions',
            {
                ...charted,
                messages: [
                    ask('Q', 1),
                    reply('Done.', {
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
                    }),
                ],
            },
            true,
        ],
        [
            'a card-only answer at rest',
            { ...charted, messages: [ask('Q', 1), reply('', { followups: ['A'] })] },
            true,
        ],
    ];

    for (const [name, over, pills] of cases) {
        assert.equal(dockView(input(over)).pills, pills, name);
    }
});

test('a clarifying question and a waiting plan take the sheet', () => {
    assert.deepEqual(
        [
            dockView({ ...charted, clarify: true }).sheet,
            dockView({ ...charted, clarify: true }).row,
        ],
        ['clarify', null],
    );

    const waiting = input({
        messages: [ask('Q', 1), reply('')],
        plan: { live: true, version: 2 },
    });
    const view = dockView(waiting);

    assert.deepEqual([view.sheet, view.planOpen, view.cap], ['plan', true, 'plan']);
    assert.equal(dockView({ ...waiting, planFolded: planKey(1, 2) }).planOpen, false);
    // A new version opens again.
    assert.equal(dockView({ ...waiting, planFolded: planKey(1, 1) }).planOpen, true);
});

test('the send arrow is quiet while a plan waits and the field is empty', () => {
    const waiting = input({ messages: [ask('Q', 1), reply('')], plan: { live: true, version: 1 } });

    assert.equal(dockView(waiting).quietSend, true);
    assert.equal(dockView({ ...waiting, draft: '  ' }).quietSend, true);
    assert.equal(dockView({ ...waiting, draft: 'fewer years' }).quietSend, false);
    assert.equal(dockView({ ...waiting, plan: { live: false, version: 1 } }).quietSend, false);
});

test('a card change is silent: status while it runs, the earlier view after, its refusal as the row', () => {
    const edit = ask('Constant 2023 US dollars', 2, {
        edit: { card: 'cmp_1', row: 'unit' },
        card: { title: 'Aid' },
    });
    const running = {
        ...charted,
        messages: [...charted.messages, edit, reply('')],
        thinking: true,
    };
    const during = dockView(running);

    assert.deepEqual(
        [during.row, during.sheet, during.pills, during.running?.text, during.question?.turn],
        [{ kind: 'status', stepOf: null }, 'none', false, 'Constant 2023 US dollars', 1],
    );

    const done = dockView({ ...running, thinking: false, widgets: [{ turn: 1 }, { turn: 2 }] });

    assert.deepEqual(done, dockView(charted));
    assert.equal(done.questions.length, 1);

    const refused = dockView({
        ...running,
        thinking: false,
        messages: [...charted.messages, edit, reply('That unit is not offered. Try another.')],
    });

    assert.deepEqual(
        [refused.row, refused.sheet, refused.pills],
        [{ kind: 'folded', text: 'That unit is not offered.', openable: false }, 'none', false],
    );
});

test('a card change after an answer in words leaves the held answer open', () => {
    const words = input({
        messages: [
            ask('Q', 1),
            reply('Words only.'),
            ask('Current euros', 2, { edit: { card: 'cmp_1', row: 'unit' } }),
            reply(''),
        ],
    });

    assert.deepEqual([dockView(words).sheet, dockView(words).held], ['reply', true]);
});

test('Step n of m counts the steps started after the approval, for plans of two or more steps', () => {
    const entry = (states: ('running' | 'complete')[]): ActivityEntry => ({
        turn: 1,
        prompt: 'Q',
        startedAt: 0,
        approvedOrder: 2,
        tools: [
            {
                id: 'plan',
                name: 'plan',
                args: null,
                startedAt: 0,
                state: 'complete',
                startOrder: 1,
            },
            ...states.map((state, at) => ({
                id: `s${at}`,
                name: 's',
                args: null,
                startedAt: 1,
                state,
                startOrder: 3 + at,
            })),
        ],
    });

    assert.equal(planStep(approved(1), entry([])), null);
    assert.equal(planStep(null, entry([])), null);
    assert.deepEqual(planStep(approved(3), entry([])), { step: 1, of: 3 });
    assert.deepEqual(planStep(approved(3), entry(['complete', 'running'])), { step: 2, of: 3 });
    assert.deepEqual(planStep(approved(3), entry(['complete', 'complete'])), { step: 3, of: 3 });
    assert.deepEqual(
        planStep(approved(3), entry(['complete', 'complete', 'complete', 'running'])),
        { step: 3, of: 3 },
    );

    const running = dockView(
        input({
            messages: [ask('Q', 1), reply('', { plan: approved(3) })],
            activity: [entry(['running'])],
            thinking: true,
        }),
    );

    assert.deepEqual(running.row, { kind: 'status', stepOf: { step: 1, of: 3 } });
});

test('a first sentence is plain text cut at the end of its sentence', () => {
    for (const [text, sentence] of [
        ['\n\n**Aid** rose 3.5% in 2023. It fell later.', 'Aid rose 3.5% in 2023.'],
        ['- First `item`! Then more', 'First item!'],
        ['## Heading line', 'Heading line'],
        ['_Stopped._', 'Stopped.'],
        ['See [the data](https://example.org) here? Yes.', 'See the data here?'],
        ['No ending', 'No ending'],
    ]) {
        assert.equal(firstSentence(text), sentence);
    }
});

test('the running label drops trailing dots and falls back to Working', () => {
    assert.equal(runningLabel('Searching datasets...'), 'Searching datasets');
    assert.equal(runningLabel('Reading…'), 'Reading');
    assert.equal(runningLabel(null), 'Working');
});

test('the field copy follows the plan, the selected card and the first question', () => {
    assert.deepEqual(dockField({ asked: false, planLive: false, target: null }), {
        placeholder: 'Ask a question...',
        label: 'Ask a question',
    });
    assert.equal(
        dockField({ asked: true, planLive: false, target: null }).placeholder,
        'Ask a follow up...',
    );
    assert.equal(
        dockField({ asked: true, planLive: false, target: 'table' }).placeholder,
        'Ask about this table...',
    );
    assert.equal(
        dockField({ asked: true, planLive: true, target: 'chart' }).placeholder,
        'Or say what to change...',
    );
});

test('streaming text splits into blocks at blank lines outside code fences', () => {
    assert.deepEqual(streamBlocks('One\nline\n\nTwo\n\n\n```\na\n\nb\n```\n\nThree'), [
        'One\nline',
        'Two',
        '```\na\n\nb\n```',
        'Three',
    ]);
});

test('the pending item that ends focus is the plan or the clarifying question', () => {
    assert.equal(pendingItem({ live: true, interruptId: 'i1' }, null), 'plan:i1');
    assert.equal(
        pendingItem({ live: false, interruptId: 'i1' }, { interruptId: 'i2' }),
        'clarify:i2',
    );
    assert.equal(pendingItem(null, null), null);
});
