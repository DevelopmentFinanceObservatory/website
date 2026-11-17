import type { CountKey } from '../_data/types.ts';

/**
 * One house-palette colour per count (theme.ts DEFAULT_SERIES), shared by the bars, the
 * bridges and the panels over time, so a count keeps its colour across the page.
 */
export const COUNT_COLOURS: Record<CountKey, string> = {
    gross: '#6467de',
    grantEquivalent: '#f6935a',
    net: '#2a9d8f',
    commitments: '#bb6fdc',
    headline: '#463138',
};

/** The bridge's step: the base colour of the count it leads to, at 40% opacity. */
export const STEP_OPACITY = 0.4;
