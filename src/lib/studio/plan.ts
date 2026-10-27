/**
 * The plan card's state and its `switch`: how a scope decision's options
 * read, which of them the user can pick, the interrupt reply a pick sends,
 * what the card says when a switch does not apply, and the approved plan the
 * answer keeps.
 */

import type { StreamRefusal } from './studioClient';
import type {
    InterruptResponse,
    PlanAction,
    PlanApproved,
    PlanDecision,
    PlanDecisionOption,
    PlanMoved,
    PlanProposed,
    PlanStep,
    PlanSwitchFailed,
} from './wire';

/** A switch the user asked for and the harness has not answered yet. */
export type PlanSwitch = { choiceId: string; optionId: string };

/** Why the last answer to the plan did not apply. A notice about a switch
 *  names the choice and option it was for, so the card says it on that
 *  choice's row and can try the option again; a notice about the whole plan
 *  (a stale card) names neither. */
export type PlanNotice = {
    // A short first line naming the option ("Could not switch to net
    // disbursements."), null when `text` says it all.
    lead: string | null;
    text: string;
    // Whether picking the option again could apply; false where the refusal
    // would repeat (an option Search cannot serve, signed out, rate limited)
    // and on a card that is no longer live.
    retryable: boolean;
    choiceId: string | null;
    optionId: string | null;
};

/** A scope choice whose option differs from the first plan of the turn:
 *  the label it held there, and why it moved when the harness said. */
export type PlanChange = { choiceId: string; from: string; reason: string | null };

/** The option each scope choice held on the first plan of the turn that
 *  showed it, by `choice_id`. */
export type PlanBaseline = Record<string, { optionId: string | null; label: string }>;

/** A plan awaiting the user's approve, amend, reject or switch (the
 *  harness's `plan.proposed` pause). */
export type PlanState = {
    // What the card leads with: the harness's title when it sends a summary
    // (a harness that writes the title from the question), else the first
    // question the user asked, else the title.
    title: string;
    // One sentence saying what the plan counts, null from a harness that
    // predates it.
    summary: string | null;
    steps: PlanStep[];
    // The step whose result answers the question.
    answerStepId: string | null;
    decisions: PlanDecision[];
    version: number;
    actions: PlanAction[];
    interruptId: string;
    // The pause the harness sent is still waiting on the user, so the card's
    // controls answer it. False once a switch ended without the harness
    // offering a plan again: the turn ended, and the card stays read-only.
    live: boolean;
    // The approval key a switch echoes, null from a harness that predates it.
    revision: string | null;
    // What the scope choices held on the first plan of the turn, and the
    // ones that hold another option now.
    baseline: PlanBaseline;
    changed: PlanChange[];
    // The choice whose switch applied and produced this plan, null
    // otherwise.
    switched: string | null;
    switching: PlanSwitch | null;
    notice: PlanNotice | null;
};

/** The plan the user approved, as the answer it produced keeps it. */
export type ApprovedPlan = Omit<PlanApproved, 'event' | 'seq'>;

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

/** The step that answers the question: the one the harness flags, else
 *  the last step answering an ask, else the last step. */
const answerStep = (frame: PlanProposed): string | null => {
    const ids = new Set(frame.steps.map((step) => step.id));
    const flagged = frame.steps.find((step) => step.gives_answer);
    const answering = (frame.asks ?? [])
        .flatMap((ask) => ask.answered_by ?? [])
        .filter((id) => ids.has(id));

    return flagged?.id ?? answering.at(-1) ?? frame.steps.at(-1)?.id ?? null;
};

/** The label of the option a scope decision counts by. */
export const activeLabel = (decision: PlanDecision): string =>
    decision.options?.find((option) => isActiveOption(decision, option))?.label ?? decision.chosen;

/** The label of one option of a scope choice, or null when the plan has no
 *  such option. */
export const optionLabel = (
    decisions: PlanDecision[],
    choiceId: string,
    optionId: string,
): string | null =>
    decisions
        .find((decision) => decision.choice_id === choiceId)
        ?.options?.find((option) => option.option_id === optionId)?.label ?? null;

/** "Could not switch to net disbursements." */
const couldNotSwitch = (label: string | null): string =>
    `Could not switch to ${label ?? 'that option'}.`;

const axisOf = (choiceId: string): string => choiceId.slice(choiceId.lastIndexOf(':') + 1);

/**
 * The id among `ids` that is the scope choice `choiceId`: itself, else, from
 * a harness that builds `choice_id` from a spec a switch can re-pin, the one
 * id of its axis. Null when no id, or several, match.
 */
const sameChoice = (choiceId: string, ids: readonly string[]): string | null => {
    if (ids.includes(choiceId)) {
        return choiceId;
    }

    const axis = axisOf(choiceId);
    const matches = ids.filter((id) => axisOf(id) === axis);

    return matches.length === 1 ? matches[0]! : null;
};

