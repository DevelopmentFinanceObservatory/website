/**
 * The plan card's switch: the reply a pick sends, the picks the card
 * refuses before sending, and the card after a refusal or a fresh plan.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PLAN_REVISION_STALE,
    approveReply,
    approvedFromFrame,
    approvedView,
    answerStepOf,
    canSwitch,
    STALE_NOTICE,
    SWITCH_OPTION_UNAVAILABLE,
    isActiveOption,
    isSelectable,
    planFromFrame,
    planView,
    refusedSwitch,
    settledPlan,
    stalePlan,
    startSwitch,
    switchEnded,
    switchReply,
    withApprovedPlan,
    yearsText,
    type PlanState,
} from '../plan.ts';
import { withoutChips } from '../chips.ts';
import type { StreamRefusal } from '../studioClient.ts';
import type { PlanApproved, PlanDecision, PlanProposed } from '../wire.ts';
import type { ChatMessage } from '../../../components/organisms/Studio/hooks/useChat.ts';

const countDecision: PlanDecision = {
    id: 'd1',
    question: 'How is aid counted?',
    chosen: 'Gross disbursements',
    reason: 'the source publishes this basis',
    resolved_by: 'default',
    choice_id: 'spec_1:measure_basis',
    active_option_id: 'measure_basis:gross',
    options: [
        {
            option_id: 'measure_basis:gross',
            label: 'Gross disbursements',
            status: 'available',
            reason: null,
            years: null,
        },
        {
            option_id: 'measure_basis:net',
            label: 'Net disbursements',
            status: 'partial',
            reason: null,
            years: [
                [2015, 2019],
                [2022, 2022],
            ],
        },
        {
            option_id: 'measure_basis:grant_equivalent',
            label: 'Grant equivalent',
            status: 'unavailable',
            reason: 'The source does not publish this basis for these donors.',
            years: null,
        },
    ],
};

const frame = (overrides: Partial<PlanProposed> = {}): PlanProposed => ({
    event: 'plan.proposed',
    seq: 4,
    interrupt_id: 'int-1',
    plan_version_id: 'pv-1',
    version: 1,
    title: 'Health aid to Ghana',
    steps: [{ id: 's1', label: 'Retrieve health aid' }],
    actions: ['approve', 'amend', 'reject', 'switch'],
    decisions: [countDecision, { ...countDecision, id: 'd2', choice_id: null, options: null }],
    revision: 'rev-a',
    ...overrides,
});

const PICK = { choiceId: 'spec_1:measure_basis', optionId: 'measure_basis:net' };

/** The fresh plan a switch to net disbursements re-offers. */
const switchedFrame = (overrides: Partial<PlanProposed> = {}): PlanProposed =>
    frame({
        interrupt_id: 'int-2',
        version: 2,
        revision: 'rev-b',
        decisions: [
            {
                ...countDecision,
                chosen: 'Net disbursements',
                active_option_id: 'measure_basis:net',
            },
        ],
        ...overrides,
    });

test('planFromFrame keeps the revision and marks nothing changed without a switch', () => {
    const plan = planFromFrame(frame({ revision: 'rev-b' }));

    assert.equal(plan.revision, 'rev-b');
    assert.deepEqual(plan.changed, []);
    assert.equal(plan.switching, null);
    assert.equal(plan.notice, null);
});

test('a harness without summary, gives_answer or revision still gives a whole card', () => {
    const plan = planFromFrame(
        frame({
            revision: undefined,
            moved: undefined,
            steps: [
                { id: 's1', label: 'Retrieve health aid' },
                { id: 's2', label: 'Sum across recipients' },
            ],
        }),
    );
    const view = planView(plan);

    assert.equal(plan.revision, null);
    assert.equal(view.title, 'Health aid to Ghana');
    assert.equal(view.summary, null);
    assert.deepEqual(
        view.steps.map((step) => [step.label, step.givesAnswer]),
        [
            ['Retrieve health aid', false],
            ['Sum across recipients', true],
        ],
    );
    assert.deepEqual(
        view.choices.map((choice) => [choice.key, choice.value, choice.changedFrom]),
        [['spec_1:measure_basis', 'Gross disbursements', null]],
    );
    assert.deepEqual(
        view.others.map((other) => other.key),
        ['d2'],
    );
});

