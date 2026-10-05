/** Pure logic behind the answer block: the heading and byline blocks of a
 *  sentence plan and the departures under them with the action each offers.
 *  No React. */

import { offersStudioCallout } from './resultNotes.ts';
import { tokenPart } from './sentencePlan.ts';
import type { Departure, Part, SentenceToken } from './types.ts';

export type SentenceBlock = {
    segment: 'heading' | 'byline';
    tokens: SentenceToken[];
};

const isSpacing = (token: SentenceToken) => token.kind === 'text' && token.text.trim() === '';

/** The plan's heading and byline as blocks, in plan order: each run of
 *  consecutive tokens in one segment is one block. Departure tokens are
 *  left out, since the departure list draws from `parts[].departures`, so
 *  heading runs a departure separated join into one block. A block's
 *  leading and trailing whitespace-only text tokens are the space between
 *  blocks and are dropped; a block left empty is dropped too. A plan of
 *  several separate sentences (one per part) reads heading, byline,
 *  heading, byline. */
export function sentenceBlocks(plan: readonly SentenceToken[] | null | undefined): SentenceBlock[] {
    const blocks: SentenceBlock[] = [];

    for (const token of plan ?? []) {
        if (token.segment === 'departure') continue;

        const last = blocks.at(-1);

        if (last?.segment === token.segment) last.tokens.push(token);
        else blocks.push({ segment: token.segment, tokens: [token] });
    }

    return blocks
        .map(({ segment, tokens }) => {
            const start = tokens.findIndex((token) => !isSpacing(token));
            const end = tokens.findLastIndex((token) => !isSpacing(token));

            return { segment, tokens: start === -1 ? [] : tokens.slice(start, end + 1) };
        })
        .filter((block) => block.tokens.length > 0);
}

/** What a departure's one action does: open the menu of the visible token
 *  that states `bindingRef` on part `partIndex`, open Refine at the
 *  binding no token states, or hand the part to Studio. */
export type DepartureAction =
    | { kind: 'token'; partIndex: number; bindingRef: string }
    | { kind: 'refine'; partIndex: number; bindingRef: string }
    | { kind: 'studio'; partIndex: number };

/** The refs a token states (SentenceToken.states). A wire that predates
 *  `states` gives the token's own binding_ref, and a source token with no
 *  binding_ref (the answer binds no source slot) states "source:". */
export const tokenStates = (token: SentenceToken): readonly string[] => {
    if (token.states) return token.states;
    if (token.binding_ref) return [token.binding_ref];

    return token.kind === 'slot' && token.axis === 'source' ? ['source:'] : [];
};

// Whether `token` is a visible slot of part `partIndex`: a heading or
// byline slot with text, the part's own or a shared one in the envelope
// plan of a response of `partCount` parts (tokenPart). A null `partIndex`
// names a shared token, which sees the shared tokens alone.
const isVisibleSlotOf = (
    token: SentenceToken,
    partCount: number,
    partIndex: number | null,
): boolean => {
    const owner = tokenPart(token, partCount);

    return (
        token.kind === 'slot' &&
        token.segment !== 'departure' &&
        token.text.trim() !== '' &&
        (owner === partIndex || owner === null)
    );
};

/** The plan index of the visible slot token of part `partIndex` that
 *  states `ref`. -1 when none does, and Refine offers the binding. */
export function statingTokenIndex(
    plan: readonly SentenceToken[] | null | undefined,
    partCount: number,
    partIndex: number,
    ref: string,
): number {
    return (plan ?? []).findIndex(
        (token) => isVisibleSlotOf(token, partCount, partIndex) && tokenStates(token).includes(ref),
    );
}

/** The refs the visible slot tokens of `token`'s part state, `token`'s
 *  own left out: what the sentence says about the answer besides `token`
 *  ("axis:measurementQualifier", which the unit token states beside the
 *  measure). */
export function refsStatedBesides(
    plan: readonly SentenceToken[] | null | undefined,
    partCount: number,
    token: SentenceToken,
): Set<string> {
    const partIndex = tokenPart(token, partCount);

    return new Set(
        (plan ?? [])
            .filter((other) => other !== token && isVisibleSlotOf(other, partCount, partIndex))
            .flatMap(tokenStates),
    );
}

/** The action a departure offers, or null for none. `operation_not_applied`
 *  goes to Studio unless the part's own callout already offers Studio
 *  (`studioCallout`, from offersStudioCallout), so the page draws one
 *  Studio action for it. Any other departure acts only on a definite part,
 *  since a part with no data has no spec to refine. There, a departure
 *  whose `binding_ref` a visible token states opens that token's menu, and
 *  any other ref opens Refine at it. The page drops a Refine action whose
 *  binding Refine does not list. A null ref gets no action. */
export function departureAction(
    departure: Pick<Departure, 'code' | 'binding_ref'>,
    part: { index: number; status: Part['status']; studioCallout: boolean },
    plan: readonly SentenceToken[] | null | undefined,
    partCount: number,
): DepartureAction | null {
    const partIndex = part.index;

    if (departure.code === 'operation_not_applied') {
        return part.studioCallout ? null : { kind: 'studio', partIndex };
    }

    if (part.status !== 'definite') return null;

    const ref = departure.binding_ref;

    if (!ref) return null;

    return statingTokenIndex(plan, partCount, partIndex, ref) === -1
        ? { kind: 'refine', partIndex, bindingRef: ref }
        : { kind: 'token', partIndex, bindingRef: ref };
}

export type AnswerDeparture = {
    /** stable within one answer: part index and position in its list */
    key: string;
    partIndex: number;
    /** the part's variable text, set only when the answer has several parts */
    prefix: string | null;
    departure: Departure;
    action: DepartureAction | null;
};

/** Every part's departures, in part order and each part's own list order,
 *  for the list under the heading. With several parts, each carries its
 *  part's variable text as `prefix`. `plan` is the envelope's composed
 *  plan, which `departureAction` searches for the token to open. A part's
 *  `no_data` and `restatement` decide whether its callout offers Studio. */
export function answerDepartures(
    parts: readonly (Pick<Part, 'status' | 'variable_text' | 'departures'> &
        Partial<Pick<Part, 'no_data' | 'restatement'>>)[],
    plan: readonly SentenceToken[] | null | undefined,
): AnswerDeparture[] {
    const several = parts.length > 1;

    return parts.flatMap((part, partIndex) =>
        (part.departures ?? []).map((departure, position) => ({
            key: `${partIndex}:${position}`,
            partIndex,
            prefix: several ? (part.variable_text ?? null) : null,
            departure,
            action: departureAction(
                departure,
                {
                    index: partIndex,
                    status: part.status,
                    studioCallout: offersStudioCallout(part),
                },
                plan,
                parts.length,
            ),
        })),
    );
}

/** True when the part shows the nearest measure the data holds, so the
 *  answer block draws the muted "Closest match" lead before its heading. */
export function isClosestMatch(part: Pick<Part, 'departures'> | null | undefined): boolean {
    return (part?.departures ?? []).some((departure) => departure.code === 'closest_match');
}
