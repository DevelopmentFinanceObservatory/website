import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { ChatMessage, TurnWidget } from '@/components/organisms/Studio/hooks/useChat';
import type { CardInfo, ChartWidget } from '../../chat/widgets.ts';
import type { ActivityEntry, ActivityTool } from '../activity.ts';
import type { ApprovedPlan, PlanState } from '../plan.ts';
import {
    datasetsOf,
    earlierWords,
    overviewOf,
    pageTitleOf,
    planPageOf,
    type SessionInput,
    shortName,
    sourcePageOf,
    stagesOf,
    turnPageOf,
} from '../sessionView.ts';

const described = JSON.parse(
    readFileSync(
        new URL('./fixtures/descriptions/description-card-live-rendering.json', import.meta.url),
        'utf8',
    ),
).input as unknown;

const info = (extra: Partial<CardInfo> = {}): CardInfo => ({
    label: 'Source',
    sourceId: null,
    sourceName: null,
    sourceCount: 1,
    indicatorCount: 1,
    years: { start: '2010', end: '2024' },
    unit: null,
    licence: null,
    dataThrough: '2024',
    lastRefreshed: null,
    ...extra,
});

const chart = (
    id: string,
    turn: number,
    extra: Partial<CardInfo> | null = {},
): ChartWidget & { turn: number } => ({
    kind: 'chart',
    id,
    chartType: 'line',
    title: `Title ${id}`,
    categories: [],
    series: [],
    turn,
    ...(extra && { info: info(extra) }),
});

const ask = (text: string, turn: number, extra: object = {}): ChatMessage => ({
    role: 'user',
    text,
    turn,
    ...extra,
});

const reply = (text: string, extra: object = {}): ChatMessage => ({ role: 'bot', text, ...extra });

const tool = (args: string, state: ActivityTool['state'], name = args): ActivityTool => ({
    id: `${args}-${state}-${name}`,
    name,
    args,
    startedAt: 0,
    state,
});

const entry = (turn: number, tools: ActivityTool[] = [], extra: Partial<ActivityEntry> = {}) => ({
    turn,
    prompt: '',
    startedAt: 0,
    tools,
    ...extra,
});

const approved = (title: string, extra: Partial<ApprovedPlan> = {}): ApprovedPlan => ({
    plan_version_id: 'v',
    version: 1,
    title,
    steps: [{ label: 'Find' }, { label: 'Chart it', gives_answer: true }, { label: 'Check' }],
    choices: [{ question: 'Prices', chosen: 'Constant 2023' }],
    caveats: ['Donors report late.'],
    ...extra,
});

const input = (extra: Partial<SessionInput>): SessionInput => ({
    messages: [],
    widgets: [],
    activity: [],
    plan: null,
    clarify: null,
    thinking: false,
    canvasIds: [],
    titleOf: (id) => `Title ${id}`,
    ...extra,
});

test('overviewOf runs groups oldest first and folds all but the newest three', () => {
    const messages = [1, 2, 3, 4, 5].flatMap((turn) => [ask(`Q${turn}`, turn), reply(`A${turn}.`)]);
    const widgets = [chart('a', 1), chart('b', 2), chart('c', 2), chart('d', 5)];
    const view = overviewOf(input({ messages, widgets, canvasIds: ['d', 'c', 'a', 'b'] }));

    assert.deepEqual(
        view.groups.map((group) => [group.question, group.newest]),
        [
            ['Q1', false],
            ['Q2', false],
            ['Q3', false],
            ['Q4', false],
            ['Q5', true],
        ],
    );
    assert.deepEqual(view.earlier, { questions: 2, cards: 3 });
    assert.equal(earlierWords(view.earlier), '2 earlier questions, 3 cards');
    assert.equal(earlierWords({ questions: 1, cards: 0 }), '1 earlier question');
    assert.deepEqual(
        view.groups[1]?.cards.map((card) => card.id),
        ['c', 'b'],
    );
    assert.equal(view.cardCount, 4);
    assert.equal(overviewOf(input({ messages: messages.slice(0, 6) })).earlier, null);
    assert.equal(overviewOf(input({})).empty, true);
});