test('the answer step is the flagged one, else the last step an ask names', async (t) => {
    const steps = [
        { id: 's1', label: 'Fetch' },
        { id: 's2', label: 'Divide' },
        { id: 's3', label: 'Chart' },
    ];
    const cases: [string, Partial<PlanProposed>, string][] = [
        [
            'flagged',
            { steps: steps.map((step) => ({ ...step, gives_answer: step.id === 's2' })) },
            'Divide',
        ],
        ['an ask', { steps, asks: [{ ask: 'share', answered_by: ['s2', 'missing'] }] }, 'Divide'],
        ['neither', { steps }, 'Chart'],
    ];

    for (const [name, overrides, label] of cases) {
        await t.test(name, () => {
            assert.equal(answerStepOf(planView(planFromFrame(frame(overrides))))?.label, label);
        });
    }
});

test('a plan re-offered after a switch marks the switched choice and what it held', () => {
    const fresh = planFromFrame(switchedFrame(), startSwitch(planFromFrame(frame()), PICK));
    const [choice] = planView(fresh).choices;

    assert.deepEqual(fresh.changed, [
        { choiceId: 'spec_1:measure_basis', from: 'Gross disbursements', reason: null },
    ]);
    assert.equal(choice?.value, 'Net disbursements');
    assert.equal(choice?.changedFrom, 'Gross disbursements');
});

/** A sector choice on spec `spec`, holding `active`. */
const sectorDecision = (
    active: 'sector:120' | 'sector:120+130',
    spec = 'spec_1',
): PlanDecision => ({
    ...countDecision,
    id: `sector_${spec}`,
    question: 'Sector',
    chosen: active === 'sector:120' ? 'Health' : 'Health and population',
    choice_id: `${spec}:sector`,
    active_option_id: active,
    options: [
        {
            option_id: 'sector:120+130',
            label: 'Health and population',
            status: 'available',
            reason: null,
            years: null,
        },
        {
            option_id: 'sector:120',
            label: 'Health',
            status: 'available',
            reason: null,
            years: null,
        },
    ],
});

const basisDecision = (active: string, spec = 'spec_1'): PlanDecision => ({
    ...countDecision,
    choice_id: `${spec}:measure_basis`,
    active_option_id: active,
});

test('moved names a choice the switch moved besides the picked one, with why', () => {
    const fresh = planFromFrame(
        switchedFrame({
            decisions: [basisDecision('measure_basis:net'), sectorDecision('sector:120')],
            moved: [
                {
                    choice_id: 'spec_1:sector',
                    from_label: 'Health and population',
                    to_label: 'Health',
                    reason: 'Net figures cover health alone.',
                },
            ],
        }),
        startSwitch(
            planFromFrame(frame({ decisions: [countDecision, sectorDecision('sector:120+130')] })),
            PICK,
        ),
    );

    assert.deepEqual(fresh.changed, [
        { choiceId: 'spec_1:measure_basis', from: 'Gross disbursements', reason: null },
        {
            choiceId: 'spec_1:sector',
            from: 'Health and population',
            reason: 'Net figures cover health alone.',
        },
    ]);
});

test('after two switches both rows are Changed from the first plan, across a re-pinned spec', () => {
    const v1 = planFromFrame(
        frame({
            decisions: [basisDecision('measure_basis:gross'), sectorDecision('sector:120+130')],
        }),
    );
    const v2 = planFromFrame(
        switchedFrame({
            decisions: [basisDecision('measure_basis:net'), sectorDecision('sector:120+130')],
        }),
        startSwitch(v1, PICK),
    );
    // The sector switch re-pins the spec its choice_id names.
    const v3 = planFromFrame(
        switchedFrame({
            interrupt_id: 'int-3',
            version: 3,
            decisions: [
                basisDecision('measure_basis:net', 'spec_2'),
                sectorDecision('sector:120', 'spec_2'),
            ],
        }),
        startSwitch(v2, { choiceId: 'spec_1:sector', optionId: 'sector:120' }),
    );

    assert.deepEqual(v3.changed, [
        { choiceId: 'spec_2:measure_basis', from: 'Gross disbursements', reason: null },
        { choiceId: 'spec_2:sector', from: 'Health and population', reason: null },
    ]);
    assert.equal(v3.switched, 'spec_2:sector');
    assert.deepEqual(
        planView(v3).choices.map((choice) => [choice.name, choice.changedFrom]),
        [
            ['How is aid counted?', 'Gross disbursements'],
            ['Sector', 'Health and population'],
        ],
    );
});

