/**
 * Which approved plan a card belongs to, and each plan's cards. The canvas
 * (lit cards, `View Research Plan`), the session panel's plan line and plan
 * page, and the card page read this one definition.
 */

import type { ChatMessage, TurnWidget } from '@/components/organisms/Studio/hooks/useChat';

import { messageTurns, plansByTurn } from './activityView.ts';
import type { ActivityEntry } from './activity';
import type { ApprovedPlan } from './plan';

/** An approved plan as the canvas and the panel link it: the page turn whose
 *  reply carries it, its title, and the cards made under it in canvas
 *  order. */
export type PlanLink = { turn: number; title: string; cards: string[] };

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
    planOf: (cardId: string) => PlanLink | null;
    plans: PlanLink[];
};

/** A card's chain of replacements, itself first and the first card of the
 *  chain last. */
export const replacedChain = (id: string, replaced: Readonly<Record<string, string>>): string[] => {
    const chain = [id];
    let at = replaced[id];

    while (at !== undefined && !chain.includes(at)) {
        chain.push(at);
        at = replaced[at];
    }

    return chain;
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
 * (placeCard's `keepTurn`). The chain is known for replacements made since
 * the page loaded; a card without one keeps its own turn.
 */
export const rootTurnOf = (
    widget: TurnWidget,
    produced: ReadonlyMap<string, number>,
    replaced: Readonly<Record<string, string>>,
): number => {
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

/**
 * The approved plans and the cards each made. A card belongs to the plan of
 * its question (rootTurnOf), so a card that replaced another keeps the plan
 * of the card it replaced.
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
    const plans: PlanLink[] = Object.entries(byTurn)
        .map(([turn, plan]) => {
            const number = Number(turn);

            return {
                turn: number,
                title: plan.title,
                cards: widgets
                    .filter(
                        (widget) =>
                            rootTurnOf(widget, produced, replaced) === number && visible(widget.id),
                    )
                    .map((widget) => widget.id),
            };
        })
        .toSorted((a, b) => a.turn - b.turn);
    const byCard = new Map<string, PlanLink>();

    for (const plan of plans) {
        for (const id of plan.cards) {
            byCard.set(id, plan);
        }
    }

    return { planOf: (cardId) => byCard.get(cardId) ?? null, plans };
};