/** The switchable scope choices of `decisions`, by `choice_id`. */
const switchable = (decisions: PlanDecision[]): Map<string, PlanDecision> =>
    new Map(
        decisions.flatMap((decision) =>
            decision.choice_id && switchOptions(decision) ? [[decision.choice_id, decision]] : [],
        ),
    );

const activeOptionId = (decision: PlanDecision): string | null =>
    decision.options?.find((option) => isActiveOption(decision, option))?.option_id ?? null;

/**
 * The baseline after a plan showing `decisions`: `previous` as it was, plus
 * what each choice it does not hold yet holds now.
 */
const baselineWith = (decisions: PlanDecision[], previous: PlanBaseline = {}): PlanBaseline => {
    const known = Object.keys(previous);
    const added = [...switchable(decisions)].flatMap(([choiceId, decision]) =>
        sameChoice(choiceId, known)
            ? []
            : [[choiceId, { optionId: activeOptionId(decision), label: activeLabel(decision) }]],
    );

    return { ...previous, ...Object.fromEntries(added) };
};

/**
 * The scope choices that hold another option than on the first plan of the
 * turn that showed them, with the label they held there and the harness's
 * reason for the ones it says moved. A choice switched back to its first
 * option is unchanged.
 */
const changesSince = (
    baseline: PlanBaseline,
    decisions: PlanDecision[],
    moved: PlanMoved[],
): PlanChange[] => {
    const known = Object.keys(baseline);

    return [...switchable(decisions)].flatMap(([choiceId, decision]) => {
        const key = sameChoice(choiceId, known);
        const first = key ? baseline[key] : undefined;
        const optionId = activeOptionId(decision);
        const same =
            first?.optionId && optionId
                ? first.optionId === optionId
                : first?.label === activeLabel(decision);

        if (!first || same) {
            return [];
        }

        const said = moved.find((entry) => entry.choice_id === choiceId);

        return [{ choiceId, from: first.label, reason: said?.reason || null }];
    });
};

/** The choice of `decisions` that is the one `previous` was switching, for
 *  focus to return to; the first row when the switch took it off the plan. */
const switchedChoice = (previous: PlanState, decisions: PlanDecision[]): string | null => {
    const pick = previous.switching;
    const ids = [...switchable(decisions).keys()];

    return pick ? (sameChoice(pick.choiceId, ids) ?? ids[0] ?? null) : null;
};

/** The harness's word on a switch that did not apply: a lead naming the
 *  option, then its reason. */
const switchFailedNotice = (decisions: PlanDecision[], failed: PlanSwitchFailed): PlanNotice => ({
    lead: couldNotSwitch(optionLabel(decisions, failed.choice_id, failed.option_id)),
    text: failed.reason,
    // A harness that predates `retryable` leaves it out.
    retryable: failed.retryable ?? true,
    choiceId: failed.choice_id,
    optionId: failed.option_id,
});

/** The question the plan answers as a headline: its first letter raised. */
const headline = (frame: PlanProposed): string => {
    if (frame.summary) {
        return frame.title;
    }

    const ask = frame.asks?.[0]?.ask.trim();

    return ask ? ask.charAt(0).toUpperCase() + ask.slice(1) : frame.title;
};

/**
 * The card for a `plan.proposed` frame. `previous` is the plan the turn
 * offered before it (the waiting card of a switch, a plan amended, or the
 * card a stale answer was sent from): its baseline carries over, so the card
 * marks every choice that holds another option than on the turn's first
 * plan. A frame carrying `switch_failed` says why on the row of the choice
 * it names.
 */
export const planFromFrame = (frame: PlanProposed, previous?: PlanState): PlanState => {
    const decisions = frame.decisions ?? [];
    const failed = frame.switch_failed;
    const baseline = baselineWith(decisions, previous?.baseline);

    return {
        title: headline(frame),
        summary: frame.summary || null,
        steps: frame.steps,
        answerStepId: answerStep(frame),
        decisions,
        version: frame.version,
        actions: frame.actions,
        interruptId: frame.interrupt_id,
        live: true,
        revision: frame.revision ?? null,
        baseline,
        changed: changesSince(baseline, decisions, frame.moved ?? []),
        switched: previous && !failed ? switchedChoice(previous, decisions) : null,
        switching: null,
        notice: failed ? switchFailedNotice(decisions, failed) : null,
    };
};

/** The plan offers switching: it is live, lists the action and carries the
 *  revision a switch must echo. */
export const canSwitch = (plan: PlanState): boolean =>
    plan.live && plan.actions.includes('switch') && plan.revision !== null;

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
 *  current plan, saying why it replaced `previous`, the one the user
 *  answered, whose baseline it keeps. Null for any other refusal, or a stale
 *  one without a current plan. */