test('a choice switched back to its first option is not Changed', () => {
    const v1 = planFromFrame(frame({ decisions: [basisDecision('measure_basis:gross')] }));
    const v2 = planFromFrame(
        switchedFrame({ decisions: [basisDecision('measure_basis:net')] }),
        startSwitch(v1, PICK),
    );
    const v3 = planFromFrame(
        switchedFrame({ version: 3, decisions: [basisDecision('measure_basis:gross')] }),
        startSwitch(v2, { choiceId: PICK.choiceId, optionId: 'measure_basis:gross' }),
    );

    assert.deepEqual(
        v2.changed.map((change) => change.choiceId),
        [PICK.choiceId],
    );
    assert.deepEqual(v3.changed, []);
    assert.equal(v3.switched, PICK.choiceId);
});

test('switch_failed puts its reason on the row of the choice it names', () => {
    const reason = 'Net figures for 2023 are not published. The plan still counts gross.';
    const plan = planFromFrame(
        frame({
            revision: 'rev-c',
            switch_failed: {
                choice_id: 'spec_1:measure_basis',
                option_id: 'measure_basis:net',
                code: 'operation_unsupported',
                reason,
            },
        }),
    );

    assert.deepEqual(plan.notice, {
        lead: 'Could not switch to Net disbursements.',
        text: reason,
        retryable: true,
        ...PICK,
    });
    assert.deepEqual(switchReply(plan, PICK.choiceId, PICK.optionId), {
        decision: 'switch',
        choice_id: PICK.choiceId,
        option_id: PICK.optionId,
        plan_revision: 'rev-c',
    });
});

test('switchReply sends the choice, the option and the revision the user saw', () => {
    const reply = switchReply(planFromFrame(frame()), 'spec_1:measure_basis', 'measure_basis:net');

    assert.deepEqual(reply, {
        decision: 'switch',
        choice_id: 'spec_1:measure_basis',
        option_id: 'measure_basis:net',
        plan_revision: 'rev-a',
    });
});

test('switchReply refuses a pick the plan does not offer', async (t) => {
    const plan = planFromFrame(frame());
    const cases = [
        ['an unavailable option', plan, 'measure_basis:grant_equivalent'],
        ['the active option', plan, 'measure_basis:gross'],
        ['an unknown option', plan, 'measure_basis:commitments'],
        [
            'a plan that does not list switch',
            planFromFrame(frame({ actions: ['approve', 'amend', 'reject'] })),
            'measure_basis:net',
        ],
        [
            'a plan without a revision',
            planFromFrame(frame({ revision: null })),
            'measure_basis:net',
        ],
        [
            'a switch already in flight',
            startSwitch(plan, { choiceId: 'spec_1:measure_basis', optionId: 'measure_basis:net' }),
            'measure_basis:net',
        ],
    ] as const;

    for (const [name, candidate, optionId] of cases) {
        await t.test(name, () => {
            assert.equal(switchReply(candidate, 'spec_1:measure_basis', optionId), null);
        });
    }
});

test('the active option is the chosen one, and only other offered options are selectable', () => {
    const [gross, net, grant] = countDecision.options!;

    assert.deepEqual(
        [gross!, net!, grant!].map((option) => [
            isActiveOption(countDecision, option),
            isSelectable(countDecision, option),
        ]),
        [
            [true, false],
            [false, true],
            [false, false],
        ],
    );
});

