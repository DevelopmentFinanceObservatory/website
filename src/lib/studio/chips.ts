/**
 * The chips a `suggestions` frame offers after an answer: prompt follow-ups,
 * sent as the user's next message, and `apply_choice` chips, which switch a
 * scope choice of the answer's readings in one turn. Also what the
 * transcript shows when the harness refuses a chip that no longer applies.
 */

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';

import type { StreamRefusal } from './studioClient';
import type { ApplyChoiceSuggestion, StudioFrame } from './wire';

type SuggestionItems = Extract<StudioFrame, { event: 'suggestions' }>['items'];

/** The frame's items split by kind: prompt follow-ups (their prompts, as
 *  sent) and `apply_choice` chips, each in frame order. */
export const splitSuggestions = (
    items: SuggestionItems,
): { followups: string[]; chips: ApplyChoiceSuggestion[] } => {
    const followups: string[] = [];
    const chips: ApplyChoiceSuggestion[] = [];

    for (const item of items) {
        if ('kind' in item) {
            chips.push(item);
        } else {
            followups.push(item.prompt);
        }
    }

    return { followups, chips };
};

const sameChip = (a: ApplyChoiceSuggestion, b: ApplyChoiceSuggestion): boolean =>
    a.choice_id === b.choice_id && a.option_id === b.option_id;

/** The `detail` of the harness's refusal of a chip (422 with pointer
 *  `/apply_choice`), or null for any other refusal. */
export const chipRefusalDetail = (refusal: StreamRefusal): string | null =>
    refusal.status === 422 && refusal.error?.pointer === '/apply_choice'
        ? refusal.error.detail
        : null;

/**
 * The transcript after the harness refused `chip`: the reply the click
 * opened says why, and carries the answer's other chips and follow-ups, so
 * the user can still pick one. `messages` ends with the user's chip label
 * and its empty reply; the answer that offered the chip comes before them.
 */
export const withRefusedChip = (
    messages: ChatMessage[],
    chip: ApplyChoiceSuggestion,
    detail: string,
): ChatMessage[] => {
    const reply = messages.at(-1);
    const answer = messages.at(-3);

    if (reply?.role !== 'bot') {
        return messages;
    }

    const offered = answer?.role === 'bot' ? answer : null;
    const chips = (offered?.chips ?? []).filter((other) => !sameChip(other, chip));

    return [
        ...messages.slice(0, -1),
        {
            ...reply,
            text: `_${detail}_`,
            ...(offered?.followups?.length && { followups: offered.followups }),
            ...(chips.length > 0 && { chips }),
        },
    ];
};
