/**
 * What the share box says when a link cannot be made. Kept apart from the
 * component so `node --test` imports it directly.
 */

import type { SearchShareMode } from './searchClient';

// A snapshot captures the data first, and the platform can refuse that
// capture for reasons an immediate retry won't fix. Each message says so and
// offers the live link, which materialises nothing.
const REFUSALS: Record<string, string> = {
    // The capture could not be pinned, so the snapshot would expire.
    pin_refused:
        "The data platform couldn't keep a permanent copy of this result, so a snapshot link would stop working. Share it as live data instead.",
    // The pin door is pinning nothing right now.
    pin_unavailable:
        "The data platform isn't keeping new permanent copies right now, so a snapshot link can't be made. Share it as live data instead, or try a snapshot later.",
    over_ceiling:
        'This result is too large to capture as a snapshot. Share it as live data instead, or narrow the search first.',
    spec_not_exportable:
        "This result describes a family of series rather than specific ones, so there's nothing to capture yet. Share it as live data instead.",
    member_not_resolvable:
        "The data platform can't capture this result right now. Share it as live data instead.",
};

export const shareFailureText = (mode: SearchShareMode, refused: string | null): string =>
    (mode === 'snapshot' && refused && REFUSALS[refused]) ||
    (mode === 'snapshot' && refused
        ? "The data platform couldn't capture this result. Share it as live data instead."
        : "Couldn't create the link — try again.");
