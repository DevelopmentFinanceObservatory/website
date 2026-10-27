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
    // Seconds the harness asked to wait before picking the option again;
    // "Try again" shows once they pass. Null to offer it at once.
    retryAfter: number | null;
    // An outcome the user chose (a switch they stopped), said without error
    // styling.
    quiet: boolean;
    choiceId: string | null;
    optionId: string | null;
};

/** A notice: `text`, and by default no lead, no "Try again", and no
 *  choice. */
export const planNotice = ({
    text,
    lead = null,
    retryable = false,
    retryAfter = null,
    quiet = false,
    choiceId = null,
    optionId = null,
}: Partial<PlanNotice> & { text: string }): PlanNotice => ({
    lead,
    text,
    retryable,
    retryAfter,
    quiet,
    choiceId,
    optionId,
});

/** A scope choice whose option differs from the first plan of the turn:
 *  the label it held there, and why it moved when the harness said. */
export type PlanChange = { choiceId: string; from: string; reason: string | null };

/** The option each scope choice held on the first plan of the turn that
 *  showed it, by `choice_id`. */
export type PlanBaseline = Record<string, { optionId: string | null; label: string }>;

/** A plan awaiting the user's approve, amend, reject or switch (the
 *  harness's `plan.proposed` pause). */
export type PlanState = {
    // What the card leads with: the harness's title, else the first question
    // the user asked.
    title: string;
    // One sentence saying what the plan counts, null from a harness that
    // predates it.
    summary: string | null;
    steps: PlanStep[];
    // The step whose result answers the question.
    answerStepId: string | null;
    decisions: PlanDecision[];
    // What qualifies the answer, one reader sentence each; empty from a
    // harness that predates them.
    caveats: string[];
    // What the switch moved on a choice the card shows no row for (one
    // without options, or one the plan does not list).
    movedElsewhere: PlanMoved[];
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
    // otherwise and once another switch starts.
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
 *  the last step in plan order that answers an ask, else the last step. */
const answerStep = (frame: PlanProposed): string | null => {
    const answering = new Set((frame.asks ?? []).flatMap((ask) => ask.answered_by ?? []));
    const step =
        frame.steps.find((candidate) => candidate.gives_answer) ??
        frame.steps.findLast((candidate) => answering.has(candidate.id)) ??
        frame.steps.at(-1);

    return step?.id ?? null;
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

/** The `switch_failed.code` of a switch the user stopped through `/cancel`,
 *  re-offering the unchanged plan. */
export const SWITCH_CANCELLED = 'switch_cancelled';

/** The notice of a switch that never reached the harness: the pause still
 *  waits, so picking the option again can apply. */
export const UNREACHABLE_NOTICE = 'Studio could not be reached.';

const ASK_AGAIN = 'Ask again to change the plan.';

/** "Could not switch to net disbursements." */
const couldNotSwitch = (label: string): string => `Could not switch to ${label}.`;

/** The switchable scope choices of `decisions`, by `choice_id`. A choice
 *  keeps its id across a conversation's switches. */
const switchable = (decisions: PlanDecision[]): Map<string, PlanDecision> =>
    new Map(
        decisions.flatMap((decision) =>
            decision.choice_id && switchOptions(decision) ? [[decision.choice_id, decision]] : [],
        ),
    );

const activeOptionId = (decision: PlanDecision): string | null =>
    decision.options?.find((option) => isActiveOption(decision, option))?.option_id ?? null;

/**
 * The baseline after a plan showing `choices`: `previous` as it was, plus
 * what each choice it does not hold yet holds now.
 */
const baselineWith = (
    choices: Map<string, PlanDecision>,
    previous: PlanBaseline = {},
): PlanBaseline => {
    const added = [...choices].flatMap(([choiceId, decision]) =>
        choiceId in previous
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
    choices: Map<string, PlanDecision>,
    moved: PlanMoved[],
): PlanChange[] =>
    [...choices].flatMap(([choiceId, decision]) => {
        const first = baseline[choiceId];
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

/** The choice of `choices` that `previous` was switching, for focus to
 *  return to; the first row when the switch took it off the plan. */
const switchedChoice = (previous: PlanState, choices: Map<string, PlanDecision>): string | null => {
    const pick = previous.switching;

    if (!pick) {
        return null;
    }

    return choices.has(pick.choiceId) ? pick.choiceId : (choices.keys().next().value ?? null);
};

/**
 * The notice on the row of `pick`, a switch that did not apply. With the
 * harness's `detail`, a lead naming the option and the detail under it,
 * unless the notice is `quiet` (the user stopped the switch), when the detail
 * stands alone. Without one, `own(picked)`, the card's words. `askAgain`
 * closes the text on a card that is no longer live.
 */
const switchNotice = (
    decisions: PlanDecision[],
    pick: PlanSwitch | null,
    {
        detail,
        own,
        askAgain = false,
        ...rest
    }: Pick<Partial<PlanNotice>, 'retryable' | 'retryAfter' | 'quiet'> & {
        detail: string | null;
        own: (picked: string) => string;
        askAgain?: boolean;
    },
): PlanNotice => {
    const picked = (pick && optionLabel(decisions, pick.choiceId, pick.optionId)) ?? 'that option';
    const text = detail || own(picked);

    return planNotice({
        ...rest,
        lead: detail && !rest.quiet ? couldNotSwitch(picked) : null,
        text: askAgain ? `${text} ${ASK_AGAIN}` : text,
        choiceId: pick?.choiceId ?? null,
        optionId: pick?.optionId ?? null,
    });
};

/** "Studio could not switch to net disbursements." */
const studioCouldNotSwitch = (picked: string): string => `Studio could not switch to ${picked}.`;

/**
 * The harness's word on a switch that did not apply: a lead naming the
 * option, then its reason. A switch the user stopped (`switch_cancelled`)
 * did what they asked, so its reason stands alone, quietly.
 */
const switchFailedNotice = (decisions: PlanDecision[], failed: PlanSwitchFailed): PlanNotice =>
    switchNotice(
        decisions,
        { choiceId: failed.choice_id, optionId: failed.option_id },
        {
            detail: failed.reason,
            own: studioCouldNotSwitch,
            // A harness that predates `retryable` leaves it out.
            retryable: failed.retryable ?? true,
            quiet: failed.code === SWITCH_CANCELLED,
        },
    );

/** The card's headline: the harness's title, else the first question the
 *  user asked with its first letter raised. */
const headline = (frame: PlanProposed): string => {
    const ask = frame.asks?.[0]?.ask.trim();

    if (frame.title.trim() || !ask) {
        return frame.title;
    }

    return ask.charAt(0).toUpperCase() + ask.slice(1);
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
    const rows = switchable(decisions);
    const baseline = baselineWith(rows, previous?.baseline);
    const moved = frame.moved ?? [];

    return {
        title: headline(frame),
        summary: frame.summary || null,
        steps: frame.steps,
        answerStepId: answerStep(frame),
        decisions,
        caveats: frame.caveats ?? [],
        movedElsewhere: moved.filter((entry) => !rows.has(entry.choice_id)),
        version: frame.version,
        actions: frame.actions,
        interruptId: frame.interrupt_id,
        live: true,
        revision: frame.revision ?? null,
        baseline,
        changed: changesSince(baseline, rows, moved),
        switched: previous && !failed ? switchedChoice(previous, rows) : null,
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
 *  wait, and an earlier refusal's notice and the mark of the switch before it
 *  go, so every card that comes of this switch failing has neither. */
export const startSwitch = (plan: PlanState, pick: PlanSwitch): PlanState => ({
    ...plan,
    switching: pick,
    switched: null,
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
              notice: planNotice({ text: refusal.detail ?? STALE_NOTICE }),
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
    detail: string | null,
    { retryable, retryAfter }: { retryable: boolean; retryAfter: number | null },
): PlanNotice => {
    const decision = plan.decisions.find((candidate) => candidate.choice_id === pick.choiceId);
    const still = decision ? ` The plan still counts ${activeLabel(decision)}.` : '';

    return switchNotice(plan.decisions, pick, {
        detail,
        own: (picked) => `${studioCouldNotSwitch(picked)}${still}`,
        retryable,
        retryAfter,
    });
};

// Refusals a second try would meet again, whatever their body says: signed
// out, rate limited.
const UNRETRYABLE = new Set([401, 429]);

/** Picking the option again could apply: the refusal is not of a kind that
 *  repeats, and its ToolError, when it sends one, says to retry after a
 *  delay. */
const retryableRefusal = (refusal: StreamRefusal): boolean =>
    !UNRETRYABLE.has(refusal.status) &&
    (refusal.error ? refusal.error.retry === 'retry_after_delay' : true);

/** The pause a refusal answers is gone (the turn ended or was replaced). */
const isGone = (refusal: StreamRefusal): boolean =>
    refusal.status === 404 || refusal.error?.error === 'not_found';

/**
 * The card after the harness refused its switch. The card always stays.
 *
 * A 409 `plan_revision_stale` brings the current plan, and switching works
 * again on it. Without one the card keeps its revision, so an approve from it
 * is refused as stale, and drops the switch action. A 404 or `not_found`
 * says the pause is gone, so the card ends read-only (endedPlan). Any other
 * refusal (a 422 `switch_option_unavailable` among them) says on the
 * choice's row that the switch did not apply, with the harness's detail when
 * it gave one. It offers "Try again" only where a second try could apply:
 * never on a 401 or 429, and otherwise on a ToolError whose `retry` is
 * `retry_after_delay` (after its `retry_after_seconds`, when it sets them)
 * or a refusal without a ToolError.
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
                notice: planNotice({ text: STALE_NOTICE }),
            }
        );
    }

    if (isGone(refusal)) {
        return endedPlan(plan, { detail: refusal.detail });
    }

    if (!pick) {
        return settled;
    }

    return {
        ...settled,
        notice: unappliedNotice(plan, pick, refusal.detail, {
            retryable: retryableRefusal(refusal),
            retryAfter: refusal.error?.retry_after_seconds || null,
        }),
    };
};

/**
 * The card after its switch request never reached the harness (the request
 * failed before any response). The pause still waits, so the card stays live
 * and its row offers "Try again".
 */
export const unreachableSwitch = (plan: PlanState): PlanState => {
    const pick = plan.switching;
    const settled = { ...plan, switching: null };

    return pick
        ? {
              ...settled,
              notice: unappliedNotice(plan, pick, UNREACHABLE_NOTICE, {
                  retryable: true,
                  retryAfter: null,
              }),
          }
        : settled;
};

/** An `approve` of `plan`, carrying its revision so the harness can tell an
 *  approval from an out-of-date card. */
export const approveReply = (
    plan: PlanState | undefined,
): Pick<InterruptResponse, 'decision' | 'plan_revision'> =>
    plan?.revision
        ? { decision: 'approve', plan_revision: plan.revision }
        : { decision: 'approve' };

/** How a switch's stream ended without a plan: the error's `detail` when it
 *  sent one, and whether the user stopped it. */
export type SwitchEnding = { detail?: string | null; stopped?: boolean };

/**
 * The card once a switch's stream ended without the harness offering a plan
 * again (it broke, sent an error, closed, or was stopped and the harness did
 * not re-offer), or the harness refused it because the pause is gone. The
 * turn has ended, so the card stays read-only, saying in
 * one line on the choice's row that the switch did not apply and to ask
 * again.
 */
export const endedPlan = (plan: PlanState, { detail, stopped }: SwitchEnding = {}): PlanState => ({
    ...plan,
    live: false,
    switching: null,
    notice: switchNotice(plan.decisions, plan.switching, {
        detail: stopped ? null : (detail ?? null),
        own: stopped ? (picked) => `Stopped before switching to ${picked}.` : studioCouldNotSwitch,
        askAgain: true,
    }),
});

/**
 * The conversation once a switch's stream ended without a fresh plan: the
 * waiting card gives way to `ended`, its read-only form (endedPlan), and the
 * chat line clears. The paused reply and the Activity record are left as they were
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
    ended: PlanState,
): TState =>
    state.plan === waiting
        ? {
              ...state,
              plan: ended,
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
    // A stored frame may lack either list.
    steps: frame.steps ?? [],
    choices: frame.choices ?? [],
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
 *  before a switch, why the plan holds it, and the decision behind it when
 *  the row can switch. */
export type PlanChoiceView = {
    key: string;
    name: string;
    value: string;
    changedFrom: string | null;
    changedReason: string | null;
    reason: string | null;
    decision: PlanDecision | null;
};

/** A choice a switch moved that has no row: what it held, what it holds
 *  now, and why. */
export type PlanMoveView = { key: string; from: string; to: string; reason: string | null };

export type PlanOtherView = { key: string; question: string; chosen: string; reason: string };

/** A plan as the card and the modal show it, live or approved. */
export type PlanView = {
    title: string;
    version: number;
    summary: string | null;
    steps: PlanStepView[];
    choices: PlanChoiceView[];
    moved: PlanMoveView[];
    others: PlanOtherView[];
    // What qualifies the answer, one reader sentence each.
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
                reason: decision.reason || null,
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
        moved: plan.movedElsewhere.map((entry) => ({
            key: entry.choice_id,
            from: entry.from_label,
            to: entry.to_label,
            reason: entry.reason || null,
        })),
        others,
        caveats: plan.caveats,
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
            reason: null,
            decision: null,
        })),
        moved: [],
        others: [],
        // A plan saved before the harness sent caveats has none.
        caveats: plan.caveats ?? [],
    };
};

/** The step whose result answers the question. */
export const answerStepOf = (view: PlanView): PlanStepView | undefined =>
    view.steps.find((step) => step.givesAnswer);

export const stepCount = (count: number): string => `${count} ${count === 1 ? 'step' : 'steps'}`;