// Each row: a transcript, its Activity, and what the newest group then reads.
const IRREGULAR: {
    name: string;
    extra: Partial<SessionInput>;
    questions: string[];
    words: string;
    quiet?: boolean;
}[] = [
    {
        name: 'a refunded prompt makes no question',
        extra: {
            messages: [
                ask('Q1', 1),
                reply('A1.'),
                ask('Refused', 2, { refunded: true }),
                reply('_Sign in._'),
            ],
        },
        questions: ['Q1'],
        words: 'Answered in words',
        quiet: true,
    },
    {
        name: 'inherited and unkeyed prompts keep their questions',
        extra: {
            messages: [
                ask('Forked', 1, { inherited: true }),
                reply('Old.', { inherited: true }),
                ask('Unkeyed', 2, { unkeyed: true }),
                reply('New.'),
            ],
            widgets: [chart('f', 1)],
            canvasIds: ['f'],
        },
        questions: ['Forked', 'Unkeyed'],
        words: 'Answered in words',
        quiet: true,
    },
    {
        name: 'a failed turn reads No answer and shows its stages',
        extra: {
            messages: [ask('Q', 1), reply('_Studio could not be reached._')],
            activity: [entry(1, [tool('get_data', 'failed')], { failed: true })],
        },
        questions: ['Q'],
        words: 'No answer',
    },
    {
        name: 'a stopped turn with no words reads No answer',
        extra: { messages: [ask('Q', 1), reply('')], activity: [entry(1)] },
        questions: ['Q'],
        words: 'No answer',
    },
    {
        name: 'a running turn reads Working',
        extra: {
            messages: [ask('Q', 1), reply('Partial text')],
            activity: [entry(1, [tool('search', 'running', 'Searching for aid')])],
            thinking: true,
        },
        questions: ['Q'],
        words: 'Working',
    },
    {
        name: 'a rejected plan leaves a words-only answer',
        extra: { messages: [ask('Q', 1), reply('Plan set aside, answered briefly.')] },
        questions: ['Q'],
        words: 'Answered in words',
        quiet: true,
    },
    {
        name: 'an edit turn adds no group',
        extra: {
            messages: [
                ask('Q', 1),
                reply('Here.'),
                ask('Constant prices', 2, {
                    edit: { card: 'a', row: 'unit' },
                    card: { title: 'Title a' },
                }),
                reply(''),
            ],
            widgets: [chart('a2', 1)],
            canvasIds: ['a2'],
        },
        questions: ['Q'],
        words: '1 card',
    },
];

for (const row of IRREGULAR) {
    test(`overviewOf: ${row.name}`, () => {
        const view = overviewOf(input(row.extra));
        const newest = view.groups.at(-1);

        assert.deepEqual(
            view.groups.map((group) => group.question),
            row.questions,
        );
        assert.equal(newest?.words, row.words);
        assert.equal(newest?.quiet, row.quiet ?? false);
    });
}

test('overviewOf shows stage rows only on the newest group while it has no reply', () => {
    const tools = [tool('search', 'complete'), tool('get_data', 'running', 'Fetching ODA')];
    const running = overviewOf(
        input({
            messages: [ask('Q1', 1), reply('A.'), ask('Q2', 2), reply('')],
            activity: [entry(1, [tool('search', 'complete')]), entry(2, tools)],
            thinking: true,
        }),
    );

    assert.deepEqual(running.groups[0]?.stages, []);
    assert.deepEqual(
        running.groups[1]?.stages.map((stage) => [stage.id, stage.state, stage.label, stage.note]),
        [
            ['find', 'done', 'Found the data', null],
            ['fetch', 'running', 'Fetching the data', 'Fetching ODA'],
        ],
    );

    const done = overviewOf(
        input({
            messages: [ask('Q2', 2), reply('Done.')],
            activity: [
                entry(
                    2,
                    tools.map((each) => ({ ...each, state: 'complete' })),
                ),
            ],
        }),
    );

    assert.deepEqual(done.groups[0]?.stages, []);

    // A failed row's note is its step's detail, else why the turn failed.
    const failedTurn = (summary?: string) =>
        overviewOf(
            input({
                messages: [ask('Q', 1), reply('_The data could not be read. Try again._')],
                activity: [
                    entry(1, [{ ...tool('get_data', 'failed', 'Fetching ODA'), summary }], {
                        failed: true,
                    }),
                ],
            }),
        ).groups[0]?.stages.map((stage) => [stage.state, stage.note]);

    assert.deepEqual(failedTurn('Timed out after 30 s'), [['failed', 'Timed out after 30 s']]);
    assert.deepEqual(failedTurn(), [['failed', 'The data could not be read.']]);
});

