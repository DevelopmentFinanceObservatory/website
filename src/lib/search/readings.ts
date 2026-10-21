/**
 * A candidates part's readings: the text each reading card draws, and the
 * envelope plan with each candidates part's summary folded into one marked
 * phrase, since the cards show the readings and the summary is only their
 * screen-reader text. Pure; no React.
 */

import { refsStatedBesides, sentenceBlocks, tokenSegment } from './departures.ts';
import { planSentenceText, tokenPart } from './sentencePlan.ts';
import type { CandidateBasis, Part, SentenceToken } from './types';

/** What one reading card shows: its heading and byline as plain text, the
 *  measure token its About block describes, and the refs the reading's
 *  other tokens state, which that block leaves to them. */
export type Reading = {
    heading: string;
    byline: string;
    measure: SentenceToken | null;
    statedElsewhere: Set<string>;
};

const blockText = (plan: readonly SentenceToken[], segment: 'heading' | 'byline'): string =>
    sentenceBlocks(plan)
        .filter((block) => block.segment === segment)
        .map((block) => block.tokens.map((token) => token.text).join(''))
        .join(' ');

// Why the part offers a reading beside the elected one (Spec.basis), as
// the line its card leads with.
const BASIS_NOTES: Record<CandidateBasis, string> = {
    structural: 'Differs only in a choice your question left open',
    nominated: 'Another reading of your words',
    twin: 'An equivalent series that holds data',
    direction: 'The same measure, read in the other direction',
};

/** The line a reading card leads with, saying why the part offers it.
 *  Null for the elected reading, which carries no basis, and for a server
 *  that sends none. */
export const basisNote = (basis: CandidateBasis | null | undefined): string | null =>
    (basis && BASIS_NOTES[basis]) ?? null;

/** The reading a candidate spec's own sentence plan states. */
export function readingOf(spec: { sentence_plan?: SentenceToken[] | null }): Reading {
    const plan = spec.sentence_plan ?? [];
    const measure = plan.find((token) => token.kind === 'slot' && token.axis === 'what') ?? null;

    return {
        heading: blockText(plan, 'heading'),
        byline: blockText(plan, 'byline'),
        measure,
        statedElsewhere: measure ? refsStatedBesides(plan, 1, measure) : new Set(),
    };
}

/** A candidates part's summary plan read as one line, for screen readers:
 *  "2 readings." and each reading's heading and byline. Its departures and
 *  assumptions clause are left out, since the answer block states them. */
export function readingsSummary(plan: readonly SentenceToken[] | null | undefined): string {
    return (plan ?? [])
        .filter((token) => ['heading', 'byline'].includes(tokenSegment(token)))
        .map((token) => token.text)
        .join('')
        .trim();
}

/**
 * `plan` with every candidates part's tokens replaced by one heading slot
 * token, at the place of that part's first token: a what-token whose text
 * is the part's variable text ("debt flows to Ghana"), or the summary's own
 * heading when the part has none. The heading draws it as a marked phrase
 * and the reading cards below carry the choice. The part's assumption
 * tokens stay as they are, since the clause states what every reading
 * assumed alike. Returns `plan` itself when no part is a candidates part.
 */
export function foldReadings(
    plan: readonly SentenceToken[],
    parts: readonly (Pick<Part, 'status' | 'variable_text'> | null | undefined)[],
): readonly SentenceToken[] {
    const partCount = parts.length;
    const isReadings = (partIndex: number | null) =>
        partIndex != null && parts[partIndex]?.status === 'candidates';

    if (!plan.some((token) => isReadings(tokenPart(token, partCount)))) return plan;

    const folded = new Set<number>();

    return plan.flatMap((token): SentenceToken[] => {
        const partIndex = tokenPart(token, partCount);

        if (partIndex == null || !isReadings(partIndex) || token.segment === 'assumption') {
            return [token];
        }
        if (folded.has(partIndex)) return [];

        folded.add(partIndex);

        const own = plan.filter((other) => tokenPart(other, partCount) === partIndex);
        const text = parts[partIndex]?.variable_text?.trim() || planSentenceText(own);

        return [{ kind: 'slot', axis: 'what', text, segment: 'heading', part_index: partIndex }];
    });
}
