/**
 * How many Studio prompts a person may send. A prompt is one turn
 * (POST /api/studio/turn). The proxy meters both allowances per UTC day
 * (src/lib/studio/spendPrompt); the guest wall (GuestWall) shows the guest
 * count.
 */

// Free prompts a day for a signed-out visitor, per network address.
export const GUEST_PROMPTS = 5;

// Prompts a day for a signed-in user.
export const USER_DAILY_PROMPTS = 75;
