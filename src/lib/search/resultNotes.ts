/** Pure logic behind the warning lines the results page draws: the table
 *  caption, the download panel's note, the "About this answer" notes, and
 *  the note an edit that left no data leaves. Each part's departures state
 *  how the answer differs from the request, so the page reads exactly the
 *  codes named here and shows no other warning code. Also collapses duplicate "Open Studio" hand-off panels to one, and
 *  writes per-part step progress text. */

import { capitalise } from '../capitalise.ts';
import { measureVarianceNotes, type MeasureMenuSpec } from './measureMenu.ts';
import { offersAmbiguousPicker } from './parsedEdit.ts';
import {
    coverageSentence,
    markedTotalColumns,
    noDataCallout,
    scopeAssumptions,
    seriesPreviewCaptions,
    type SlotOptionsEntry,
} from './view.ts';
import type { Warning } from './types.ts';

const andList = (labels: string[]): string =>
    new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(labels);

const asSentence = (message: string): string => {
    const text = message.trim();

    if (!text) {
        return '';
    }

    const capitalised = capitalise(text);

    return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
};

/** Codes the table caption explains, since each describes what the preview
 *  holds. `observations_series_truncated` reads its counts through
 *  view.ts's seriesPreviewCaptions; the rest read as the API wrote them. */
export const CAPTION_WARNING_CODES: ReadonlySet<string> = new Set([
    'observations_series_truncated',
    'variables_clamped',
    'observations_scope_partial',
]);

/** Codes the download panel explains: what a download will hold. */
export const DOWNLOAD_WARNING_CODES: ReadonlySet<string> = new Set(['membership_unverified']);

/** Codes the "About this answer" panel explains: the scopes the question
 *  left open (read through view.ts's scopeAssumptions), and UN reads that
 *  failed. */
export const ABOUT_WARNING_CODES: ReadonlySet<string> = new Set([
    'place_scope_defaulted',
    'role_scope_defaulted',
    'time_window_defaulted',
    'un_system_unavailable',
]);

type CaptionPart = {
    variableText: string | null;
    spec: unknown;
    warnings?: Pick<Warning, 'code' | 'message' | 'params'>[];
};

/** The line that says what a marked total row is, shown with the rows
 *  `markedTotalColumns` marks. */
export const TOTALS_NOTE =
    'Rows marked total already include other rows of the table, so do not add them to the rest.';

/** The table caption's lines for the parts the table shows: the
 *  series-preview count (seriesPreviewCaptions) and every other caption
 *  code's message, each once per part, labelled by variable text when the
 *  table holds more than one part, then the do-not-sum line when the table
 *  marks totals. */
export function tableCaptionNotes(parts: CaptionPart[]): string[] {
    const lines = new Set(seriesPreviewCaptions(parts));

    for (const part of parts) {
        const label = parts.length > 1 && part.variableText ? `${part.variableText}: ` : '';

        for (const warning of part.warnings ?? []) {
            if (
                warning.code === 'observations_series_truncated' ||
                !CAPTION_WARNING_CODES.has(warning.code)
            ) {
                continue;
            }

            const text = asSentence(warning.message);

            if (text) lines.add(`${label}${text}`);
        }
    }

    if (markedTotalColumns(parts).size > 0) {
        lines.add(TOTALS_NOTE);
    }

    return [...lines];
}

/** The download panel's note, or null, read from the warnings of the part
 *  the download is built from. The warning's own text speaks of member
 *  probes and carries no params, so the note is one fixed sentence. */
export function downloadNote(
    warnings: readonly Pick<Warning, 'code'>[] | null | undefined,
): string | null {
    return (warnings ?? []).some((warning) => DOWNLOAD_WARNING_CODES.has(warning.code))
        ? 'The search could not confirm every series behind this answer, so a download may hold different series from the ones shown.'
        : null;
}

