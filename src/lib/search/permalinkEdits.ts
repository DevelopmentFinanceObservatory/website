import type { DatasetEntriesOverride } from './datasetEntries';
import type { PermalinkEdit } from './permalink';
import type { DatasetResubmitEntry, Part } from './types';

/** A later parsed/identity entry replaces an older record at the same
 *  index. Any other landed kind (candidates, placeholder) deletes it
 *  instead. The guard is the BASE run's fixed phrase per part, never the
 *  posted entry's own text, which can carry an already-edited phrase and
 *  would otherwise let a second edit inherit a stale guard. */
export function nextEditsByPart(
    prev: Record<number, PermalinkEdit>,
    entries: DatasetResubmitEntry[],
    touchedIndices: number[],
    basePhrases: (string | null)[],
): Record<number, PermalinkEdit> {
    const next = { ...prev };

    for (const index of touchedIndices) {
        const entry = entries[index];

        if (entry && (entry.entry_kind === 'identity' || entry.entry_kind === 'parsed')) {
            next[index] = {
                part: index,
                variableText: basePhrases[index] ?? null,
                entry,
            };
        } else {
            delete next[index];
        }
    }

    return next;
}

/** An edit whose part no longer asks the same variable is reported stale
 *  instead of applied. */
export function buildReplayPlan(
    edits: PermalinkEdit[],
    parts: Part[],
): { overrides: DatasetEntriesOverride[]; touched: number[]; stale: number[] } {
    const overrides: DatasetEntriesOverride[] = [];
    const touched: number[] = [];
    const stale: number[] = [];

    for (const edit of edits) {
        const current = parts[edit.part];

        if (!current || current.variable_text !== edit.variableText) {
            if (current) stale.push(edit.part);
            continue;
        }

        overrides.push({ index: edit.part, entry: edit.entry });
        touched.push(edit.part);
    }

    return { overrides, touched, stale };
}