export const stalePlan = (refusal: StreamRefusal, previous?: PlanState): PlanState | null => {
    const current = isStale(refusal) ? refusal.error?.current_plan : null;

    return current
        ? {
              ...planFromFrame(current, previous && { ...previous, switching: null }),
              notice: {
                  lead: null,
                  text: refusal.detail ?? STALE_NOTICE,
                  retryable: false,
                  choiceId: null,
                  optionId: null,
              },
          }
        : null;
};

/**
 * Why a switch did not apply. With the harness's `detail`, a lead naming the
 * option and the detail under it; without one, the card's own words: what
 * the user picked, and what the plan still counts.
 */
const unappliedNotice = (
    plan: PlanState,
    pick: PlanSwitch,
    { detail = null, retryable = true }: { detail?: string | null; retryable?: boolean } = {},
): PlanNotice => {
    const picked = optionLabel(plan.decisions, pick.choiceId, pick.optionId);
    const decision = plan.decisions.find((candidate) => candidate.choice_id === pick.choiceId);
    const still = decision ? ` The plan still counts ${activeLabel(decision)}.` : '';

    return {
        lead: detail ? couldNotSwitch(picked) : null,
        text: detail || `Studio could not switch to ${picked ?? 'that option'}.${still}`,
        retryable,
        choiceId: pick.choiceId,
        optionId: pick.optionId,
    };
};

// Refusals without a ToolError that a second try would meet again: signed
// out, rate limited.
const UNRETRYABLE = new Set([401, 429]);

/** Picking the option again could apply: the ToolError says to retry after a
 *  delay, or a refusal without one is not of a kind that repeats. */
const retryableRefusal = (refusal: StreamRefusal): boolean =>
    refusal.error ? refusal.error.retry === 'retry_after_delay' : !UNRETRYABLE.has(refusal.status);

/**
 * The card after the harness refused its switch. The card always stays.
 *
 * A 409 `plan_revision_stale` brings the current plan, and switching works
 * again on it. Without one the card keeps its revision, so an approve from it
 * is refused as stale, and drops the switch action. Any other refusal (a 422
 * `switch_option_unavailable` among them) says on the choice's row that the
 * switch did not apply, with the harness's detail when it gave one. It
 * offers "Try again" only where a second try could apply: a ToolError whose
 * `retry` is `retry_after_delay`, or a refusal without one other than a 401
 * or 429.
 */
export const refusedSwitch = (plan: PlanState, refusal: StreamRefusal): PlanState => {
    const constraint = refusal.error?.constraint_id;
    const pick = plan.switching;
    const settled = { ...plan, switching: null };

    if (refusal.status === 409 && constraint === PLAN_REVISION_STALE) {
        return (
            stalePlan(refusal, plan) ?? {
                ...settled,
                actions: plan.actions.filter((action) => action !== 'switch'),
                notice: {
                    lead: null,
                    text: STALE_NOTICE,
                    retryable: false,
                    choiceId: null,
                    optionId: null,
                },
            }
        );
    }

    if (!pick) {
        return settled;
    }

    return {
        ...settled,
        notice: unappliedNotice(plan, pick, {
            detail: refusal.detail,
            retryable: retryableRefusal(refusal),
        }),
    };
};

/** An `approve` of `plan`, carrying its revision so the harness can tell an
 *  approval from an out-of-date card. */
export const approveReply = (
    plan: PlanState | undefined,
): Pick<InterruptResponse, 'decision' | 'plan_revision'> =>
    plan?.revision
        ? { decision: 'approve', plan_revision: plan.revision }
        : { decision: 'approve' };

const ASK_AGAIN = 'Ask again to change the plan.';

/** How a switch's stream ended without a plan: the error's `detail` when it
 *  sent one, and whether the user stopped it. */
export type SwitchEnding = { detail?: string | null; stopped?: boolean };

/**
 * The card once a switch's stream ended without the harness offering a plan
 * again (it broke, sent an error, closed, or was stopped and the harness did
 * not re-offer). The turn has ended, so the card stays read-only, saying in
 * one line on the choice's row that the switch did not apply and to ask
 * again.
 */
export const endedPlan = (plan: PlanState, { detail, stopped }: SwitchEnding = {}): PlanState => {
    const pick = plan.switching;
    const picked =
        (pick && optionLabel(plan.decisions, pick.choiceId, pick.optionId)) ?? 'that option';
    const said = !stopped && detail;

    return {
        ...plan,
        live: false,
        switching: null,
        notice: {
            lead: said ? couldNotSwitch(picked) : null,
            text: stopped
                ? `Stopped before switching to ${picked}. ${ASK_AGAIN}`
                : `${said || `Studio could not switch to ${picked}.`} ${ASK_AGAIN}`,
            retryable: false,
            choiceId: pick?.choiceId ?? null,
            optionId: pick?.optionId ?? null,
        },
    };
};

