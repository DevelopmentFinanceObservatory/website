/**
 * The plan card's state and its `switch`: how a scope decision's options
 * read, which of them the user can pick, the interrupt reply a pick sends,
 * and what the card says when the harness refuses one.
 */

import type { StreamRefusal } from './studioClient';
import type {
    InterruptResponse,
    PlanAction,
    PlanDecision,
    PlanDecisionOption,
    PlanMoved,
    PlanProposed,
    PlanStep,
} from './wire';

/** A switch the user asked for and the harness has not answered yet. */
export type PlanSwitch = { choiceId: string; optionId: string };

/** A plan awaiting the user's approve, amend, reject or switch (the
 *  harness's `plan.proposed` pause). */
export type PlanState = {
    title: string;
    steps: PlanStep[];
    decisions: PlanDecision[];
    version: number;
    actions: PlanAction[];
    interruptId: string;
    // The approval key a switch echoes, null from a harness that predates it.
    revision: string | null;
    // What the switch that produced this plan changed, empty otherwise.
    moved: PlanMoved[];
    switching: PlanSwitch | null;
    // Why the harness refused the last switch, for the card to say.
    notice: string | null;
};

export type SwitchReply = Required<
    Pick<InterruptResponse, 'decision' | 'choice_id' | 'option_id' | 'plan_revision'>
>;

/** The ToolError `constraint_id` of a switch or approve sent against an
 *  older plan. */
export const PLAN_REVISION_STALE = 'plan_revision_stale';

/** Shown when a stale refusal carries no current plan (a pause the harness
 *  stored before it kept cards). */
export const STALE_NOTICE =
    'This plan changed after this page received it, so it can no longer be switched here. Reload the conversation to see the current plan.';

export const planFromFrame = (frame: PlanProposed): PlanState => ({
    title: frame.title,
    steps: frame.steps,
    decisions: frame.decisions ?? [],
    version: frame.version,
    actions: frame.actions,
    interruptId: frame.interrupt_id,
    revision: frame.revision ?? null,
    moved: frame.moved ?? [],
    switching: null,
    notice: null,
});

/** The plan offers switching: it lists the action and carries the revision
 *  a switch must echo. */
export const canSwitch = (plan: PlanState): boolean =>
    plan.actions.includes('switch') && plan.revision !== null;

/** A decision's switchable options, or null for an ordinary decision. */
export const switchOptions = (decision: PlanDecision): PlanDecisionOption[] | null =>
    decision.choice_id && decision.options && decision.options.length > 0 ? decision.options : null;

/** The option the plan counts by now: `active_option_id`, else the option
 *  whose label is the decision's `chosen`. */
export const isActiveOption = (decision: PlanDecision, option: PlanDecisionOption): boolean =>
    decision.active_option_id
        ? option.option_id === decision.active_option_id
        : option.label === decision.chosen;

/** The option can be switched to: offered as available or partial, and not
 *  already active. */
export const isSelectable = (decision: PlanDecision, option: PlanDecisionOption): boolean =>
    option.status !== 'unavailable' && !isActiveOption(decision, option);

/** Year ranges as the card prints them: "2015–2019, 2022". */
export const yearsText = (years: readonly (readonly [number, number])[]): string =>
    years.map(([first, last]) => (first === last ? `${first}` : `${first}–${last}`)).join(', ');

export const movedSentence = (moved: PlanMoved): string =>
    `${moved.from_label} changed to ${moved.to_label}. ${moved.reason}`.trim();

/**
 * The interrupt reply that switches `choiceId` to `optionId`, or null when
 * the plan offers no such switch: switching is off, another switch is in
 * flight, or the option is unknown, unavailable or already active.
 */
export const switchReply = (
    plan: PlanState,
    choiceId: string,
    optionId: string,
): SwitchReply | null => {
    if (!canSwitch(plan) || plan.switching || plan.revision === null) {
        return null;
    }

    const decision = plan.decisions.find((candidate) => candidate.choice_id === choiceId);
    const option = decision?.options?.find((candidate) => candidate.option_id === optionId);

    if (!decision || !option || !isSelectable(decision, option)) {
        return null;
    }

    return {
        decision: 'switch',
        choice_id: choiceId,
        option_id: optionId,
        plan_revision: plan.revision,
    };
};

/** The plan while its switch is in flight: the card stays, its controls
 *  wait, and an earlier refusal's notice goes. */
export const startSwitch = (plan: PlanState, pick: PlanSwitch): PlanState => ({
    ...plan,
    switching: pick,
    notice: null,
});

const isStale = (refusal: StreamRefusal): boolean =>
    refusal.error?.constraint_id === PLAN_REVISION_STALE;

/** The constraint_id of a switch the harness refused because the plan does
 *  not offer the option. */
export const SWITCH_OPTION_UNAVAILABLE = 'switch_option_unavailable';

/** The card a stale switch or approve is answered with, the harness's
 *  current plan, saying why it replaced the one the user answered. Null for
 *  any other refusal, or a stale one without a current plan. */
export const stalePlan = (refusal: StreamRefusal): PlanState | null => {
    const current = isStale(refusal) ? refusal.error?.current_plan : null;

    return current ? { ...planFromFrame(current), notice: refusal.detail } : null;
};

/**
 * The card after the harness refused its switch, saying why, or null when
 * the refusal is not one the harness gives a switch. Those are a 409
 * `plan_revision_stale` and a 422 `switch_option_unavailable`; any other
 * status (a 404 for an interrupt that is gone, 401, 429, 5xx) is a failed
 * request, and the pause it answered is over.
 *
 * A stale revision brings the current plan, and switching works again on
 * it. Without one the card keeps its revision, so an approve from it is
 * refused as stale, and drops the switch action.
 */
export const refusedSwitch = (plan: PlanState, refusal: StreamRefusal): PlanState | null => {
    const constraint = refusal.error?.constraint_id;

    if (refusal.status === 409 && constraint === PLAN_REVISION_STALE) {
        return (
            stalePlan(refusal) ?? {
                ...plan,
                actions: plan.actions.filter((action) => action !== 'switch'),
                switching: null,
                notice: STALE_NOTICE,
            }
        );
    }

    if (refusal.status === 422 && constraint === SWITCH_OPTION_UNAVAILABLE) {
        return { ...plan, switching: null, notice: refusal.detail };
    }

    return null;
};

/** An `approve` of `plan`, carrying its revision so the harness can tell an
 *  approval from an out-of-date card. */
export const approveReply = (
    plan: PlanState | undefined,
): Pick<InterruptResponse, 'decision' | 'plan_revision'> =>
    plan?.revision
        ? { decision: 'approve', plan_revision: plan.revision }
        : { decision: 'approve' };

/** A plan whose switch ended without a fresh plan (an error, a stop, a turn
 *  that finished) leaves the card. Any other plan stays. */
export const settledPlan = (plan: PlanState | null): PlanState | null =>
    plan?.switching ? null : plan;