/** The "Data not available" line for a part's failed UN reads, read from
 *  the `variables` and `variable_labels` params of its
 *  `un_system_unavailable` warnings (dfo-apis un_system.py
 *  un_unavailable_warning). The same warning's `places` param names places
 *  the UN refused, which the part states as an entity_unavailable departure,
 *  so those are left out. Each variable is named by its label, and a
 *  variable with no label is counted, so no dcid reaches the reader. A
 *  warning with no params means the UN search itself was unavailable, which
 *  one site sentence states. Empty when no read failed. */
export function unSystemFailedReads(
    warnings: readonly Pick<Warning, 'code' | 'params'>[] | null | undefined,
): string[] {
    const unavailable = (warnings ?? []).filter(
        (warning) => warning.code === 'un_system_unavailable',
    );

    // A warning with no params says the UN search itself failed, not a read.
    if (unavailable.some((warning) => !warning.params)) {
        return [
            'The UN System Data Commons could not be searched, so the answer holds no UN data.',
        ];
    }

    // Each variable's label, empty where the warning holds none.
    const labels = new Map(
        unavailable.flatMap((warning) => {
            const names = warning.params?.variable_labels ?? [];

            return (warning.params?.variables ?? []).map(
                (dcid, at) => [dcid, names[at] ?? ''] as const,
            );
        }),
    );

    if (labels.size === 0) return [];

    const named = [...new Set([...labels.values()].filter(Boolean))];
    const unnamed = [...labels.values()].filter((label) => !label).length;
    const counted =
        unnamed === 0
            ? []
            : [`${unnamed} ${named.length > 0 ? 'other ' : ''}variable${unnamed === 1 ? '' : 's'}`];
    const pronoun = labels.size === 1 ? 'it' : 'them';

    return [
        `The UN System Data Commons could not be read for ${andList([...named, ...counted])}, so the answer holds no UN data for ${pronoun}.`,
    ];
}

export type AboutAnswerNotes = {
    /** the coverage sentence ("2024 is the latest year with data, with 152
     *  values…"), null without a headline */
    coverage: string | null;
    /** what the answer assumed, one sentence per scope the question left
     *  open */
    assumptions: string[];
    /** one line per varying fact the measure menu cannot offer */
    variance: string[];
    /** UN reads that failed */
    unavailable: string[];
};

/** The notes "About this answer" shows for one definite part. It reads
 *  only the warnings `ABOUT_WARNING_CODES` names. */
export function aboutAnswerNotes(
    spec: MeasureMenuSpec,
    warnings: readonly Warning[] | null | undefined,
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>,
): AboutAnswerNotes {
    const about = (warnings ?? []).filter((warning) => ABOUT_WARNING_CODES.has(warning.code));

    return {
        coverage: coverageSentence(spec),
        assumptions: scopeAssumptions(spec, about),
        variance: measureVarianceNotes(spec, optionsBySpec),
        unavailable: unSystemFailedReads(about),
    };
}

/** The line an edit whose candidates no longer return data leaves beside
 *  the sentence, or null. It reports the edit, not the request, so no
 *  departure states it. */
export function collapsedCandidatesNote(
    warnings: readonly Pick<Warning, 'code'>[] | null | undefined,
): string | null {
    return (warnings ?? []).some((warning) => warning.code === 'candidates_collapsed_no_data')
        ? 'The candidates from that edit no longer return data. See the options below, or start a new search.'
        : null;
}

/** The no_data parts SearchCards renders: every one except a part with a
 *  slot token whose own "Choose a Match" picker SearchSentence renders
 *  (offersAmbiguousPicker). A slotted ambiguous part the picker refuses
 *  keeps its card, so it still gets its callout and Studio hand-off. */
export function noDataCardParts<T extends { index: number; part: unknown }>(
    parts: T[],
    isSlotted: (index: number) => boolean,
): T[] {
    return parts.filter(
        (entry) =>
            (entry.part as { status?: string } | null)?.status === 'no_data' &&
            !(offersAmbiguousPicker(entry.part) && isSlotted(entry.index)),
    );
}

