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
    // The approval key a switch echoes; null from a harness that predates it.
    revision: string | null;
    // What the switch that produced this plan changed; empty otherwise.
    moved: PlanMoved[];
    switching: PlanSwitch | null;
    // Why the harness refused the last switch, for the card to say.
    notice: string | null;
};

export type SwitchReply = Required<
    Pick<InterruptResponse, 'decision' | 'choice_id' | 'option_id' | 'plan_revision'>
>;

/** The ToolError `constraint_id` of a switch sent against an older plan. */
export const PLAN_REVISION_STALE = 'plan_revision_stale';

export const STALE_NOTICE =
    'The plan changed before your switch reached it. Check the plan and switch again.';

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

/** The plan after the harness refused its switch: the card keeps the
 *  newest plan this page holds and says why. */
export const refusedSwitch = (plan: PlanState, refusal: StreamRefusal): PlanState => ({
    ...plan,
    switching: null,
    notice:
        refusal.error?.constraint_id === PLAN_REVISION_STALE
            ? STALE_NOTICE
            : (refusal.error?.detail ?? `The switch was refused (HTTP ${refusal.status}).`),
});

/** A plan whose switch ended without a fresh plan (an error, a stop, a turn
 *  that finished) leaves the card; any other plan stays. */
export const settledPlan = (plan: PlanState | null): PlanState | null =>
    plan?.switching ? null : plan;