test('stagesOf drops a fixed failure, follows the step before an unknown tool, and shows the planner only before its plan', () => {
    const rows = stagesOf(
        [
            tool('get_data', 'failed'),
            tool('get_data', 'complete'),
            tool('mystery', 'failed', 'Unnamed'),
            tool('plan', 'running'),
        ],
        { asking: true, asked: false, planned: false },
    );

    assert.deepEqual(
        rows.map((row) => [row.id, row.state, row.note]),
        [
            ['ask', 'waiting', 'At the prompt'],
            ['fetch', 'failed', null],
            ['plan', 'running', 'plan'],
        ],
    );
    assert.deepEqual(
        stagesOf([tool('plan', 'running')], { asking: false, asked: false, planned: true }),
        [],
    );
});

test('a removed card moves to the removed rows and out of its question', () => {
    const view = overviewOf(
        input({
            messages: [ask('Q', 1), reply('Two.')],
            widgets: [chart('a', 1), chart('b', 1)],
            canvasIds: ['b'],
        }),
    );

    assert.deepEqual(
        view.groups[0]?.cards.map((card) => card.id),
        ['b'],
    );
    assert.deepEqual(
        view.removed.map((card) => card.id),
        ['a'],
    );
    // The question still made two cards.
    assert.equal(view.groups[0]?.words, '2 cards');
});

test('a unit change shows on its card row while it runs and when it is refused', () => {
    const messages = (last: ChatMessage): ChatMessage[] => [
        ask('Q', 1),
        reply('Here.'),
        ask('Constant prices', 2, { edit: { card: 'a', row: 'unit' }, card: { title: 'Title a' } }),
        last,
    ];
    const base = { widgets: [chart('a', 1)], canvasIds: ['a'] };
    const runningView = overviewOf(
        input({ ...base, messages: messages(reply('')), thinking: true }),
    );
    const refusedView = overviewOf(
        input({
            ...base,
            messages: messages(reply('_The card moved on._')),
            activity: [entry(1), entry(2, [], { failed: true })],
        }),
    );

    assert.deepEqual(runningView.groups[0]?.cards[0]?.change, { state: 'running' });
    assert.deepEqual(refusedView.groups[0]?.cards[0]?.change, {
        state: 'refused',
        text: 'The card moved on.',
    });
    // The newest group stays the question, which has its reply.
    assert.equal(runningView.groups[0]?.words, '1 card');
});

test('card rows take their glyph from the chosen view and the kind', () => {
    const widgets: TurnWidget[] = [
        chart('l', 1),
        { ...chart('h', 1), chartType: 'bar', horizontal: true },
        { kind: 'key_number', id: 'k', label: 'Total', value: '3', turn: 1 },
        { kind: 'text', id: 't', title: 'Note', body: 'x', turn: 1 },
    ];
    const view = overviewOf(
        input({
            messages: [ask('Q', 1), reply('Four.')],
            widgets,
            canvasIds: ['l', 'h', 'k', 't'],
            views: { l: 'chart-table' },
        }),
    );

    assert.deepEqual(
        view.groups[0]?.cards.map((card) => [card.glyph, card.tag]),
        [
            ['chart-table', 'Table'],
            ['chart-bar', 'Ranking'],
            ['key-number', 'Key number'],
            ['note', 'Text'],
        ],
    );
});