test('active_option_id marks the active option over a label that matches another', () => {
    const [gross, net] = countDecision.options!;
    const decision = { ...countDecision, active_option_id: 'measure_basis:net' };

    assert.equal(isActiveOption(decision, net!), true);
    assert.equal(isActiveOption(decision, gross!), false);
});

test('without active_option_id the chosen label marks the active option', () => {
    const [gross, net] = countDecision.options!;
    const decision = { ...countDecision, active_option_id: undefined };

    assert.equal(isActiveOption(decision, gross!), true);
    assert.equal(isActiveOption(decision, net!), false);
});

const STALE_DETAIL = 'This plan changed in another window. Here is the current plan.';

/** A 409 `plan_revision_stale`, with the harness's current card when given. */
const staleRefusal = (currentPlan?: PlanProposed): StreamRefusal => ({
    status: 409,
    detail: STALE_DETAIL,
    error: {
        error: 'edit_conflict',
        retry: 'refresh_then_retry',
        detail: STALE_DETAIL,
        constraint_id: PLAN_REVISION_STALE,
        ...(currentPlan && { current_plan: currentPlan }),
    },
});

const currentFrame = frame({ seq: 9, interrupt_id: 'int-2', version: 2, revision: 'rev-b' });

test('a stale switch is answered with the current card, which switches again', () => {
    const waiting = startSwitch(planFromFrame(frame()), {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });
    const replaced = refusedSwitch(waiting, staleRefusal(currentFrame));

    assert.deepEqual(replaced, {
        ...planFromFrame(currentFrame),
        notice: {
            lead: null,
            text: STALE_DETAIL,
            retryable: false,
            choiceId: null,
            optionId: null,
        },
    });
    assert.deepEqual(switchReply(replaced, 'spec_1:measure_basis', 'measure_basis:net'), {
        decision: 'switch',
        choice_id: 'spec_1:measure_basis',
        option_id: 'measure_basis:net',
        plan_revision: 'rev-b',
    });
});

test('a stale approve is answered with the current card; other refusals are not', () => {
    assert.deepEqual(stalePlan(staleRefusal(currentFrame)), {
        ...planFromFrame(currentFrame),
        notice: {
            lead: null,
            text: STALE_DETAIL,
            retryable: false,
            choiceId: null,
            optionId: null,
        },
    });
    assert.equal(stalePlan(staleRefusal()), null);
    assert.equal(
        stalePlan({
            status: 422,
            detail: 'decision approve does not take a payload',
            error: null,
        }),
        null,
    );
});

test('an approve carries the revision of the card the user approved', () => {
    assert.deepEqual(approveReply(planFromFrame(frame())), {
        decision: 'approve',
        plan_revision: 'rev-a',
    });
    assert.deepEqual(approveReply(planFromFrame(frame({ revision: null }))), {
        decision: 'approve',
    });
});

test('a stale switch without a current card keeps its revision, so an approve is refused', () => {
    const plan = startSwitch(planFromFrame(frame()), {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });
    const refused = refusedSwitch(plan, staleRefusal());

    assert.equal(refused.switching, null);
    assert.deepEqual(refused.notice, {
        lead: null,
        text: STALE_NOTICE,
        retryable: false,
        choiceId: null,
        optionId: null,
    });
    assert.equal(canSwitch(refused), false);
    assert.equal(switchReply(refused, 'spec_1:measure_basis', 'measure_basis:net'), null);
    assert.deepEqual(approveReply(refused), { decision: 'approve', plan_revision: 'rev-a' });
});

test('an unavailable option keeps the card and shows the harness reason', () => {
    const plan = startSwitch(planFromFrame(frame()), {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });
    const refused = refusedSwitch(plan, {
        status: 422,
        detail: 'Net disbursements cannot be counted for this plan.',
        error: {
            error: 'constraint_violation',
            retry: 'correct_and_retry',
            detail: 'Net disbursements cannot be counted for this plan.',
            constraint_id: SWITCH_OPTION_UNAVAILABLE,
        },
    });

    assert.equal(refused.switching, null);
    assert.deepEqual(refused.notice, {
        lead: 'Could not switch to Net disbursements.',
        text: 'Net disbursements cannot be counted for this plan.',
        retryable: true,
        ...PICK,
    });
    assert.equal(refused.revision, 'rev-a');
    assert.equal(canSwitch(refused), true);
});

