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
    fieldShown,
    pendingItem,
    planKey,
    planStep,
    runningLabel,
    streamBlocks,
} from '../dockView.ts';
import { WORKING } from '../chatLine.ts';
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
    streamed: false,
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
                plan: { live: true, version: 1, switching: null },
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
    // Words still in the reply store open it too.
    assert.equal(
        dockView({ ...streaming, messages: [ask('Q', 1), reply('')], streamed: true }).sheet,
        'reply',
    );
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
        plan: { live: true, version: 2, switching: null },
    });
    const view = dockView(waiting);

    assert.deepEqual([view.sheet, view.planOpen, view.cap], ['plan', true, 'plan']);
    assert.equal(dockView({ ...waiting, planFolded: planKey(1, 2) }).planOpen, false);
    // A new version opens again.
    assert.equal(dockView({ ...waiting, planFolded: planKey(1, 1) }).planOpen, true);
});

test('the send arrow is quiet while a plan waits and the field is empty', () => {
    const waiting = input({
        messages: [ask('Q', 1), reply('')],
        plan: { live: true, version: 1, switching: null },
    });

    assert.equal(dockView(waiting).quietSend, true);
    assert.equal(dockView({ ...waiting, draft: '  ' }).quietSend, true);
    assert.equal(dockView({ ...waiting, draft: 'fewer years' }).quietSend, false);
    assert.equal(
        dockView({ ...waiting, plan: { live: false, version: 1, switching: null } }).quietSend,
        false,
    );
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

    // Refused before its turn ran (the prompt is refunded), or failed in its
    // stream: either way the failure is the row, with no sheet, and the
    // answer's pills stay.
    for (const prompt of [{ ...edit, refunded: true as const }, edit]) {
        const refused = dockView({
            ...running,
            thinking: false,
            messages: [
                ...charted.messages,
                prompt,
                reply('That unit is not offered. Try another.'),
            ],
        });

        assert.deepEqual(
            [refused.row, refused.sheet, refused.pills, refused.questions.length],
            [
                { kind: 'folded', text: 'That unit is not offered.', openable: false },
                'none',
                true,
                1,
            ],
        );
    }
});