test('the plan line and page read an approved plan, and a live plan waits for the reader', () => {
    const messages = [ask('Q', 1), reply('Here.', { plan: approved('Kenya plan') })];
    const base = { messages, widgets: [chart('a', 1)], canvasIds: ['a'] };
    const view = overviewOf(input(base));
    const page = planPageOf(input(base), 1);

    assert.deepEqual(view.groups[0]?.plan, { turn: 1, steps: 3, state: '', live: false });
    assert.equal(page?.title, 'Kenya plan');
    assert.equal(page?.meta, 'Done');
    assert.deepEqual(
        page?.steps.map((step) => [step.state, step.cards.map((card) => card.id)]),
        [
            ['done', []],
            ['done', ['a']],
            ['done', []],
        ],
    );
    assert.deepEqual(page?.choices, [{ key: '0', label: 'Prices', value: 'Constant 2023' }]);
    assert.deepEqual(view.keep, [
        { text: 'Donors report late.', cards: [{ id: 'a', title: 'Title a' }] },
    ]);

    const live: PlanState = {
        title: 'Draft',
        summary: null,
        steps: [{ id: 's1', label: 'Fetch', description: '' }],
        answerStepId: 's1',
        decisions: [],
        caveats: ['Not yet.'],
        movedElsewhere: [],
        version: 1,
        actions: [],
        interruptId: 'i',
        live: true,
        revision: null,
        baseline: {},
        changed: [],
        switched: null,
        stepsUpdated: false,
        switching: null,
        notice: null,
    };
    const waiting = input({ messages: [ask('Q', 1), reply('')], plan: live });

    assert.deepEqual(overviewOf(waiting).groups[0]?.plan, {
        turn: 1,
        steps: 1,
        state: 'Waiting for you at the prompt',
        live: true,
    });
    assert.equal(overviewOf(waiting).groups[0]?.words, 'Waiting for you');
    assert.equal(planPageOf(waiting, 1)?.steps[0]?.state, 'pending');
    // A live plan's caveats are not yet the session's.
    assert.deepEqual(overviewOf(waiting).keep, []);
});

test('a plan page puts each card on the step that drew it, else on the answer step', () => {
    const plan = approved('Plan', {
        plan_version_id: 'pv1',
        steps: [
            { id: 's1', label: 'Find' },
            { id: 's2', label: 'Chart it', gives_answer: true },
            { id: 's3', label: 'Compare' },
        ],
    });
    const linked = (id: string, version: string, step: string) => ({
        ...chart(id, 1),
        planStep: { plan_version_id: version, plan_step_id: step },
    });

    for (const [name, widget, cardsByStep] of [
        ['a linked card sits on its own step', linked('a', 'pv1', 's3'), [[], [], ['a']]],
        ['an unlinked card sits on the answer step', chart('a', 1), [[], ['a'], []]],
        ['a link to a step the plan lacks falls back', linked('a', 'pv1', 's9'), [[], ['a'], []]],
        ['a link to another plan version falls back', linked('a', 'pv0', 's3'), [[], ['a'], []]],
    ] as const) {
        const page = planPageOf(
            input({
                messages: [ask('Q', 1), reply('Here.', { plan })],
                widgets: [widget],
                canvasIds: ['a'],
            }),
            1,
        );

        assert.deepEqual(
            page?.steps.map((step) => [step.cards.map((card) => card.id), step.inReply]),
            cardsByStep.map((ids) => [ids, false]),
            name,
        );
    }
});

test('a described card gives the caveats, sources and dataset; a card without a description gives its legacy facts', () => {
    const widgets = [
        chart('d', 1, { description: described }),
        chart('l', 1, {
            sources: [
                {
                    id: 'dcid:WorldBankIDS',
                    name: 'World Bank International Debt Statistics (IDS)',
                    licence: 'CC BY 4.0',
                    url: null,
                    retrieved: null,
                },
            ],
            citation: 'World Bank (2026)',
            indicators: [{ id: 'dcid:debt', name: 'External debt stocks', description: '' }],
        }),
    ];
    const base = input({
        messages: [ask('Q', 1), reply('Two.')],
        widgets,
        canvasIds: ['d', 'l'],
    });
    const view = overviewOf(base);

    assert.deepEqual(
        view.keep.map((keep) => keep.text),
        ['Values of infectious disease control in 2024 are provisional.'],
    );
    assert.deepEqual(
        view.sources.map((source) => [source.key, source.page, source.meta, source.cards.length]),
        [
            [
                'provenance/OECDCreditorReportingSystem',
                'provenance/OECDCreditorReportingSystem',
                'data through 2024 · OECD Terms and Conditions',
                1,
            ],
            ['dcid:WorldBankIDS', null, 'data through 2024 · CC BY 4.0', 1],
        ],
    );
    assert.deepEqual(view.citations, [
        'OECD Creditor Reporting System (CRS) (2026), via the Development Finance Observatory',
        'World Bank (2026)',
    ]);
    assert.deepEqual(datasetsOf(base, 1), [
        { measure: 'gross disbursements', source: 'OECD CRS', years: '2010 to 2024' },
        { measure: 'External debt stocks', source: 'World Bank IDS', years: '2010 to 2024' },
    ]);
    assert.equal(sourcePageOf(base, 'dcid:WorldBankIDS')?.licence, 'CC BY 4.0');
    assert.equal(pageTitleOf(base, { kind: 'source', id: 'gone' }), null);

    // A card saved with one source by id and name keeps a source page.
    const single = input({
        widgets: [chart('s', 1, { sourceId: 'dcid:IMF', sourceName: 'IMF', licence: 'Open' })],
        canvasIds: ['s'],
    });

    assert.equal(sourcePageOf(single, 'dcid:IMF')?.licence, 'Open');
});