test('any other refusal keeps the card and says on the row why the switch did not apply', async (t) => {
    const plan = startSwitch(planFromFrame(frame()), PICK);
    const toolError = (error: string, constraint_id?: string) => ({
        error: error as 'not_found',
        retry: 'do_not_retry' as const,
        detail: error,
        ...(constraint_id && { constraint_id }),
    });
    const generic =
        'Studio could not switch to Net disbursements. The plan still counts Gross disbursements.';
    const lead = 'Could not switch to Net disbursements.';
    // [name, refusal, lead, text, retryable]
    const cases: [string, StreamRefusal, string | null, string, boolean][] = [
        [
            'a 404 for an interrupt that is gone',
            { status: 404, detail: 'gone', error: toolError('not_found') },
            lead,
            'gone',
            true,
        ],
        [
            'a 401',
            { status: 401, detail: 'Sign in again.', error: null },
            lead,
            'Sign in again.',
            false,
        ],
        [
            'a 429',
            { status: 429, detail: 'Too many requests.', error: null },
            lead,
            'Too many requests.',
            false,
        ],
        ['a 429 without detail', { status: 429, detail: null, error: null }, null, generic, false],
        ['a 502', { status: 502, detail: null, error: null }, null, generic, true],
        [
            'a 409 transient_unavailable',
            { status: 409, detail: 'busy', error: toolError('transient_unavailable') },
            lead,
            'busy',
            true,
        ],
        [
            'a stale constraint on a 422',
            { status: 422, detail: 'x', error: toolError('edit_conflict', PLAN_REVISION_STALE) },
            lead,
            'x',
            true,
        ],
    ];

    for (const [name, refusal, wantLead, text, retryable] of cases) {
        await t.test(name, () => {
            const refused = refusedSwitch(plan, refusal);

            assert.equal(refused.switching, null);
            assert.deepEqual(refused.notice, { lead: wantLead, text, retryable, ...PICK });
            assert.equal(
                switchReply(refused, PICK.choiceId, PICK.optionId)?.plan_revision,
                'rev-a',
            );
        });
    }
});

test('a switch that ends without a fresh plan keeps the card and says so on its row', () => {
    const plan = planFromFrame(frame());
    const settled = settledPlan(startSwitch(plan, PICK));

    assert.ok(settled);
    assert.equal(settled.switching, null);
    assert.equal(settled.notice?.choiceId, PICK.choiceId);
    assert.equal(settled.notice?.optionId, PICK.optionId);
    assert.equal(switchReply(settled, PICK.choiceId, PICK.optionId)?.plan_revision, 'rev-a');
    assert.equal(settledPlan(plan), plan);
    assert.equal(settledPlan(null), null);
});

/** The conversation fields switchEnded reads, around a paused turn. */
const pausedTurn = (plan: PlanState | null) => ({
    messages: [
        { role: 'user', text: 'What share of US aid went to health in 2023?' },
        { role: 'bot', text: '' },
    ],
    activity: [{ turn: 1, prompt: 'q', startedAt: 0, tools: [] }],
    plan,
    thinking: true,
    status: 'Switching to Net disbursements',
    statusDetail: null,
    statusSince: 1,
    stalled: false,
});

test('a switch stream that ends with no plan, done or error returns the card to idle', () => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const after = switchEnded(pausedTurn(waiting), waiting);

    assert.equal(after.plan?.switching, null);
    assert.equal(after.plan?.notice?.choiceId, PICK.choiceId);
    assert.equal(after.plan?.notice?.retryable, true);
    assert.equal(after.thinking, false);
    assert.equal(after.status, null);
});