/** True when the part draws the generic Studio hand-off callout below the
 *  sentence: a no_data part with no "Choose a Match" picker
 *  (offersAmbiguousPicker) whose noDataCallout is 'studio'. A flagged or
 *  alternate callout, the nearest_real cards, a picker, and every other
 *  status offer no Studio of their own. */
export function offersStudioCallout(part: unknown, question?: string | null): boolean {
    return (
        (part as { status?: string } | null)?.status === 'no_data' &&
        !offersAmbiguousPicker(part) &&
        noDataCallout(part, question)?.kind === 'studio'
    );
}

/** Collapses every no_data part whose callout is the generic 'studio'
 *  hand-off down to the first. A flagged/alternate callout, the
 *  nearest_real fallback, or a part offersAmbiguousPicker accepts (its own
 *  "Choose a Match" picker, not the generic panel) keeps rendering once per
 *  part since each carries that part's own text or its own picker. */
export function studioHandoffParts<T extends { part: unknown }>(
    noDataParts: T[],
    question?: string | null,
): T[] {
    let seenStudio = false;

    return noDataParts.filter((entry) => {
        if (!offersStudioCallout(entry.part, question)) return true;
        if (seenStudio) return false;

        seenStudio = true;
        return true;
    });
}

export function resolvedPartCount(partSteps: string[][], expectedCount: number): number {
    return partSteps.slice(0, expectedCount).filter((steps) => steps.includes('answer')).length;
}

/** The engine's own pipeline step names, read by a person rather than an
 *  engineer. recall/shape/bind all read as "Finding the measure": none of
 *  the three means anything on its own to someone who isn't the engine. */
const STEP_PHRASES: Record<string, string> = {
    extract: 'Reading your question',
    recall: 'Finding the measure',
    shape: 'Finding the measure',
    bind: 'Finding the measure',
    materialise: 'Fetching data',
    answer: 'Preparing the answer',
};

/** The reader-facing phrase for the latest step to have run, or null before
 *  anything has (or for a step name this map doesn't cover). */
export function stepPhrase(steps: string[]): string | null {
    const last = steps[steps.length - 1];
    return last ? (STEP_PHRASES[last] ?? null) : null;
}

/** "N of M parts resolved" for two or more expected parts. For a single
 *  part, the reader phrase for its latest step instead (see stepPhrase),
 *  since that's where its real latency lives. Empty until anything has
 *  arrived. */
export function progressSuffix(
    sharedSteps: string[],
    partSteps: string[][],
    expectedCount: number,
): string {
    if (expectedCount > 1) {
        const resolved = resolvedPartCount(partSteps, expectedCount);
        return `${resolved} of ${expectedCount} parts resolved`;
    }

    return stepPhrase([...sharedSteps, ...(partSteps[0] ?? [])]) ?? '';
}

/** The snapshot toolbar's note on datasets whose frozen rows could not be
 *  read and so show live data. `allLive` is true when no dataset on the page
 *  is frozen. */
export type SnapshotLiveNote = { text: string; allLive: boolean };

/** The note for a snapshot page given its datasets (spec_id and the name the
 *  page shows) and the spec_ids whose snapshot read failed. Null when every
 *  dataset read back. */
export function snapshotLiveNote(
    datasets: { specId: string; name: string }[],
    unreadable: ReadonlySet<string>,
): SnapshotLiveNote | null {
    const live = datasets.filter((dataset) => unreadable.has(dataset.specId));

    if (unreadable.size === 0) {
        return null;
    }

    if (live.length === datasets.length) {
        return {
            text: 'The frozen snapshot could not be loaded. These figures are live data.',
            allLive: true,
        };
    }

    const names = [...new Set(live.map((dataset) => dataset.name))];

    if (names.length === 0) {
        return null;
    }

    return {
        text:
            names.length === 1
                ? `${names[0]} shows live data because its snapshot could not be loaded.`
                : `${andList(names)} show live data because their snapshots could not be loaded.`,
        allLive: false,
    };
}
