import { measuredMessage } from './ceilingMessage.ts';
import type { ApiError } from './searchClient.ts';

// Datasets API refusals (its contract's registry codes) that concern the
// definition, not the moment — said in the user's terms.
const DATASET_REFUSALS: Record<string, string> = {
    over_ceiling:
        'This result is too large to export as one file — narrow it (a place, a shorter window, a more specific measure) and try again.',
    spec_not_exportable:
        'This result describes a family of series rather than specific ones, so there is nothing to export yet — pick a more specific measure.',
    excel_limit: 'This result is too large for Excel — download it as CSV or Parquet.',
    facet_not_available: 'No observations exist under the selected source / method / unit.',
    upstream_version_changed: 'The source refreshed while the file was being built — try again.',
    operation_failed: 'This download failed while it was being prepared — try again.',
    member_not_resolvable: 'This data has changed since you searched. Search again to download it.',
};

// Some refusals name the values that WOULD have been accepted; saying them
// beats repeating that the request was wrong.
const suggested = (error: ApiError): string | null => {
    const alternatives = (error?.issues ?? [])
        .flatMap((issue) => issue.alternatives ?? [])
        .map((entry) => entry.label ?? entry.ref)
        .filter(Boolean);

    if (alternatives.length === 0) {
        return null;
    }

    return `${error.message} Available here: ${[...new Set(alternatives)].join(', ')}.`;
};

/** The sentence shown when a download's mint fails. */
export const downloadFailureMessage = (error: unknown): string => {
    const refusal = error as ApiError;
    const code = refusal?.code ?? null;

    return (
        measuredMessage(refusal) ??
        suggested(refusal) ??
        (code ? DATASET_REFUSALS[code] : undefined) ??
        (error instanceof Error && error.message
            ? error.message
            : 'Download unavailable right now — try again.')
    );
};