/**
 * The conversation once a switch's stream ended without a fresh plan: the
 * waiting card turns read-only with its notice (endedPlan) and the chat line
 * clears. The paused reply and the Activity record are left as they were
 * (the caller closes the Activity entry). A state whose card is not the
 * waiting one (a fresh plan or a refusal replaced it) is returned as is.
 */
export const switchEnded = <
    TState extends {
        plan: PlanState | null;
        thinking: boolean;
        status: string | null;
        statusDetail: string | null;
        statusSince: number | null;
        stalled: boolean;
    },
>(
    state: TState,
    waiting: PlanState,
    ending?: SwitchEnding,
): TState =>
    state.plan === waiting
        ? {
              ...state,
              plan: endedPlan(waiting, ending),
              thinking: false,
              status: null,
              statusDetail: null,
              statusSince: null,
              stalled: false,
          }
        : state;

/** The approved plan an answer keeps, from its `plan.approved` frame. */
export const approvedFromFrame = (frame: PlanApproved): ApprovedPlan => ({
    plan_version_id: frame.plan_version_id,
    version: frame.version,
    revision: frame.revision ?? null,
    title: frame.title,
    summary: frame.summary ?? null,
    steps: frame.steps,
    choices: frame.choices,
    caveats: frame.caveats ?? [],
});

/** The transcript with `plan` kept on the reply the approve resumed: the
 *  last bot message, which the resumed stream writes into. */
export const withApprovedPlan = <TMessage extends { role: string }>(
    messages: TMessage[],
    plan: ApprovedPlan,
): TMessage[] => {
    const last = messages.at(-1);

    return last?.role === 'bot' ? [...messages.slice(0, -1), { ...last, plan }] : messages;
};

// --- What the card and the modal read --------------------------------------

export type PlanStepView = {
    key: string;
    label: string;
    description: string | null;
    givesAnswer: boolean;
};

/** One scope choice as a row: its name, the value it holds, what it held
 *  before a switch, and the decision behind it when the row can switch. */
export type PlanChoiceView = {
    key: string;
    name: string;
    value: string;
    changedFrom: string | null;
    changedReason: string | null;
    decision: PlanDecision | null;
};

export type PlanOtherView = { key: string; question: string; chosen: string; reason: string };

/** A plan as the card and the modal show it, live or approved. */
export type PlanView = {
    title: string;
    version: number;
    summary: string | null;
    steps: PlanStepView[];
    choices: PlanChoiceView[];
    others: PlanOtherView[];
    // What qualifies the answer, one reader sentence each (an approved
    // plan's).
    caveats: string[];
};

export const planView = (plan: PlanState): PlanView => {
    const choices: PlanChoiceView[] = [];
    const others: PlanOtherView[] = [];

    for (const decision of plan.decisions) {
        const choiceId = switchOptions(decision) && decision.choice_id;

        if (choiceId) {
            const change = plan.changed.find((entry) => entry.choiceId === choiceId);

            choices.push({
                key: choiceId,
                name: decision.question,
                value: activeLabel(decision),
                changedFrom: change?.from ?? null,
                changedReason: change?.reason ?? null,
                decision,
            });
        } else {
            others.push({
                key: decision.id,
                question: decision.question,
                chosen: decision.chosen,
                reason: decision.reason,
            });
        }
    }

    return {
        title: plan.title,
        version: plan.version,
        summary: plan.summary,
        steps: plan.steps.map((step) => ({
            key: step.id,
            label: step.label,
            description: step.description || null,
            givesAnswer: step.id === plan.answerStepId,
        })),
        choices,
        others,
        caveats: [],
    };
};

export const approvedView = (plan: ApprovedPlan): PlanView => {
    const flagged = plan.steps.findIndex((step) => step.gives_answer);
    const answer = flagged >= 0 ? flagged : plan.steps.length - 1;

    return {
        title: plan.title,
        version: plan.version,
        summary: plan.summary || null,
        steps: plan.steps.map((step, index) => ({
            key: String(index),
            label: step.label,
            description: null,
            givesAnswer: index === answer,
        })),
        choices: plan.choices.map((choice, index) => ({
            key: String(index),
            name: choice.question,
            value: choice.chosen,
            changedFrom: choice.changed_from || null,
            changedReason: null,
            decision: null,
        })),
        others: [],
        // A plan saved before the harness sent caveats has none.
        caveats: plan.caveats ?? [],
    };
};

/** The step whose result answers the question. */
export const answerStepOf = (view: PlanView): PlanStepView | undefined =>
    view.steps.find((step) => step.givesAnswer);

export const stepCount = (count: number): string => `${count} ${count === 1 ? 'step' : 'steps'}`;
