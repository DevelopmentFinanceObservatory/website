/**
 * The plan card's switch: the reply a pick sends, the picks the card
 * refuses before sending, and the card after a refusal or a fresh plan.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PLAN_REVISION_STALE,
    STALE_NOTICE,
    isActiveOption,
    isSelectable,
    movedSentence,
    planFromFrame,
    refusedSwitch,
    settledPlan,
    startSwitch,
    switchReply,
    yearsText,
} from '../plan.ts';
import type { PlanDecision, PlanProposed } from '../wire.ts';

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

test('planFromFrame keeps the revision and what moved', () => {
    const moved = [
        {
            choice_id: 'spec_1:measure_basis',
            from_label: 'Gross disbursements',
            to_label: 'Net disbursements',
            reason: 'Repayments are now subtracted.',
        },
    ];
    const plan = planFromFrame(frame({ revision: 'rev-b', moved }));

    assert.equal(plan.revision, 'rev-b');
    assert.deepEqual(plan.moved, moved);
    assert.equal(plan.switching, null);
    assert.equal(plan.notice, null);
});

test('planFromFrame reads a harness without revision or moved as none', () => {
    const plan = planFromFrame(frame({ revision: undefined, moved: undefined }));

    assert.equal(plan.revision, null);
    assert.deepEqual(plan.moved, []);
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

test('a stale revision keeps the card and asks the user to check the plan', () => {
    const plan = startSwitch(planFromFrame(frame()), {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });
    const refused = refusedSwitch(plan, {
        status: 409,
        error: {
            error: 'edit_conflict',
            retry: 'refresh_then_retry',
            detail: 'plan revision rev-a is not the pending plan',
            constraint_id: PLAN_REVISION_STALE,
        },
    });

    assert.equal(refused.switching, null);
    assert.equal(refused.notice, STALE_NOTICE);
    assert.equal(refused.revision, 'rev-a');
    assert.notEqual(switchReply(refused, 'spec_1:measure_basis', 'measure_basis:net'), null);
});

test('an unavailable option keeps the card and shows the harness reason', () => {
    const plan = startSwitch(planFromFrame(frame()), {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });
    const refused = refusedSwitch(plan, {
        status: 422,
        error: {
            error: 'binding_invalid',
            retry: 'correct_and_retry',
            detail: 'Net disbursements are not published for 2020.',
            constraint_id: 'switch_option_unavailable',
        },
    });

    assert.equal(refused.switching, null);
    assert.equal(refused.notice, 'Net disbursements are not published for 2020.');
});

test('a refusal without a ToolError body names the status', () => {
    const refused = refusedSwitch(planFromFrame(frame()), { status: 502, error: null });

    assert.equal(refused.notice, 'The switch was refused (HTTP 502).');
});

test('a fresh plan after a switch replaces the waiting card with what moved', () => {
    const waiting = startSwitch(planFromFrame(frame()), {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });
    const fresh = planFromFrame(
        frame({
            interrupt_id: 'int-2',
            version: 2,
            revision: 'rev-b',
            moved: [
                {
                    choice_id: 'spec_1:measure_basis',
                    from_label: 'Gross disbursements',
                    to_label: 'Net disbursements',
                    reason: 'Repayments are now subtracted.',
                },
            ],
        }),
    );

    assert.equal(waiting.switching?.optionId, 'measure_basis:net');
    assert.equal(fresh.switching, null);
    assert.deepEqual(fresh.moved.map(movedSentence), [
        'Gross disbursements changed to Net disbursements. Repayments are now subtracted.',
    ]);
    assert.equal(
        switchReply(fresh, 'spec_1:measure_basis', 'measure_basis:net')?.plan_revision,
        'rev-b',
    );
});

test('a switch that ends without a fresh plan drops the card; other plans stay', () => {
    const plan = planFromFrame(frame());
    const waiting = startSwitch(plan, {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });

    assert.equal(settledPlan(waiting), null);
    assert.equal(settledPlan(plan), plan);
    assert.equal(settledPlan(null), null);
});

test('yearsText joins ranges and prints a one-year range once', () => {
    assert.equal(yearsText(countDecision.options![1]!.years!), '2015–2019, 2022');
});
