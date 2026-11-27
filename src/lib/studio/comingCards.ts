/**
 * The cards on their way: a placeholder for each card a drawing call has
 * announced and not yet drawn, and one for each answering step of a plan
 * that is waiting or running and has drawn no card yet.
 *
 * What the canvas reads:
 *
 * - `chat.coming: readonly ComingCard[]`, the placeholders the conversation
 *   shows now, in order: the announced ones in the order their lines
 *   announced them, then the planned ones in plan order. A planned one has
 *   `type` null and shows no kind. The same array object while nothing
 *   changes, and one shared empty array when there are none.
 * - `placeholderId` on a card that landed in a placeholder (useChat's
 *   TurnWidget, from `created_from.placeholder_id`, placeholderOf), so the
 *   canvas puts the card where the placeholder stood, in the update that
 *   drops the placeholder.
 *
 * A placeholder is live state: it comes from the stream's frames by the
 * contract's rule and nothing else, and is never saved or read back from
 * the harness's state. An announced one starts at its drawing line's
 * running frame (`coming`) and ends when a card names it
 * (`created_from.placeholder_id`), when that line closes (`complete` or
 * `failed`), or when the stream ends (`done`, a pause, `error`) or drops
 * (comingEnded).
 */

import { asRecord } from '../asRecord.ts';
import type { Widget } from '../chat/widgets.ts';
import type { PlanApprovedStep, PlanStep, StudioFrame } from './wire.ts';

/** The kinds of card a drawing call announces. */
export type ComingType = 'line_chart' | 'bar_chart' | 'stat_card' | 'table';

const TYPES: readonly ComingType[] = ['line_chart', 'bar_chart', 'stat_card', 'table'];

const isComingType = (value: unknown): value is ComingType => TYPES.some((type) => type === value);

/** One placeholder: its id, the kind that lands (null on a planned one),
 *  its title, the page turn it belongs to, and the step it stands for (the
 *  drawing line's `step_id`, or the plan step's id on a planned one). */
export type ComingCard = {
    id: string;
    type: ComingType | null;
    title: string;
    turn: number;
    stepId: string;
};

/** What the stream has told the page: the announced placeholders, the plan
 *  steps whose drawing line has opened (`<plan_version_id>/<step id>`), the
 *  approved plan the running turn carries out, and the page turn of the
 *  last plan offered (`planTurn`), whose placeholders a waiting plan shows. */
export type ComingState = {
    announced: readonly ComingCard[];
    opened: readonly string[];
    running: { turn: number; planVersionId: string; steps: readonly PlanApprovedStep[] } | null;
    planTurn: number;
};

export const NO_COMING: ComingState = { announced: [], opened: [], running: null, planTurn: 0 };

/** The one empty list of placeholders. */
export const NONE_COMING: readonly ComingCard[] = [];

/** A running line's `coming`, narrowed: each entry with a string
 *  `placeholder_id` and `title` and a known `type`; any other is dropped. */
export const comingEntriesOf = (
    value: unknown,
): { id: string; type: ComingType; title: string }[] =>
    (Array.isArray(value) ? value : []).flatMap((entry: unknown) => {
        const record = asRecord(entry);
        const id = record?.['placeholder_id'];
        const type = record?.['type'];
        const title = record?.['title'];

        return typeof id === 'string' &&
            id !== '' &&
            typeof title === 'string' &&
            isComingType(type)
            ? [{ id, type, title }]
            : [];
    });

/** The placeholder a created card fills, or null. */
export const placeholderOf = (from: unknown): string | null => {
    const id = asRecord(from)?.['placeholder_id'];

    return typeof id === 'string' && id !== '' ? id : null;
};

const stepKey = (version: string, step: string) => `${version}/${step}`;

const without = (state: ComingState, keep: (card: ComingCard) => boolean): ComingState => {
    const announced = state.announced.filter(keep);

    return announced.length === state.announced.length ? state : { ...state, announced };
};

/** The state after `frame` of page turn `turn`. The same object when the
 *  frame changes nothing here. */
