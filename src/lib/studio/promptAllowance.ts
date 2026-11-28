/**
 * How many Studio prompts a person may send. A prompt is one turn
 * (POST /api/studio/turn). The proxy meters both allowances per UTC day
 * (src/lib/studio/spendPrompt); the guest wall (GuestWall) shows the guest
 * count.
 */

import type { PromptSource } from './wire.ts';

// Free prompts a day for a signed-out visitor, per network address.
export const GUEST_PROMPTS = 5;

// The localStorage key under which Studio counts a guest's prompts in this
// browser. The proxy holds the real allowance; this count decides when the
// guest wall goes up and whether Get Data moves a guest to Studio.
export const GUEST_PROMPTS_KEY = 'dfo-guest-prompts';

/** The guest prompt count `storage` holds under GUEST_PROMPTS_KEY, 0 when
 *  it holds none. */
export const guestPromptsUsed = (storage: Pick<Storage, 'getItem'>): number =>
    Number(storage.getItem(GUEST_PROMPTS_KEY)) || 0;

/** Add `delta` prompts, which may be negative, to the guest count the
 *  storage `storage` returns holds under GUEST_PROMPTS_KEY, never taking it
 *  below 0. A browser that blocks storage keeps no count, since the proxy
 *  still meters the guest's allowance. */
export const addGuestPrompts = (
    storage: () => Pick<Storage, 'getItem' | 'setItem'>,
    delta: number,
): void => {
    try {
        const store = storage();

        store.setItem(GUEST_PROMPTS_KEY, String(Math.max(0, guestPromptsUsed(store) + delta)));
    } catch {
        // Blocked storage: nothing to count in.
    }
};

/** Whether a guest has no free prompt left, having spent or queued `used`.
 *  Always false for a signed-in user. */
export const guestOutOfPrompts = ({ guest, used }: { guest: boolean; used: number }): boolean =>
    guest && used >= GUEST_PROMPTS;

// Prompts a day for a signed-in user, shared by every account on one inbox.
export const USER_DAILY_PROMPTS = 75;

/** What a Studio prompt asks: the first question, a follow-up, an edit of a
 *  card, a clicked `apply_choice` chip, or a card's unit change. */
export type PromptIntent = 'new' | 'follow_up' | 'edit' | 'apply_choice' | 'apply_unit';

export type PromptEvent = {
    turn: number;
    intent: PromptIntent;
    length?: number;
    guest: boolean;
    source?: PromptSource;
};

/**
 * The `studio.prompt` event for a prompt about to be sent, or null when a
 * guest has no free prompt left for it. `used` is the guest's prompts spent
 * so far, `queued` the prompts waiting behind the running turn (they hold
 * their place in the limit), and `sent` the prompts in the transcript.
 * `length` is the typed text's length; a chip has none. `source` names
 * the example a picked question came from, and a typed question has none.
 */
export const promptEvent = ({
    guest,
    used,
    queued,
    sent,
    intent,
    length,
    source,
}: {
    guest: boolean;
    used: number;
    queued: number;
    sent: number;
    intent?: PromptIntent;
    length?: number;
    source?: PromptSource;
}): PromptEvent | null =>
    guestOutOfPrompts({ guest, used: used + queued })
        ? null
        : {
              turn: sent + queued + 1,
              intent: intent ?? (sent === 0 ? 'new' : 'follow_up'),
              ...(length !== undefined && { length }),
              guest,
              ...(source && { source }),
          };