test('the two refusal kinds: a refused card change is the folded row, a refused question keeps its head and replies with the refusal', () => {
    const refusal = 'You have used your questions for today. Sign in for more.';
    const cases: [string, ChatMessage, unknown[]][] = [
        [
            'card change',
            ask('Constant 2023 US dollars', 2, {
                edit: { card: 'cmp_1', row: 'unit' },
                refunded: true,
            }),
            [
                1,
                {
                    kind: 'folded',
                    text: 'You have used your questions for today.',
                    openable: false,
                },
                'none',
                true,
                1,
            ],
        ],
        ['question', ask('Aid to Ghana', 2, { refunded: true }), [2, null, 'reply', false, 2]],
    ];

    for (const [name, prompt, expected] of cases) {
        const view = dockView({
            ...charted,
            messages: [...charted.messages, prompt, reply(refusal)],
        });

        assert.deepEqual(
            [view.question?.turn, view.row, view.sheet, view.pills, view.questions.length],
            expected,
            name,
        );
    }
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

test('Step n of m names the plan step the newest running line runs, when the lines name steps', () => {
    const plan: ApprovedPlan = {
        ...approved(4),
        steps: ['s1', 's2', 's3', 's4'].map((id) => ({ id, label: id })),
    };
    // Seven lines after the approval: each names its plan step, or none.
    const entry = (
        lines: [string | undefined, 'running' | 'complete'][],
        planVersionId?: string,
    ): ActivityEntry => ({
        turn: 1,
        prompt: 'Q',
        startedAt: 0,
        approvedOrder: 1,
        tools: lines.map(([planStepId, state], at) => ({
            id: `line${at}`,
            name: 'line',
            args: null,
            startedAt: 1,
            state,
            startOrder: 2 + at,
            ...(planStepId && { planStepId }),
            ...(planVersionId && { planVersionId }),
        })),
    });
    const step = (lines: [string | undefined, 'running' | 'complete'][], planVersionId?: string) =>
        planStep(plan, entry(lines, planVersionId))?.step;

    // Lines naming another plan's version name none of this plan's steps,
    // since step ids repeat across plans; this plan's version reads them.
    for (const [version, expected] of [
        [plan.plan_version_id, 2],
        ['pv-other', 3],
    ] as const) {
        assert.equal(
            step(
                [
                    ['s2', 'running'],
                    [undefined, 'running'],
                    [undefined, 'running'],
                ],
                version,
            ),
            expected,
            version,
        );
    }

    assert.equal(
        step([
            ['s1', 'complete'],
            ['s1', 'complete'],
            ['s2', 'running'],
            ['s2', 'running'],
        ]),
        2,
    );
    // Seven lines on four steps: the count would sit at 4 from the fourth
    // line; the named step stays at 3 until s4 runs.
    assert.equal(
        step([
            ['s1', 'complete'],
            ['s2', 'complete'],
            ['s3', 'complete'],
            ['s3', 'complete'],
            ['s3', 'complete'],
            ['s3', 'running'],
            [undefined, 'running'],
        ]),
        3,
    );
    // A line naming a step the plan lacks leaves n where it was.
    assert.equal(
        step([
            ['s2', 'complete'],
            ['copy', 'running'],
        ]),
        2,
    );
    // An approved plan without step ids counts lines.
    assert.equal(
        planStep(
            approved(4),
            entry([
                ['s1', 'complete'],
                ['s1', 'complete'],
                ['s1', 'running'],
            ]),
        )?.step,
        3,
    );
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

test('the running label drops trailing dots and ellipses and falls back to the working line', () => {
    assert.equal(runningLabel('Searching datasets...'), runningLabel('Searching datasets'));
    assert.equal(runningLabel('Reading…'), runningLabel('Reading'));
    assert.equal(runningLabel(null), WORKING);
});

test('the field copy: a live plan beats a selected card, which beats the follow-up and first-question copy', () => {
    const copy = (asked: boolean, planLive: boolean, target: 'chart' | 'table' | null) =>
        dockField({ asked, planLive, target }).placeholder;

    assert.equal(copy(true, true, 'chart'), copy(false, true, null));
    assert.equal(copy(true, false, 'chart'), copy(false, false, 'chart'));
    assert.notEqual(copy(true, false, 'chart'), copy(true, false, 'table'));
    assert.equal(
        new Set([
            copy(false, false, null),
            copy(true, false, null),
            copy(true, false, 'chart'),
            copy(true, true, null),
        ]).size,
        4,
    );

    for (const [asked, planLive, target] of [
        [false, false, null],
        [true, true, 'table'],
    ] as const) {
        const { placeholder, label } = dockField({ asked, planLive, target });

        assert.equal(label, placeholder.replace(/\.+$/, ''));
    }
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

test('a field is shown by checkVisibility where the browser has it, else by its box and visibility', () => {
    const boxes = (count: number) => () => ({ length: count }) as DOMRectList;
    const visible = () => 'visible';

    assert.equal(
        fieldShown({ getClientRects: boxes(1), checkVisibility: () => false }, visible),
        false,
    );
    // A browser without checkVisibility (Safari before 17.4).
    assert.equal(fieldShown({ getClientRects: boxes(1) }, visible), true);
    assert.equal(fieldShown({ getClientRects: boxes(0) }, visible), false);
    assert.equal(
        fieldShown({ getClientRects: boxes(1) }, () => 'hidden'),
        false,
    );
});

test('waiting states take one order: the guest wall, then a waiting plan, then a clarifying question, then the field', () => {
    const live = { live: true, version: 1, switching: null };
    const ended = { live: false, version: 1, switching: null };
    const asked = { messages: [ask('Q', 1), reply('')] };
    const cases: [string, Partial<DockInput>, string, string, string | null][] = [
        ['nothing waits', {}, 'input', 'none', null],
        ['a plan waits', { plan: live }, 'input', 'plan', 'plan'],
        ['a question waits', { clarify: true }, 'clarify', 'clarify', null],
        [
            'a plan and a question wait: the plan holds the sheet',
            { plan: live, clarify: true },
            'input',
            'plan',
            'plan',
        ],
        [
            'a read-only plan and a question: the plan, with no approval',
            { plan: ended, clarify: true },
            'input',
            'plan',
            null,
        ],
        [
            'the wall and a plan: the plan shows, the wall takes the field',
            { walled: true, plan: live },
            'wall',
            'plan',
            'plan',
        ],
        [
            'the wall and a question: the wall takes the question too',
            { walled: true, clarify: true },
            'wall',
            'none',
            null,
        ],
    ];

    for (const [name, over, mode, sheet, row] of cases) {
        const view = dockView(input({ ...asked, ...over }));

        assert.deepEqual([view.mode, view.sheet, view.row?.kind ?? null], [mode, sheet, row], name);
    }
});

test('a second clarifying question lists the turn earlier clarifications with their answers', () => {
    const first = 'Current or constant prices?';
    const messages = [
        ask('Q', 1),
        ask('A earlier turn', 1, { answer: true, asked: 'Not this turn?' }),
        ask('Q2', 2),
        ask('Current prices', 2, { answer: true, asked: first }),
        ask('Approve', 2, { answer: true }),
        reply(''),
    ];

    assert.deepEqual(dockView(input({ messages, clarify: true })).clarified, [
        { asked: first, answer: 'Current prices' },
    ]);
    // Only while a clarifying question waits.
    assert.deepEqual(dockView(input({ messages })).clarified, []);
});

test('the conversation sheet opens on an older question at that question, and at its foot on the newest', () => {
    const two = input({
        messages: [ask('Q1', 1), reply('One.'), ask('Q2', 2), reply('Two.')],
        widgets: [{ turn: 1 }, { turn: 2 }],
        canvasCards: 2,
    });
    const cases: [string, Partial<DockInput>, string, number | null][] = [
        ['newest', { sheet: 'thread', sheetTurn: 2 }, 'thread', null],
        ['older', { sheet: 'thread', sheetTurn: 1 }, 'thread', 1],
        ['older, a reply choice', { sheet: 'open', sheetTurn: 1 }, 'none', null],
    ];

    for (const [name, over, sheet, threadTurn] of cases) {
        const view = dockView({ ...two, ...over });

        assert.deepEqual([view.sheet, view.threadTurn], [sheet, threadTurn], name);
    }
});