test('a failed switch writes nothing into the paused reply or its Activity entry', () => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const before = pausedTurn(waiting);
    const after = switchEnded(before, waiting, 'The harness stopped.');

    assert.equal(after.messages, before.messages);
    assert.equal(after.activity, before.activity);
    assert.deepEqual(after.plan?.notice, {
        lead: 'Could not switch to Net disbursements.',
        text: 'The harness stopped.',
        retryable: true,
        ...PICK,
    });
});

test('a switch that ended after a fresh plan or a refusal leaves the state alone', () => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const replaced = pausedTurn(planFromFrame(switchedFrame(), waiting));

    assert.equal(switchEnded(replaced, waiting), replaced);
});

test('the card leads with the title beside a summary, else the first ask, else the title', async (t) => {
    const asks = [{ ask: 'health share of US ODA in 2023', answered_by: ['s1'] }];
    const cases: [string, Partial<PlanProposed>, string][] = [
        [
            'a summary',
            { title: 'Health share of US aid, 2023', summary: 'Gross.', asks },
            'Health share of US aid, 2023',
        ],
        ['no summary, an ask', { title: 'Research plan', asks }, 'Health share of US ODA in 2023'],
        ['neither', { title: 'Research plan' }, 'Research plan'],
    ];

    for (const [name, overrides, title] of cases) {
        await t.test(name, () => {
            assert.equal(planFromFrame(frame(overrides)).title, title);
        });
    }
});

test('a plan re-offered after a switch names the switched choice, for focus to return to', () => {
    const fresh = planFromFrame(switchedFrame(), startSwitch(planFromFrame(frame()), PICK));

    assert.equal(fresh.switched, PICK.choiceId);
    assert.equal(planFromFrame(frame()).switched, null);
});

const approvedFrame: PlanApproved = {
    event: 'plan.approved',
    seq: 1,
    plan_version_id: 'pv-2',
    version: 2,
    revision: 'rev-b',
    title: 'Health share of US aid, 2023',
    summary: 'Gross disbursements of US aid, current US dollars.',
    steps: [
        { label: 'Fetch health aid' },
        { label: 'Divide', gives_answer: true },
        { label: 'Chart' },
    ],
    choices: [
        { question: 'Basis', chosen: 'net disbursements', changed_from: 'gross disbursements' },
    ],
};

test('plan.approved rides on the reply the approve resumed and survives a save and a fork', () => {
    const messages: ChatMessage[] = [
        { role: 'user', text: 'What share of US aid went to health in 2023?' },
        { role: 'bot', text: '' },
    ];
    const approved = withApprovedPlan(messages, approvedFromFrame(approvedFrame));
    const answered: ChatMessage[] = approved.map((message) =>
        message.role === 'bot'
            ? { ...message, text: 'In 2023, 13%.', chips: [] as never[] }
            : message,
    );
    const saved = JSON.parse(JSON.stringify({ messages: answered })) as { messages: ChatMessage[] };
    const reply = withoutChips(saved.messages).at(-1);

    assert.equal(messages.at(-1)?.role, 'bot');
    assert.ok(reply?.role === 'bot' && reply.plan);
    assert.equal(reply.text, 'In 2023, 13%.');

    const view = approvedView(reply.plan);

    assert.equal(view.title, 'Health share of US aid, 2023');
    assert.equal(answerStepOf(view)?.label, 'Divide');
    assert.deepEqual(
        view.choices.map((choice) => [choice.name, choice.value, choice.changedFrom]),
        [['Basis', 'net disbursements', 'gross disbursements']],
    );
});

test('an approved plan with no step flagged answers with its last step', () => {
    const view = approvedView(
        approvedFromFrame({ ...approvedFrame, steps: [{ label: 'Fetch' }, { label: 'Sum' }] }),
    );

    assert.equal(answerStepOf(view)?.label, 'Sum');
});

test('withApprovedPlan leaves a transcript that does not end on a reply', () => {
    const messages: ChatMessage[] = [{ role: 'user', text: 'hi' }];

    assert.equal(withApprovedPlan(messages, approvedFromFrame(approvedFrame)), messages);
});

test('yearsText joins ranges and prints a one-year range once', () => {
    assert.equal(yearsText(countDecision.options![1]!.years!), '2015–2019, 2022');
});
