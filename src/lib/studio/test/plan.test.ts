/**
 * The plan card's switch: the reply a pick sends, the picks the card
 * refuses before sending, and the card after a refusal or a fresh plan.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PLAN_REVISION_STALE,
    approveReply,
    canSwitch,
    STALE_NOTICE,
    SWITCH_OPTION_UNAVAILABLE,
    isActiveOption,
    isSelectable,
    movedSentence,
    planFromFrame,
    refusedSwitch,
    settledPlan,
    stalePlan,
    startSwitch,
    switchReply,
    yearsText,
} from '../plan.ts';
import type { StreamRefusal } from '../studioClient.ts';
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

    assert.deepEqual(replaced, { ...planFromFrame(currentFrame), notice: STALE_DETAIL });
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
        notice: STALE_DETAIL,
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

    assert.ok(refused);
    assert.equal(refused.switching, null);
    assert.equal(refused.notice, STALE_NOTICE);
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

    assert.ok(refused);
    assert.equal(refused.switching, null);
    assert.equal(refused.notice, 'Net disbursements cannot be counted for this plan.');
    assert.equal(refused.revision, 'rev-a');
    assert.equal(canSwitch(refused), true);
});

test('a refusal the harness does not give a switch is a failed request, with no card', async (t) => {
    const plan = startSwitch(planFromFrame(frame()), {
        choiceId: 'spec_1:measure_basis',
        optionId: 'measure_basis:net',
    });
    const toolError = (error: string, constraint_id?: string) => ({
        error: error as 'not_found',
        retry: 'do_not_retry' as const,
        detail: error,
        ...(constraint_id && { constraint_id }),
    });
    const cases: [string, StreamRefusal][] = [
        [
            'a 404 for an interrupt that is gone',
            { status: 404, detail: 'gone', error: toolError('not_found') },
        ],
        ['a 401', { status: 401, detail: 'Sign in again.', error: null }],
        ['a 429', { status: 429, detail: null, error: null }],
        ['a 502', { status: 502, detail: null, error: null }],
        [
            'a 409 transient_unavailable',
            { status: 409, detail: 'busy', error: toolError('transient_unavailable') },
        ],
        [
            'a 422 binding_invalid',
            { status: 422, detail: 'bad', error: toolError('binding_invalid') },
        ],
        [
            'a stale constraint on a 422',
            { status: 422, detail: 'x', error: toolError('edit_conflict', PLAN_REVISION_STALE) },
        ],
    ];

    for (const [name, refusal] of cases) {
        await t.test(name, () => {
            assert.equal(refusedSwitch(plan, refusal), null);
        });
    }
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
