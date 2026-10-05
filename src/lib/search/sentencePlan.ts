/**
 * Routes an envelope's composed `sentence_plan` (Resolution.sentence_plan)
 * tokens to the part they belong to, for menu and status routing. The
 * sentence itself renders every token inline, in plan order — this module
 * only answers "whose part is this token," nothing about grouping or
 * layout. Pure; no React.
 */

import type { SentenceToken } from './types';

/** The part `token` belongs to, in a response of `partCount` parts. With
 *  one part (or none yet), every token is that part's, whatever indexes
 *  the plan stamps. With several, a token's own `part_index` names its
 *  part, and a token with none is shared: a connective, a hoisted
 *  qualifier, a joint byline, the terminal ".". Null for a shared token. */
export function tokenPart(token: SentenceToken, partCount: number): number | null {
    return partCount <= 1 ? 0 : (token.part_index ?? null);
}

/** The early, pre-response heading: the `sentence` plan of every part that
 *  has one so far (useSearchRun's partSentencePlans), in part order and
 *  stamped with that part's index, so tokenPart routes it like an
 *  envelope-level plan. Parts are joined by a bare space, part_index null,
 *  as dfo-apis' search/render/compose.py _compose_per_part joins parts it
 *  cannot hoist into one sentence. The engine's tokens carry their own
 *  spacing, so they join verbatim. A part without a plan is left out. Null
 *  until at least one part has a plan. */
export function earlySentenceTokens(
    expectedCount: number,
    partPlans: readonly (SentenceToken[] | null | undefined)[],
): SentenceToken[] | null {
    if (expectedCount <= 0) return null;

    const tokens: SentenceToken[] = [];
    let seenPart = false;

    for (let index = 0; index < expectedCount; index++) {
        const plan = partPlans[index];

        if (!plan) continue;

        if (seenPart)
            tokens.push({ kind: 'text', text: ' ', segment: 'heading', part_index: null });
        seenPart = true;
        tokens.push(...plan.map((token) => ({ ...token, part_index: index })));
    }

    if (!seenPart) return null;

    return tokens;
}

/** The heading a plan reads as: its heading tokens joined verbatim, since
 *  the engine's tokens carry their own spacing, and trimmed. The byline
 *  (unit and source) and departure tokens are left out. Empty for a
 *  missing plan. */
export function planSentenceText(plan: readonly SentenceToken[] | null | undefined): string {
    return (plan ?? [])
        .filter((token) => token.segment === 'heading')
        .map((token) => token.text)
        .join('')
        .trim();
}
