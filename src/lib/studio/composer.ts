// No path-alias imports, so node --test imports it directly.

import { type InterruptTextCount, interruptTextCount } from './interruptText.ts';
import type { PlanState } from './plan.ts';

/** The card a pending follow-up is scoped to, set by a card's "Ask follow
 *  up" and shown as a chip above the field. */
export type EditTarget = { id: string; title: string };

/** The plan as the composer reads it. */
export type ComposerPlan = Pick<PlanState, 'live' | 'switching'> | null;

/** What the composer's foot shows below any plan card: the guest wall, the
 *  clarify picker, or the follow-up field. */
export type ComposerMode = 'wall' | 'clarify' | 'input';

/**
 * The foot's branch. The wall takes the field away first; a question the
 * agent asked shows its picker unless a plan awaits review, whose card
 * already sits above the field.
 */
export const composerMode = ({
    walled,
    plan,
    clarify,
}: {
    walled: boolean;
    plan: ComposerPlan;
    clarify: boolean;
}): ComposerMode => {
    if (walled) {
        return 'wall';
    }

    return !plan && clarify ? 'clarify' : 'input';
};

/**
 * The draft's count against the amendment cap. A plan's "Propose changes"
 * travels as an amendment, which the harness caps; a follow-up turn has no
 * such cap here, so outside a live plan the count is of nothing.
 */
export const amendmentCount = (draft: string, plan: ComposerPlan): InterruptTextCount =>
    interruptTextCount(plan?.live ? draft.trim() : '');

/** What sending the draft does. */
export type FollowUpAction =
    // Nothing goes, and the text stays in the field.
    | { kind: 'hold' }
    // The text answers the live plan as an amendment.
    | { kind: 'amend'; text: string }
    // A turn about one card, carrying its component_ref.
    | {
          kind: 'card';
          text: string;
          options: { componentId: string; intent: 'follow_up'; title: string };
      }
    // A plain follow-up turn.
    | { kind: 'send'; text: string };

/**
 * What the composer sends for `draft`. An empty draft, a plan switch in
 * flight (it holds the pause) and an amendment over the cap hold. While a
 * plan awaits review the field is its "Propose changes" channel, so the
 * trimmed text travels as an amendment; a read-only plan card awaits
 * nothing, so the text asks again. With a card targeted the turn is about
 * that card. A turn takes the draft as typed.
 */
export const followUpAction = ({
    draft,
    plan,
    editTarget,
}: {
    draft: string;
    plan: ComposerPlan;
    editTarget: EditTarget | null;
}): FollowUpAction => {
    if (!draft.trim() || plan?.switching || amendmentCount(draft, plan).over) {
        return { kind: 'hold' };
    }

    if (plan?.live) {
        return { kind: 'amend', text: draft.trim() };
    }

    if (editTarget) {
        return {
            kind: 'card',
            text: draft,
            options: { componentId: editTarget.id, intent: 'follow_up', title: editTarget.title },
        };
    }

    return { kind: 'send', text: draft };
};

/** The follow-up field's placeholder and accessible label. */
export const composerField = ({
    plan,
    editTarget,
}: {
    plan: ComposerPlan;
    editTarget: EditTarget | null;
}): { placeholder: string; label: string } => {
    if (plan?.live) {
        return { placeholder: 'Propose changes or ask a follow up...', label: 'Propose changes' };
    }

    if (editTarget) {
        return { placeholder: 'Ask about this card...', label: 'Ask about this card' };
    }

    return { placeholder: 'Ask a follow up...', label: 'Ask a follow up' };
};
