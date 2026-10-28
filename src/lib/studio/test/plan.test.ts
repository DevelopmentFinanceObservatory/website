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
    STEPS_UPDATED,
    SWITCH_OPTION_UNAVAILABLE,
    isActiveOption,
    isSelectable,
    ledgerSections,
    PLANNER_HEAD,
    planFromFrame,
    planView,
    refusedSwitch,
    endedPlan,
    endedSwitch,
    SWITCH_CANCELLED,
    stalePlan,
    startSwitch,
    stoppedQueuedSwitch,
    switchEnded,
    switchLine,
    switchOutcome,
    switchPendingText,
    switchReply,
    SCOPE_HEAD,
    UNREACHABLE_NOTICE,
    unreachableSwitch,
    withApprovedPlan,
    yearsText,
    type PlanState,
} from '../plan.ts';
import { withoutChips } from '../chips.ts';
import type { StreamRefusal } from '../studioClient.ts';
import type { PlanApproved, PlanDecision, PlanProposed, RetryMode } from '../wire.ts';
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

test('a plan shows its caveats and why it holds each choice; one without caveats shows none', () => {
    const caveat = 'The total counts every provider, the health figure bilateral aid only.';
    const view = planView(planFromFrame(frame({ caveats: [caveat] })));

    assert.deepEqual(view.caveats, [caveat]);
    assert.deepEqual(
        view.choices.map((choice) => choice.reason),
        ['the source publishes this basis'],
    );
    assert.deepEqual(planView(planFromFrame(frame({ caveats: undefined }))).caveats, []);
    assert.deepEqual(planView(planFromFrame(frame({ caveats: null }))).caveats, []);
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
        [
            'asks naming steps out of plan order',
            {
                steps,
                asks: [
                    { ask: 'chart', answered_by: ['s3'] },
                    { ask: 'share', answered_by: ['s1'] },
                ],
            },
            'Chart',
        ],
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

test('a switch announces "Steps updated to match." only when the step labels differ', async (t) => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const cases: [string, Partial<PlanProposed>, boolean][] = [
        ['the same steps', {}, false],
        [
            'the same labels under new ids',
            { steps: [{ id: 's9', label: 'Retrieve health aid' }] },
            false,
        ],
        ['another label', { steps: [{ id: 's1', label: 'Retrieve net health aid' }] }, true],
        [
            'another number of steps',
            {
                steps: [
                    { id: 's1', label: 'Retrieve health aid' },
                    { id: 's2', label: 'Sum across recipients' },
                ],
            },
            true,
        ],
    ];

    for (const [name, overrides, updated] of cases) {
        await t.test(name, () => {
            const fresh = planFromFrame(switchedFrame(overrides), waiting);

            assert.equal(switchOutcome(planView(fresh), fresh).includes(STEPS_UPDATED), updated);
        });
    }

    // A plan no switch produced, and one whose next switch has started, announce nothing.
    const unswitched = planFromFrame(frame({ steps: [{ id: 's1', label: 'Other' }] }));
    const fresh = planFromFrame(switchedFrame({ steps: [{ id: 's1', label: 'Other' }] }), waiting);

    assert.deepEqual(switchOutcome(planView(unswitched), unswitched), []);
    assert.deepEqual(
        switchOutcome(planView(startSwitch(fresh, PICK)), startSwitch(fresh, PICK)),
        [],
    );
});

test('a switch outcome names each changed row and each move, for one live region', () => {
    const fresh = planFromFrame(
        switchedFrame({
            decisions: [basisDecision('measure_basis:net'), sectorDecision('sector:120')],
            moved: [
                {
                    choice_id: 'spec_2:gone',
                    from_label: 'Health and population',
                    to_label: 'Health',
                    reason: 'Net figures cover health alone.',
                },
            ],
        }),
        startSwitch(planFromFrame(frame()), PICK),
    );

    assert.deepEqual(switchOutcome(planView(fresh), fresh), [
        'How is aid counted? is now Net disbursements, changed from Gross disbursements.',
        'Changed from Health and population to Health. Net figures cover health alone.',
    ]);
});

test('a switch back to the first option still announces that the plan updated', () => {
    const v2 = planFromFrame(switchedFrame(), startSwitch(planFromFrame(frame()), PICK));
    const v3 = planFromFrame(
        switchedFrame({ version: 3, decisions: [basisDecision('measure_basis:gross')] }),
        startSwitch(v2, { ...PICK, optionId: 'measure_basis:gross' }),
    );

    assert.deepEqual(switchOutcome(planView(v3), v3), ['Plan updated.']);
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

test('after two switches both rows are Changed from the first plan', () => {
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
    const v3 = planFromFrame(
        switchedFrame({
            interrupt_id: 'int-3',
            version: 3,
            decisions: [basisDecision('measure_basis:net'), sectorDecision('sector:120')],
        }),
        startSwitch(v2, { choiceId: 'spec_1:sector', optionId: 'sector:120' }),
    );

    assert.deepEqual(v3.changed, [
        { choiceId: 'spec_1:measure_basis', from: 'Gross disbursements', reason: null },
        { choiceId: 'spec_1:sector', from: 'Health and population', reason: null },
    ]);
    assert.equal(v3.switched, 'spec_1:sector');
    assert.deepEqual(
        planView(v3).choices.map((choice) => [choice.name, choice.changedFrom]),
        [
            ['How is aid counted?', 'Gross disbursements'],
            ['Sector', 'Health and population'],
        ],
    );
});

test('a plan that drops one of two choices keeps Changed and the focus target', async (t) => {
    const numerator = (active: string) => ({ ...basisDecision(active, 'r1'), id: 'd-num' });
    const denominator = (active: string) => ({ ...basisDecision(active, 'r2'), id: 'd-den' });
    const sector = sectorDecision('sector:120+130', 'r1');
    const gross = 'measure_basis:gross';
    const net = 'measure_basis:net';
    // [name, v1 decisions, the choice switched, v2 decisions, Changed, focus]
    const cases: [string, PlanDecision[], string, PlanDecision[], string[], string][] = [
        [
            'the switched choice survives',
            [numerator(gross), denominator(gross)],
            'r2:measure_basis',
            [denominator(net)],
            ['r2:measure_basis'],
            'r2:measure_basis',
        ],
        [
            // A merged row keeps its first member's id in plan order, so a
            // switch of the second member finds no row of its own and focus
            // goes to the first row, which is the merged one.
            'a merge of the switched choice keeps the first member id, the first row',
            [numerator(gross), denominator(gross)],
            'r2:measure_basis',
            [numerator(net)],
            ['r1:measure_basis'],
            'r1:measure_basis',
        ],
        [
            'the switched choice left the plan',
            [sector, numerator(gross)],
            'r1:measure_basis',
            [sector],
            [],
            'r1:sector',
        ],
    ];

    for (const [name, first, choiceId, second, changed, focus] of cases) {
        await t.test(name, () => {
            const v1 = planFromFrame(frame({ decisions: first }));
            const v2 = planFromFrame(
                switchedFrame({ decisions: second }),
                startSwitch(v1, { choiceId, optionId: net }),
            );

            assert.deepEqual(
                v2.changed.map((change) => [change.choiceId, change.from]),
                changed.map((id) => [id, 'Gross disbursements']),
            );
            assert.equal(v2.switched, focus);
        });
    }
});

test('a choice first shown on a later plan is Changed from what it held there', () => {
    const v1 = planFromFrame(frame({ decisions: [basisDecision('measure_basis:gross', 'r1')] }));
    const v2 = planFromFrame(
        switchedFrame({
            decisions: [
                basisDecision('measure_basis:net', 'r1'),
                sectorDecision('sector:120+130', 'r1'),
            ],
        }),
        startSwitch(v1, { choiceId: 'r1:measure_basis', optionId: 'measure_basis:net' }),
    );
    const v3 = planFromFrame(
        switchedFrame({
            version: 3,
            decisions: [
                basisDecision('measure_basis:net', 'r1'),
                sectorDecision('sector:120', 'r1'),
            ],
        }),
        startSwitch(v2, { choiceId: 'r1:sector', optionId: 'sector:120' }),
    );

    assert.deepEqual(
        v3.changed.map((change) => [change.choiceId, change.from]),
        [
            ['r1:measure_basis', 'Gross disbursements'],
            ['r1:sector', 'Health and population'],
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

test('a choice added on an axis another choice holds is Changed only against itself', () => {
    const v1 = planFromFrame(frame({ decisions: [basisDecision('measure_basis:gross', 'r1')] }));
    const v2 = planFromFrame(
        switchedFrame({
            decisions: [
                basisDecision('measure_basis:net', 'r1'),
                { ...basisDecision('measure_basis:net', 'r2'), id: 'd-new' },
            ],
        }),
        startSwitch(v1, { choiceId: 'r1:measure_basis', optionId: 'measure_basis:net' }),
    );

    assert.deepEqual(
        v2.changed.map((change) => change.choiceId),
        ['r1:measure_basis'],
    );
    assert.equal(v2.baseline['r2:measure_basis']?.optionId, 'measure_basis:net');
    assert.equal(v2.switched, 'r1:measure_basis');
});

test('a moved choice without a row of its own still shows what moved', () => {
    const fresh = planFromFrame(
        switchedFrame({
            decisions: [
                basisDecision('measure_basis:net'),
                { ...sectorDecision('sector:120'), options: [] },
            ],
            moved: [
                {
                    choice_id: 'spec_1:sector',
                    from_label: 'Health and population',
                    to_label: 'Health',
                    reason: 'Net figures cover health alone.',
                },
                {
                    choice_id: 'spec_9:provider',
                    from_label: 'All donors',
                    to_label: 'Bilateral donors',
                    reason: '',
                },
            ],
        }),
        startSwitch(planFromFrame(frame()), PICK),
    );
    const view = planView(fresh);

    assert.deepEqual(
        view.choices.map((choice) => choice.key),
        ['spec_1:measure_basis'],
    );
    assert.deepEqual(view.moved, [
        {
            key: 'spec_1:sector',
            from: 'Health and population',
            to: 'Health',
            reason: 'Net figures cover health alone.',
        },
        { key: 'spec_9:provider', from: 'All donors', to: 'Bilateral donors', reason: null },
    ]);
});

test('switch_failed puts its reason on the row of the choice it names', () => {
    const reason = 'Net figures for 2023 are not published. The plan still counts gross.';
    const failed = {
        choice_id: 'spec_1:measure_basis',
        option_id: 'measure_basis:net',
        code: 'operation_unsupported',
        reason,
    };
    const plan = planFromFrame(frame({ revision: 'rev-c', switch_failed: failed }));

    assert.deepEqual(plan.notice, {
        lead: 'Could not switch to Net disbursements.',
        text: reason,
        retryable: true,
        retryAt: null,
        quiet: false,
        ...PICK,
    });
    assert.equal(
        planFromFrame(frame({ switch_failed: { ...failed, retryable: false } })).notice?.retryable,
        false,
    );
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
            retryAt: null,
            quiet: false,
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

test('a stale refusal keeps the turn baseline, so a choice moved elsewhere is Changed', () => {
    const v1 = planFromFrame(frame());
    const v2 = planFromFrame(switchedFrame(), startSwitch(v1, PICK));
    const waiting = startSwitch(v2, {
        choiceId: PICK.choiceId,
        optionId: 'measure_basis:gross',
    });
    const replaced = refusedSwitch(
        waiting,
        staleRefusal(switchedFrame({ interrupt_id: 'int-3', version: 3, revision: 'rev-c' })),
    );

    assert.deepEqual(replaced.changed, [
        { choiceId: PICK.choiceId, from: 'Gross disbursements', reason: null },
    ]);
    assert.equal(replaced.switched, null);
    assert.equal(replaced.live, true);
});

test('a stale approve is answered with the current card; other refusals are not', () => {
    assert.deepEqual(stalePlan(staleRefusal(currentFrame)), {
        ...planFromFrame(currentFrame),
        notice: {
            lead: null,
            text: STALE_DETAIL,
            retryable: false,
            retryAt: null,
            quiet: false,
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
        retryAt: null,
        quiet: false,
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
    // The same pick would be refused again, so the row offers no Try again.
    assert.deepEqual(refused.notice, {
        lead: 'Could not switch to Net disbursements.',
        text: 'Net disbursements cannot be counted for this plan.',
        retryable: false,
        retryAt: null,
        quiet: false,
        ...PICK,
    });
    assert.equal(refused.revision, 'rev-a');
    assert.equal(canSwitch(refused), true);
});

test('a refusal that leaves the pause alone keeps the card and says on the row why the switch did not apply', async (t) => {
    const plan = startSwitch(planFromFrame(frame()), PICK);
    const toolError = (error: string, retry: RetryMode = 'do_not_retry') => ({
        error: error as 'not_found',
        retry,
        detail: error,
    });
    const generic =
        'Studio could not switch to Net disbursements. The plan still counts Gross disbursements.';
    const lead = 'Could not switch to Net disbursements.';
    // [name, refusal, lead, text, retryable]
    const cases: [string, StreamRefusal, string | null, string, boolean][] = [
        // A detail without a ToolError is written for developers.
        ['a 429', { status: 429, detail: 'Too many requests.', error: null }, null, generic, false],
        ['a 429 without detail', { status: 429, detail: null, error: null }, null, generic, false],
        [
            'a 429 whose ToolError says to retry after a delay',
            {
                status: 429,
                detail: 'Too many requests.',
                error: toolError('rate_limited', 'retry_after_delay'),
            },
            lead,
            'Too many requests.',
            false,
        ],
        [
            'a 409 transient_unavailable',
            {
                status: 409,
                detail: 'busy',
                error: toolError('transient_unavailable', 'retry_after_delay'),
            },
            lead,
            'busy',
            true,
        ],
    ];

    for (const [name, refusal, wantLead, text, retryable] of cases) {
        await t.test(name, () => {
            const refused = refusedSwitch(plan, refusal);

            assert.equal(refused.live, true);
            assert.equal(refused.switching, null);
            assert.deepEqual(refused.notice, {
                lead: wantLead,
                text,
                retryable,
                retryAt: null,
                quiet: false,
                ...PICK,
            });
            assert.equal(
                switchReply(refused, PICK.choiceId, PICK.optionId)?.plan_revision,
                'rev-a',
            );
        });
    }
});

test('a refusal asking to wait offers Try again once its delay has run from its arrival', () => {
    const arrived = 1_000_000;
    const refused = refusedSwitch(
        startSwitch(planFromFrame(frame()), PICK),
        {
            status: 409,
            detail: 'Another turn is running.',
            error: {
                error: 'transient_unavailable',
                retry: 'retry_after_delay',
                detail: 'Another turn is running.',
                retry_after_seconds: 5,
            },
        },
        arrived,
    );

    assert.equal(refused.notice?.retryable, true);
    assert.equal(refused.notice?.retryAt, arrived + 5_000);
});

test('a 429 offers Try again only when its ToolError names a delay to wait out', async (t) => {
    const plan = startSwitch(planFromFrame(frame()), PICK);
    const arrived = 1_000_000;
    const rateLimited = (retry: RetryMode, seconds?: number): StreamRefusal => ({
        status: 429,
        detail: 'Too many requests.',
        error: {
            error: 'rate_limited',
            retry,
            detail: 'Too many requests.',
            ...(seconds !== undefined && { retry_after_seconds: seconds }),
        },
    });
    // [name, refusal, retryable, retryAt]
    const cases: [string, StreamRefusal, boolean, number | null][] = [
        ['a delay', rateLimited('retry_after_delay', 30), true, arrived + 30_000],
        ['retry_after_delay without seconds', rateLimited('retry_after_delay'), false, null],
        ['seconds without retry_after_delay', rateLimited('do_not_retry', 30), false, null],
        ['no ToolError', { status: 429, detail: 'Too many requests.', error: null }, false, null],
    ];

    for (const [name, refusal, retryable, retryAt] of cases) {
        await t.test(name, () => {
            const refused = refusedSwitch(plan, refusal, arrived);

            assert.equal(refused.notice?.retryable, retryable);
            assert.equal(refused.notice?.retryAt, retryAt);
        });
    }
});

test('a refusal the proxy answered itself keeps the card live only where the harness never saw the switch', async (t) => {
    const plan = startSwitch(planFromFrame(frame()), PICK);
    const arrived = 1_000_000;
    const lead = 'Could not switch to Net disbursements.';
    const proxied = (
        status: number,
        proxy: NonNullable<StreamRefusal['proxy']>,
    ): StreamRefusal => ({ status, detail: 'proxy text for developers', error: null, proxy });
    // [name, refusal, live, text, retryable, retryAt]
    const cases: [string, StreamRefusal, boolean, string, boolean, number | null][] = [
        [
            'a rate limit waits out its Retry-After',
            proxied(429, { code: 'rate_limited', upstreamStatus: null, retryAfterSeconds: 12 }),
            true,
            'Studio is busy.',
            true,
            arrived + 12_000,
        ],
        [
            'a rate limit with no Retry-After offers no Try again',
            proxied(429, { code: 'rate_limited', upstreamStatus: null, retryAfterSeconds: null }),
            true,
            'Studio is busy.',
            false,
            null,
        ],
        [
            'a rate limit with a Retry-After of 0 offers no Try again',
            proxied(429, { code: 'rate_limited', upstreamStatus: null, retryAfterSeconds: 0 }),
            true,
            'Studio is busy.',
            false,
            null,
        ],
        [
            'an unreachable harness',
            proxied(502, {
                code: 'transient_unavailable',
                upstreamStatus: null,
                retryAfterSeconds: null,
            }),
            true,
            UNREACHABLE_NOTICE,
            true,
            null,
        ],
        [
            'a harness that answered before the relay failed',
            proxied(502, {
                code: 'transient_unavailable',
                upstreamStatus: 422,
                retryAfterSeconds: null,
            }),
            false,
            'Studio could not switch to Net disbursements. Ask again to change the plan.',
            false,
            null,
        ],
    ];

    for (const [name, refusal, live, text, retryable, retryAt] of cases) {
        await t.test(name, () => {
            const refused = refusedSwitch(plan, refusal, arrived);

            assert.equal(refused.live, live);
            assert.deepEqual(refused.notice, {
                lead: live ? lead : null,
                text,
                retryable,
                retryAt,
                quiet: false,
                ...PICK,
            });
        });
    }
});

test('a refusal that may have used up the pause ends the card read-only, without Try again', async (t) => {
    const plan = startSwitch(planFromFrame(frame()), PICK);
    const toolError = (
        error: string,
        retry: RetryMode = 'do_not_retry',
        constraint_id?: string,
    ) => ({
        error: error as 'not_found',
        retry,
        detail: error,
        ...(constraint_id && { constraint_id }),
    });
    const generic = 'Studio could not switch to Net disbursements. Ask again to change the plan.';
    const cases: [string, StreamRefusal][] = [
        ['a 404', { status: 404, detail: 'The plan is gone.', error: null }],
        [
            'a not_found ToolError',
            {
                status: 410,
                detail: 'The plan is gone.',
                error: toolError('not_found'),
            },
        ],
        ['a 400', { status: 400, detail: 'Bad request.', error: null }],
        ['a 401', { status: 401, detail: 'Sign in again.', error: null }],
        [
            'a 401 whose ToolError says to retry after a delay',
            {
                status: 401,
                detail: 'Sign in again.',
                error: toolError('transient_unavailable', 'retry_after_delay'),
            },
        ],
        ['a 403', { status: 403, detail: 'Forbidden.', error: null }],
        ['a 413', { status: 413, detail: 'Too large.', error: null }],
        [
            'a 422 binding_invalid',
            {
                status: 422,
                detail: 'a plan interrupt takes no answers',
                error: toolError('binding_invalid', 'correct_and_retry'),
            },
        ],
        [
            'a stale constraint on a 422',
            {
                status: 422,
                detail: 'x',
                error: toolError('edit_conflict', 'refresh_then_retry', PLAN_REVISION_STALE),
            },
        ],
        [
            'a 409 resumed with another decision',
            {
                status: 409,
                detail: 'already resumed',
                error: toolError('edit_conflict', 'refresh_then_retry'),
            },
        ],
        ['a 500 with no body', { status: 500, detail: null, error: null }],
        ['a 502 with no body', { status: 502, detail: null, error: null }],
        [
            'a proxy 502 whose text is not a ToolError',
            { status: 502, detail: 'The studio agent is unreachable.', error: null },
        ],
        [
            'a 503 whose ToolError says to retry after a delay',
            {
                status: 503,
                detail: 'Not saved.',
                error: {
                    ...toolError('transient_unavailable', 'retry_after_delay'),
                    retry_after_seconds: 30,
                },
            },
        ],
    ];

    for (const [name, refusal] of cases) {
        await t.test(name, () => {
            const refused = refusedSwitch(plan, refusal);
            // Only a harness ToolError's detail is written for readers.
            const detail = refusal.error && refusal.detail;

            assert.equal(refused.live, false);
            assert.equal(refused.switching, null);
            assert.deepEqual(refused.notice, {
                lead: detail ? 'Could not switch to Net disbursements.' : null,
                text: detail ? `${detail} Ask again to change the plan.` : generic,
                retryable: false,
                retryAt: null,
                quiet: false,
                ...PICK,
            });
            assert.equal(switchReply(refused, PICK.choiceId, PICK.optionId), null);
        });
    }
});

test('a switch that ends without a fresh plan leaves the card read-only, saying to ask again', async (t) => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    // [name, ending, lead, text, quiet]
    const cases: [string, Parameters<typeof endedPlan>[1], string | null, string, boolean][] = [
        [
            'closed',
            {},
            null,
            'Studio could not switch to Net disbursements. Ask again to change the plan.',
            false,
        ],
        [
            'an error',
            { detail: 'The harness stopped.' },
            'Could not switch to Net disbursements.',
            'The harness stopped. Ask again to change the plan.',
            false,
        ],
        [
            'stopped',
            { stopped: true, detail: 'Cancelled.' },
            null,
            'Stopped before switching to Net disbursements. Ask again to change the plan.',
            true,
        ],
    ];

    for (const [name, ending, lead, text, quiet] of cases) {
        await t.test(name, () => {
            const ended = endedPlan(waiting, ending);

            assert.equal(ended.live, false);
            assert.equal(ended.switching, null);
            assert.deepEqual(ended.notice, {
                lead,
                text,
                retryable: false,
                retryAt: null,
                quiet,
                ...PICK,
            });
            assert.equal(canSwitch(ended), false);
            assert.equal(switchReply(ended, PICK.choiceId, PICK.optionId), null);
        });
    }
});

test('a switch stream that ends without a fresh plan closes its Activity entry by how the harness ended it', async (t) => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const harnessError = (error: 'cancelled' | 'transient_unavailable', detail: string) => ({
        error,
        retry: 'do_not_retry' as const,
        detail,
    });
    const gone = refusedSwitch(waiting, {
        status: 404,
        detail: 'The plan is gone.',
        error: { error: 'not_found', retry: 'do_not_retry', detail: 'The plan is gone.' },
    });
    const generic = 'Studio could not switch to Net disbursements. Ask again to change the plan.';
    const stoppedText =
        'Stopped before switching to Net disbursements. Ask again to change the plan.';
    // [name, ending, Activity state, notice text]
    const cases: [string, Parameters<typeof endedSwitch>[1], 'skipped' | 'failed', string][] = [
        ['done with no plan', { error: null, stopped: false, refused: null }, 'failed', generic],
        [
            'a harness error',
            {
                error: harnessError('transient_unavailable', 'Lost.'),
                stopped: false,
                refused: null,
            },
            'failed',
            'Lost. Ask again to change the plan.',
        ],
        [
            'a refusal',
            { error: null, stopped: false, refused: gone },
            'failed',
            'The plan is gone. Ask again to change the plan.',
        ],
        [
            'stopped, then closed',
            { error: null, stopped: true, refused: null },
            'skipped',
            stoppedText,
        ],
        [
            'stopped, then cancelled by the harness',
            { error: harnessError('cancelled', 'Stopped.'), stopped: true, refused: null },
            'skipped',
            stoppedText,
        ],
        [
            'stopped, then a harness error',
            { error: harnessError('transient_unavailable', 'Lost.'), stopped: true, refused: null },
            'failed',
            'Lost. Ask again to change the plan.',
        ],
        [
            // The Stop's cancel reached the harness first, so the switch
            // found no pause.
            'stopped, then a 404',
            { error: null, stopped: true, refused: gone },
            'skipped',
            stoppedText,
        ],
    ];

    for (const [name, ending, activity, text] of cases) {
        await t.test(name, () => {
            const ended = endedSwitch(waiting, ending);

            assert.equal(ended.activity, activity);
            assert.equal(ended.plan.live, false);
            assert.equal(ended.plan.notice?.text, text);
        });
    }
});

test('a switch stopped and re-offered by the harness is live again, with Try again', () => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const reoffered = planFromFrame(
        frame({
            interrupt_id: 'int-2',
            switch_failed: {
                choice_id: PICK.choiceId,
                option_id: PICK.optionId,
                code: SWITCH_CANCELLED,
                reason: 'The switch was stopped. The plan still counts gross.',
                retryable: true,
            },
        }),
        waiting,
    );

    assert.equal(reoffered.live, true);
    assert.equal(reoffered.interruptId, 'int-2');
    // The user stopped it, so the notice is the reason alone, said quietly,
    // with a null lead.
    assert.deepEqual(reoffered.notice, {
        lead: null,
        text: 'The switch was stopped. The plan still counts gross.',
        retryable: true,
        retryAt: null,
        quiet: true,
        ...PICK,
    });
    assert.deepEqual(reoffered.changed, []);
    assert.ok(switchReply(reoffered, PICK.choiceId, PICK.optionId));
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

test('a switch stream that ends with no plan, done or error leaves the card read-only, its row saying so without Try again', () => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const after = switchEnded(pausedTurn(waiting), waiting, endedPlan(waiting));

    assert.equal(after.plan?.switching, null);
    assert.equal(after.plan?.live, false);
    assert.equal(after.plan?.notice?.choiceId, PICK.choiceId);
    assert.equal(after.plan?.notice?.retryable, false);
});

test('a failed switch writes nothing into the paused reply or its Activity entry', () => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const before = pausedTurn(waiting);
    const after = switchEnded(
        before,
        waiting,
        endedPlan(waiting, { detail: 'The harness stopped.' }),
    );

    assert.equal(after.messages, before.messages);
    assert.equal(after.activity, before.activity);
    assert.equal(after.plan?.notice?.text, 'The harness stopped. Ask again to change the plan.');
});

test('a switch that ended after a fresh plan or a refusal leaves the state alone', () => {
    const waiting = startSwitch(planFromFrame(frame()), PICK);
    const replaced = pausedTurn(planFromFrame(switchedFrame(), waiting));

    assert.equal(switchEnded(replaced, waiting, endedPlan(waiting)), replaced);
});

test('the card leads with the title, and with the first ask only when there is no title', async (t) => {
    const asks = [{ ask: 'health share of US ODA in 2023', answered_by: ['s1'] }];
    const cases: [string, Partial<PlanProposed>, string][] = [
        [
            'a summary',
            { title: 'Health share of US aid, 2023', summary: 'Gross.', asks },
            'Health share of US aid, 2023',
        ],
        ['a title and an ask', { title: 'Research plan', asks }, 'Research plan'],
        ['no title, an ask', { title: '', asks }, 'Health share of US ODA in 2023'],
        ['a title alone', { title: 'Research plan' }, 'Research plan'],
    ];

    for (const [name, overrides, title] of cases) {
        await t.test(name, () => {
            assert.equal(planFromFrame(frame(overrides)).title, title);
        });
    }
});

test('a switch that does not apply clears the mark of the switch before it', async (t) => {
    const applied = planFromFrame(switchedFrame(), startSwitch(planFromFrame(frame()), PICK));
    const waiting = startSwitch(applied, {
        choiceId: PICK.choiceId,
        optionId: 'measure_basis:gross',
    });
    const cases: [string, PlanState][] = [
        ['a refusal', refusedSwitch(waiting, { status: 422, detail: 'No.', error: null })],
        ['a gone pause', refusedSwitch(waiting, { status: 404, detail: null, error: null })],
        ['a stream end without a plan', endedPlan(waiting, { detail: 'The harness stopped.' })],
        ['an unreachable harness', unreachableSwitch(waiting)],
        ['a switch stopped before it was sent', stoppedQueuedSwitch(waiting)],
    ];

    assert.equal(applied.switched, PICK.choiceId);

    for (const [name, plan] of cases) {
        await t.test(name, () => {
            assert.equal(plan.switched, null);
        });
    }
});

test('a switch that never reached the harness keeps the card live, with Try again', () => {
    const unreached = unreachableSwitch(startSwitch(planFromFrame(frame()), PICK));

    assert.equal(unreached.live, true);
    assert.equal(unreached.switching, null);
    assert.deepEqual(unreached.notice, {
        lead: 'Could not switch to Net disbursements.',
        text: UNREACHABLE_NOTICE,
        retryable: true,
        retryAt: null,
        quiet: false,
        ...PICK,
    });
    assert.ok(switchReply(unreached, PICK.choiceId, PICK.optionId));
});

test('a switch stopped before its request started keeps the card live, quietly', () => {
    const stopped = stoppedQueuedSwitch(startSwitch(planFromFrame(frame()), PICK));

    assert.equal(stopped.live, true);
    assert.equal(stopped.switching, null);
    assert.deepEqual(stopped.notice, {
        lead: null,
        text: 'Stopped before switching to Net disbursements. The plan still counts Gross disbursements.',
        retryable: true,
        retryAt: null,
        quiet: true,
        ...PICK,
    });
    assert.ok(switchReply(stopped, PICK.choiceId, PICK.optionId));
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

test('an approved plan shows its caveats, and one saved before caveats shows none', () => {
    const caveat = 'The total counts every provider, the health figure bilateral aid only.';

    assert.deepEqual(
        approvedView(approvedFromFrame({ ...approvedFrame, caveats: [caveat] })).caveats,
        [caveat],
    );
    assert.deepEqual(approvedView(approvedFromFrame(approvedFrame)).caveats, []);
    assert.deepEqual(
        approvedView({ ...approvedFromFrame(approvedFrame), caveats: undefined }).caveats,
        [],
    );
});

test('a stored approved plan without steps or choices still gives a view', () => {
    const stored = JSON.parse(
        JSON.stringify({ ...approvedFrame, steps: undefined, choices: undefined }),
    ) as PlanApproved;

    for (const plan of [approvedFromFrame(stored), stored]) {
        const view = approvedView(plan);

        assert.deepEqual(view.steps, []);
        assert.deepEqual(view.choices, []);
        assert.equal(answerStepOf(view), undefined);
    }
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

/** A planner decision the card can switch, as the harness sends it. */
const donorsDecision: PlanDecision = {
    id: 'd3',
    question: 'How many donors?',
    chosen: 'Top 5',
    reason: 'a short list reads best',
    resolved_by: 'default',
    choice_id: 'decision:donor_count',
    active_option_id: 'option_1',
    options: [
        { option_id: 'option_1', label: 'Top 5', status: 'available', reason: null, years: null },
        { option_id: 'option_2', label: 'Top 10', status: 'available', reason: null, years: null },
    ],
};

const DONORS_PICK = { choiceId: 'decision:donor_count', optionId: 'option_2' };

test('the ledger heads scope choices and planner decisions apart', async (t) => {
    const heads = (overrides: Partial<PlanProposed>) =>
        ledgerSections(planView(planFromFrame(frame(overrides)))).map((section) => [
            section.head,
            section.choices.map((choice) => choice.key),
        ]);
    const cases: [string, Partial<PlanProposed>, [string, string[]][]][] = [
        [
            'both',
            { decisions: [countDecision, donorsDecision] },
            [
                [SCOPE_HEAD, ['spec_1:measure_basis']],
                [PLANNER_HEAD, ['decision:donor_count']],
            ],
        ],
        [
            'planner decisions only',
            { decisions: [donorsDecision] },
            [[PLANNER_HEAD, ['decision:donor_count']]],
        ],
        [
            'scope choices only',
            { decisions: [countDecision] },
            [[SCOPE_HEAD, ['spec_1:measure_basis']]],
        ],
    ];

    for (const [name, overrides, expected] of cases) {
        await t.test(name, () => {
            assert.deepEqual(heads(overrides), expected);
        });
    }
});

test("a planner decision's switch says it is replanning", () => {
    assert.equal(switchPendingText(DONORS_PICK.choiceId), 'Replanning');
    assert.equal(switchLine(DONORS_PICK.choiceId, 'Top 10'), 'Replanning with Top 10');
    assert.equal(switchPendingText(PICK.choiceId), 'Updating plan');
    assert.equal(switchLine(PICK.choiceId, 'Net disbursements'), 'Switching to Net disbursements');
});

test("a planner decision's switch that did not apply says the plan keeps its option", () => {
    const waiting = startSwitch(planFromFrame(frame({ decisions: [donorsDecision] })), DONORS_PICK);

    assert.equal(
        stoppedQueuedSwitch(waiting).notice?.text,
        'Stopped before switching to Top 10. The plan keeps Top 5.',
    );
    assert.equal(
        refusedSwitch(waiting, { status: 429, detail: null, error: null }).notice?.text,
        'Studio could not switch to Top 10. The plan keeps Top 5.',
    );
});