export const comingAfter = (state: ComingState, frame: StudioFrame, turn: number): ComingState => {
    switch (frame.event) {
        case 'activity.step': {
            if (frame.status === 'complete' || frame.status === 'failed') {
                return without(state, (card) => card.stepId !== frame.step_id);
            }

            if (frame.status !== 'running') return state;

            const entries = comingEntriesOf(frame.coming);

            if (entries.length === 0) return state;

            const held = new Set(state.announced.map((card) => card.id));
            const fresh = entries
                .filter((entry) => !held.has(entry.id))
                .map((entry) => ({ ...entry, turn, stepId: frame.step_id }));
            const version = frame.plan_version_id;
            const step = frame.plan_step_id;
            const key =
                typeof version === 'string' && version && typeof step === 'string' && step
                    ? stepKey(version, step)
                    : null;

            const opened =
                key && !state.opened.includes(key) ? [...state.opened, key] : state.opened;

            return fresh.length === 0 && opened === state.opened
                ? state
                : { ...state, announced: [...state.announced, ...fresh], opened };
        }
        case 'component.created': {
            const id = placeholderOf(frame.created_from);

            return id ? without(state, (card) => card.id !== id) : state;
        }
        case 'plan.approved':
            return {
                ...state,
                running: { turn, planVersionId: frame.plan_version_id, steps: frame.steps },
            };
        case 'plan.proposed': {
            const ended = comingEnded(state);

            return ended.planTurn === turn ? ended : { ...ended, planTurn: turn };
        }
        case 'done':
        case 'error':
        case 'elicitation.request':
            return comingEnded(state);
        default:
            return state;
    }
};

/** The state once the stream ended or dropped: no announced placeholder
 *  and no running plan stays. */
export const comingEnded = (state: ComingState): ComingState =>
    state.announced.length === 0 && state.running === null && state.opened.length === 0
        ? state
        : { ...state, announced: [], opened: [], running: null };

// The step that answers a plan: the one flagged `gives_answer`, else the
// last step.
const answering = <TStep extends { gives_answer?: boolean | null }>(
    steps: readonly TStep[],
): TStep[] => {
    const flagged = steps.filter((step) => step.gives_answer);

    return flagged.length > 0 ? flagged : steps.slice(-1);
};

/** The planned placeholders: one per answering step of the running plan
 *  that has drawn no card (`cards`' `planStep`) and whose drawing line has
 *  not opened, else, while no plan runs, one per answering step of the plan
 *  waiting on approval (`waiting`, offered on the state's `planTurn`). */
export const plannedCards = ({
    state,
    waiting,
    cards,
}: {
    state: ComingState;
    waiting: { steps: readonly PlanStep[]; answerStepId: string | null } | null;
    cards: readonly Widget[];
}): ComingCard[] => {
    const { running } = state;

    if (running) {
        const drawn = new Set(
            cards.flatMap((card) =>
                card.kind !== 'text' && card.planStep
                    ? [stepKey(card.planStep.plan_version_id, card.planStep.plan_step_id)]
                    : [],
            ),
        );

        return answering(running.steps).flatMap((step) => {
            const key = step.id ? stepKey(running.planVersionId, step.id) : null;

            return key && !drawn.has(key) && !state.opened.includes(key)
                ? [
                      {
                          id: `planned:${key}`,
                          type: null,
                          title: step.label,
                          turn: running.turn,
                          stepId: step.id ?? '',
                      },
                  ]
                : [];
        });
    }

    if (!waiting) return [];

    const steps = waiting.answerStepId
        ? waiting.steps.filter((step) => step.id === waiting.answerStepId)
        : answering(waiting.steps);

    return steps.map((step) => ({
        id: `planned:${step.id}`,
        type: null,
        title: step.label,
        turn: state.planTurn,
        stepId: step.id,
    }));
};

/** The placeholders to show: the announced ones, then the planned ones, or
 *  NONE_COMING when there are none. */
export const comingCards = (
    announced: readonly ComingCard[],
    planned: readonly ComingCard[],
): readonly ComingCard[] =>
    announced.length + planned.length === 0 ? NONE_COMING : [...announced, ...planned];

/** `cards` as a save holds them: `placeholderId`, which only the landing
 *  reads, left undefined, so the saved JSON names no placeholder. The same
 *  array when no card carries one. */
export const savedCards = <TCard extends { id: string; placeholderId?: string }>(
    cards: TCard[],
): TCard[] =>
    cards.some((card) => card.placeholderId !== undefined)
        ? cards.map((card) =>
              card.placeholderId === undefined ? card : { ...card, placeholderId: undefined },
          )
        : cards;
