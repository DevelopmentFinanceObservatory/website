/**
 * Which approved plan a card belongs to, and each plan's cards. The canvas
 * (lit cards, `View Research Plan`), the session panel's plan line and plan
 * page, and the card page read this one definition.
 */

import type { ChatMessage, TurnWidget } from '@/components/organisms/Studio/hooks/useChat';

import { messageTurns, plansByTurn } from './activityView.ts';
import { replacedChain } from './cardReplace.ts';
import type { ActivityEntry } from './activity';
import type { ApprovedPlan } from './plan';

/** An approved plan as the canvas and the panel link it: the page turn whose
 *  reply carries it, its title, and the cards made under it in canvas
 *  order. */
export type PlanLink = { turn: number; title: string; cards: string[] };

/** A card's plan, with the plan step whose result the card draws when the
 *  card's frame named it (`stepId`, null for a card linked by its turn). */
export type CardPlan = PlanLink & { stepId: string | null };

export type PlanLinksInput = {
    messages: readonly ChatMessage[];
    widgets: readonly TurnWidget[];
    /** Numbers prompts saved without a turn stamp (messageTurns). */
    activity?: readonly ActivityEntry[];
    /** The cards on the canvas now; every widget when absent. */
    visible?: (id: string) => boolean;
    /** Cards that took another's slot this session, new id to old id. */
    replaced?: Readonly<Record<string, string>>;
};

export type PlanLinks = {
    planOf: (cardId: string) => CardPlan | null;
    plans: PlanLink[];
};

/** The page turn whose steps produced each card, by the card's first
 *  producing step. */
export const producedTurns = (activity: readonly ActivityEntry[]): Map<string, number> => {
    const turns = new Map<string, number>();

    for (const entry of activity) {
        for (const tool of entry.tools) {
            if (tool.widgetId && !turns.has(tool.widgetId)) turns.set(tool.widgetId, entry.turn);
        }
    }

    return turns;
};

/**
 * The question each card belongs to: the turn that made the first card of
 * its chain of replacements, so a card a later question changed stays with
 * the question that first made it. A unit change keeps the card's own turn
 * (placeCard's `keepTurn`). A card that took another's place records that
 * question's turn (`madeIn`, set by placeCard and saved with it); one saved
 * before that is read through the chain known for replacements made since
 * the page loaded, and a card without either keeps its own turn.
 */
export const rootTurnOf = (
    widget: TurnWidget,
    produced: ReadonlyMap<string, number>,
    replaced: Readonly<Record<string, string>>,
): number => {
    if (widget.madeIn !== undefined) return widget.madeIn;

    const chain = replacedChain(widget.id, replaced);
    const root = chain.at(-1);

    return chain.length > 1 && root !== undefined
        ? (produced.get(root) ?? widget.turn)
        : widget.turn;
};

/** Each page turn's approved plan, keyed by turn. */
export const approvedPlans = (
    messages: readonly ChatMessage[],
    activity: readonly ActivityEntry[] = [],
): Record<number, ApprovedPlan> => plansByTurn(messages, messageTurns(messages, activity));

// The turn of the approved plan a card's frame named, and the step. A card
// whose plan id no approved plan of the transcript carries has none.
const namedPlan = (
    widget: TurnWidget,
    turnsByVersion: ReadonlyMap<string, number>,
): { turn: number; stepId: string } | null => {
    const step = widget.kind === 'text' ? undefined : widget.planStep;
    const turn = step && turnsByVersion.get(step.plan_version_id);

    return step && turn !== undefined ? { turn, stepId: step.plan_step_id } : null;
};

/**
 * The approved plans and the cards each made. A card belongs to the plan and
 * step its frame named (`planStep`, kept by a replacement). A card without
 * one (a saved conversation, a harness that names no plan) belongs to the
 * plan of its question (rootTurnOf), so a card that replaced another keeps
 * the plan of the card it replaced.
 */
export const planLinks = ({
    messages,
    widgets,
    activity = [],
    visible = () => true,
    replaced = {},
}: PlanLinksInput): PlanLinks => {
    const byTurn = approvedPlans(messages, activity);
    const produced = producedTurns(activity);
    const turnsByVersion = new Map(
        Object.entries(byTurn).map(([turn, plan]) => [plan.plan_version_id, Number(turn)]),
    );
    const linked = new Map(
        widgets.map((widget) => {
            const named = namedPlan(widget, turnsByVersion);

            return [
                widget.id,
                named ?? { turn: rootTurnOf(widget, produced, replaced), stepId: null },
            ] as const;
        }),
    );
    const plans: PlanLink[] = Object.entries(byTurn)
        .map(([turn, plan]) => {
            const number = Number(turn);

            return {
                turn: number,
                title: plan.title,
                cards: widgets
                    .filter(
                        (widget) => linked.get(widget.id)?.turn === number && visible(widget.id),
                    )
                    .map((widget) => widget.id),
            };
        })
        .toSorted((a, b) => a.turn - b.turn);
    const byCard = new Map<string, CardPlan>();

    for (const plan of plans) {
        for (const id of plan.cards) {
            byCard.set(id, { ...plan, stepId: linked.get(id)?.stepId ?? null });
        }
    }

    return { planOf: (cardId) => byCard.get(cardId) ?? null, plans };
};
