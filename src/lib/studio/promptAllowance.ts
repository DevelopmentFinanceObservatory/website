/**
 * How many Studio prompts a person may send. A prompt is one turn
 * (POST /api/studio/turn). The proxy meters both allowances per UTC day
 * (src/lib/studio/spendPrompt); the guest wall (GuestWall) shows the guest
 * count.
 */

// Free prompts a day for a signed-out visitor, per network address.
export const GUEST_PROMPTS = 5;

// Prompts a day for a signed-in user, shared by every account on one inbox.
export const USER_DAILY_PROMPTS = 75;

/** What a Studio prompt asks: the first question, a follow-up, an edit of a
 *  card, or a clicked `apply_choice` chip. */
export type PromptIntent = 'new' | 'follow_up' | 'edit' | 'apply_choice';

export type PromptEvent = {
    turn: number;
    intent: PromptIntent;
    length?: number;
    guest: boolean;
};

/**
 * The `studio.prompt` event for a prompt about to be sent, or null when a
 * guest has no free prompt left for it. `used` is the guest's prompts spent
 * so far, `queued` the prompts waiting behind the running turn (they hold
 * their place in the limit), and `sent` the prompts in the transcript.
 * `length` is the typed text's length; a chip has none.
 */
export const promptEvent = ({
    guest,
    used,
    queued,
    sent,
    intent,
    length,
}: {
    guest: boolean;
    used: number;
    queued: number;
    sent: number;
    intent?: PromptIntent;
    length?: number;
}): PromptEvent | null =>
    guest && used + queued >= GUEST_PROMPTS
        ? null
        : {
              turn: sent + queued + 1,
              intent: intent ?? (sent === 0 ? 'new' : 'follow_up'),
              ...(length !== undefined && { length }),
              guest,
          };
