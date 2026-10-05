import type { ApiError } from './searchClient.ts';

/**
 * The user-facing sentence for a Datasets API `over_ceiling` refusal.
 *
 * The engine reports the ceiling it hit plus the two numbers, so the message
 * can name them instead of saying "too large" and leaving the user to guess by
 * how much. `candidate_window` is the one ceiling the user cannot shrink by
 * changing scope: it counts the measures a broad family matched, so the way
 * out is a specific measure rather than a smaller place or time range.
 */

// What each ceiling measures, and how its two numbers read. A kind this
// module doesn't know falls back to a plain count.
const CEILINGS: Record<string, { noun: string; format: (value: number) => string }> = {
    rows: { noun: 'rows', format: (value) => value.toLocaleString('en-US') },
    member_cardinality: { noun: 'series', format: (value) => value.toLocaleString('en-US') },
    bytes: {
        noun: '',
        format: (value) => `${(value / 1024 / 1024).toFixed(1)} MB`,
    },
};

export const measuredMessage = (error: ApiError): string | null => {
    if (error?.code !== 'over_ceiling' || error.count == null || error.cap == null) {
        return null;
    }

    const format = (value: number) => value.toLocaleString('en-US');

    if (error.ceilingKind === 'candidate_window') {
        // `count` is the number of candidates the read listed and `cap` the window
        // it was allowed; neither is the size of the selection, so the message
        // names no number.
        return 'This selection matches more variables than one export can list. Pick a specific measure and try again.';
    }

    const ceiling = CEILINGS[error.ceilingKind ?? ''] ?? { noun: '', format };

    const size = `${ceiling.format(error.count)}${ceiling.noun ? ` ${ceiling.noun}` : ''}`;
    const limit = `${ceiling.format(error.cap)}${ceiling.noun ? ` ${ceiling.noun}` : ''}`;

    return `This result is ${size}, over the ${limit} export limit — narrow it (a place, a shorter window, a more specific measure) and try again.`;
};