test('datasetsOf falls back to the completed fetch steps of a question without cards', () => {
    const base = input({
        messages: [ask('Q', 1), reply('Words.')],
        activity: [
            entry(1, [
                tool('get_data', 'complete', 'Fetch ODA to Kenya'),
                tool('get_data', 'failed', 'Fetch broken'),
            ]),
        ],
    });

    assert.deepEqual(datasetsOf(base, 1), [
        { measure: 'Fetch ODA to Kenya', source: null, years: null },
    ]);
});

test('turnPageOf gives the reply first sentence, and null for a gone or edit turn', () => {
    const base = input({
        messages: [
            ask('Q', 1),
            reply('First point. Second point.'),
            ask('Unit', 2, { edit: { card: 'x', row: 'unit' }, card: { title: 'x' } }),
            reply(''),
        ],
    });

    assert.equal(turnPageOf(base, 1)?.reply, 'First point.');
    assert.equal(turnPageOf(base, 2), null);
    assert.equal(turnPageOf(base, 9), null);
});

test('shortName uses the acronym only when it spells the words it follows', () => {
    assert.equal(shortName('OECD Creditor Reporting System (CRS)'), 'OECD CRS');
    assert.equal(
        shortName('World Development Indicators (WB)'),
        'World Development Indicators (WB)',
    );
    assert.equal(shortName('Plain name'), 'Plain name');
});

test('a card a later question replaced stays in the question that first made it', () => {
    // Turn 1 made `a`; turn 2 drew `a2` in its place, which keeps the turn
    // that made the chain's first card as `madeIn`, saved with the card.
    const base = input({
        messages: [ask('Q1', 1), reply('One.'), ask('Q2', 2), reply('Changed it.')],
        widgets: [{ ...chart('a2', 2), madeIn: 1 }],
        activity: [entry(1), entry(2)],
        canvasIds: ['a2'],
    });
    const view = overviewOf(base);

    assert.deepEqual(
        view.groups.map((group) => [group.cards.map((card) => card.id), group.changed]),
        [
            [['a2'], []],
            [[], [{ id: 'a2', title: 'Title a2', onCanvas: true }]],
        ],
    );
    assert.equal(view.groups[1]?.quiet, false);
    assert.equal(turnPageOf(base, 2)?.changed.length, 1);
    // A card that replaced none shows under the turn it carries.
    assert.deepEqual(
        overviewOf({ ...base, widgets: [chart('a2', 2)] }).groups.map(
            (group) => group.cards.length,
        ),
        [0, 1],
    );
});

test('a question whose cards have all left the canvas says how many were removed', () => {
    // Turn 2 redrew turn 1's card as a new card: nothing ties the two.
    const view = overviewOf(
        input({
            messages: [ask('Q1', 1), reply('One.'), ask('Q2', 2), reply('Redrawn.')],
            widgets: [chart('a', 1), chart('b', 1), chart('c', 2)],
            canvasIds: ['c'],
        }),
    );

    assert.deepEqual(
        view.groups.map((group) => [group.cards.length, group.gone]),
        [
            [0, '2 cards removed'],
            [1, ''],
        ],
    );
});

test('a change asked of a card that was since replaced shows on the card standing for it', () => {
    const view = overviewOf(
        input({
            messages: [
                ask('Q', 1),
                reply('Here.'),
                ask('Years', 2, { edit: { card: 'a', row: 'years' }, card: { title: 'Title a' } }),
                reply('_No data for those years._'),
            ],
            widgets: [chart('a2', 1)],
            activity: [entry(1), entry(2, [], { failed: true })],
            canvasIds: ['a2'],
            replaced: { a2: 'a' },
        }),
    );

    assert.deepEqual(view.groups[0]?.cards[0]?.change, {
        state: 'refused',
        text: 'No data for those years.',
    });
});
