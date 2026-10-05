/**
 * Free-text phrase refinement, ported from the prototype's refineQuery.
 *
 * Typed text isn't a grounded ref, so it can't ride a dataset_resubmit entry —
 * instead the rendered sentence is spliced (one phrase swapped for the typed text) and
 * re-run as a brand-new raw_text query, letting the engine re-ground
 * everything, including a shape change.
 *
 * Switching the `what` phrase (the measure itself) also drops every how/source
 * phrase and its connective: those qualifiers are owned by the OLD shape and
 * would over-constrain a cross-domain re-ground. Place and time carry over.
 *
 * `plan` can be a multi-part envelope's composed sentence_plan, not just one
 * spec's own plan — the drop removes how/source tokens that share the
 * target's own `part_index`, plus any shared how/source token (no
 * `part_index` at all), since the rebuilt query re-grounds every variable
 * and a shared qualifier would over-constrain it too. Refining one part's
 * `what` phrase never touches another part's bound qualifiers.
 *
 * `source` is the one axis this module drops that can also take the C130a
 * trailing per-variable attribution clause: a shared opener connective,
 * then each declaring part's own qualifier slot paired with a
 * composer-minted " for <variable_text>" glue text, successive entries
 * joined by their own connective. `how` never gets this clause treatment —
 * it stays inline inside a part's own phrase, so only its own preceding
 * connective belongs to it; its following token can be unrelated shared
 * text (e.g. the " in " connective leading into a hoisted `where` phrase)
 * and must survive untouched.
 *
 * Dropping one `source` entry's slot must also settle its neighbouring
 * connectives, which `dropSourceClauseEntries` decides positionally
 * over every `source` clause entry in the plan (not just the target's own),
 * in clause order: the dropped entry's own following glue always goes with
 * it; if an earlier entry in the clause still stands, the token right
 * before this one is a join to that survivor and gets dropped; otherwise
 * this entry would have opened the clause, so the opener is kept and,
 * instead, the join to whatever comes after (if anything survives there)
 * is dropped, letting the opener lead the next survivor; if nothing in the
 * clause survives at all, the opener goes too, so nothing is left dangling.
 * A fully-hoisted `source` (a single shared token, `part_index` null,
 * found as the SLOT itself rather than the text after one) never enters
 * this clause-entry accounting and is left alone beyond the slot.
 *
 * The sentence-terminal "." is never mistaken for glue or a join: in a
 * composed multi-part plan it carries `part_index` null like they do, but a
 * comma-clause slot is never directly adjacent to it (its own glue always
 * intervenes first), and in a single-part plan it carries that part's own
 * `part_index`, not null.
 */

import type { SentenceToken } from './types';

export function spliceSentence(
    plan: SentenceToken[],
    targetIndex: number,
    newText: string,
): string {
    const trimmed = newText.trim();
    const target = plan[targetIndex];
    const targetPart = target?.part_index ?? null;
    const drop = new Set<number>();

    if (target?.axis === 'what') {
        plan.forEach((token, index) => {
            if (index === targetIndex || token.kind !== 'slot' || token.axis !== 'how') {
                return;
            }

            if (token.part_index != null && token.part_index !== targetPart) {
                return;
            }

            drop.add(index);

            if (index > 0 && plan[index - 1].kind === 'text') {
                drop.add(index - 1);
            }
        });

        dropSourceClauseEntries(plan, drop, targetPart);
    }

    return plan
        .map((token, index) => (index === targetIndex ? trimmed : token.text))
        .filter((_, index) => !drop.has(index))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** See the module doc comment for the positional rule this implements. */
function dropSourceClauseEntries(
    plan: SentenceToken[],
    drop: Set<number>,
    targetPart: number | null,
): void {
    const entries = plan
        .map((token, index) => ({ token, index }))
        .filter(
            ({ token }) =>
                token.kind === 'slot' && token.axis === 'source' && token.part_index != null,
        )
        .map(({ index }) => index);

    // Whether each clause entry (by rank) will be dropped, decided up front
    // over the whole clause -- not read back off `drop` mid-loop, which
    // would only reflect ranks already visited and wrongly treat a
    // not-yet-processed entry destined to drop as a survivor.
    const willDrop = entries.map((slotIndex) => plan[slotIndex].part_index === targetPart);

    entries.forEach((slotIndex, rank) => {
        if (!willDrop[rank]) {
            return;
        }

        drop.add(slotIndex);

        const glueIndex = slotIndex + 1;
        const glue = plan[glueIndex];
        if (glue?.kind === 'text' && glue.part_index == null && glueIndex !== plan.length - 1) {
            drop.add(glueIndex);
        }

        const precedeIndex = slotIndex - 1;
        const earlierSurvives = willDrop.slice(0, rank).some((dropped) => !dropped);

        if (earlierSurvives) {
            if (precedeIndex >= 0 && plan[precedeIndex].kind === 'text') {
                drop.add(precedeIndex);
            }
            return;
        }

        const laterSurvives = willDrop.slice(rank + 1).some((dropped) => !dropped);
        if (laterSurvives) {
            const followJoinIndex = glueIndex + 1;
            const followJoin = plan[followJoinIndex];
            if (followJoin?.kind === 'text' && followJoin.part_index == null) {
                drop.add(followJoinIndex);
            }
        } else if (precedeIndex >= 0 && plan[precedeIndex].kind === 'text') {
            drop.add(precedeIndex);
        }
    });
}
