/**
 * `dataset_resubmit`'s `entries` list, built from the run's current parts.
 *
 * Pure: no React, no store, no fetch. Every edit action (editSlot, editWindow,
 * editEntity, pickCandidate, editShared) builds one `entries` list this way and
 * posts it through the door. See useSearchRun.ts for the wiring. This module
 * only shapes the list; it never mutates an identity itself (that stays in
 * promote.ts).
 *
 * A definite part becomes an `identity` entry carrying the part's own
 * current identity. A candidates part becomes a `candidates` entry,
 * preserving posted candidate order. A no_data/unsupported part becomes a
 * `placeholder` entry, holding its position without asking the engine to
 * re-derive anything. Every entry, overrides included, carries its part's
 * `operations`, so an edit keeps what the question asked of the data (a
 * `parsed` entry's part carries its own), and
 * every identity entry carries its part's `assumptions` as the response gave
 * them, so an edit that leaves a declared default's slot alone keeps it.
 */

import type {
    Assumption,
    BaseIdentity,
    DatasetCandidateIdentity,
    DatasetCandidatesEntry,
    DatasetIdentityEntry,
    DatasetPlaceholderEntry,
    DatasetResubmitEntry,
    EntityGroup,
    HydratedPart,
    Operation,
    Spec,
} from './types';

/**
 * How `buildDatasetEntries` deviates from "every part's own current spec":
 * - `{ index, entry }` replaces the entry at one index outright. editSlot,
 *   editWindow, editEntity and pickCandidate all build the edited entry
 *   themselves (a pick posts the chosen candidate's identity) and hand it in
 *   whole.
 * - `{ rewriteIdentity }` is editShared's fan-out: the same axis rewritten in
 *   every definite entry's `identity` (never a candidates or placeholder
 *   entry), in one list, so one post carries every part's edit. Each entry
 *   keeps its own `entity_groups`.
 *
 * A caller may pass more than one override (an array): each applies in turn
 * over the previous step's result, so a later one wins where two touch the
 * same index. useSearchRun.ts's edit lane needs this to chain a post that's
 * already carrying a still-unconfirmed edit: a second edit landing before
 * the first returns keeps both. Permalink replay needs it to apply every
 * stored edit at its own index in one post.
 */
export type DatasetEntriesOverride =
    | { index: number; entry: DatasetResubmitEntry }
    | { rewriteIdentity: (identity: BaseIdentity, part: HydratedPart) => BaseIdentity };

/** A Spec's named groups as a posted identity carries them: beside the
 *  identity, unchanged, whatever edit the identity took. The engine decides
 *  which survive. A Spec with none adds no member. */
export function specEntityGroups(spec: Pick<Spec, 'entity_groups'> | null | undefined): {
    entity_groups?: Record<string, EntityGroup>;
} {
    return spec?.entity_groups ? { entity_groups: spec.entity_groups } : {};
}

/** What a stored share part holds for its replay. */
export type SharedEntryRef = {
    variableText: string | null;
    identity: unknown;
    entityGroups: Record<string, EntityGroup> | null;
    operations: Operation[];
    assumptions: Assumption[] | null;
};

/** The `identity` entry a stored share part replays: the identity as
 *  stored, its groups beside it, the operations its question asked, and
 *  the assumptions its response gave, [] included. A share stored before
 *  assumptions were kept posts none. */
export function sharedRefEntry(ref: SharedEntryRef): DatasetIdentityEntry {
    return {
        entry_kind: 'identity',
        variable_text: ref.variableText ?? '',
        identity: ref.identity as BaseIdentity,
        ...specEntityGroups({ entity_groups: ref.entityGroups }),
        ...(ref.operations.length ? { operations: ref.operations } : {}),
        ...(ref.assumptions ? { assumptions: ref.assumptions } : {}),
    };
}

function identityEntryFor(part: HydratedPart): DatasetIdentityEntry {
    const spec = part.hydratedSpec;
    if (!spec?.identity) {
        throw new Error(
            `buildDatasetEntries: part ${part.index} is definite but has no hydrated identity`,
        );
    }

    return {
        entry_kind: 'identity',
        variable_text: part.variableText ?? '',
        identity: spec.identity,
        ...specEntityGroups(spec),
    };
}

function candidatesEntryFor(part: HydratedPart): DatasetCandidatesEntry {
    const candidateSet = part.part?.candidates;
    if (!candidateSet) {
        throw new Error(`buildDatasetEntries: part ${part.index} has no candidate set`);
    }

    const candidates: DatasetCandidateIdentity[] = candidateSet.specs.map((spec) => {
        if (!spec.identity) {
            throw new Error(
                `buildDatasetEntries: part ${part.index} has a candidate spec with no identity`,
            );
        }
        return { identity: spec.identity, ...specEntityGroups(spec) };
    });

    return {
        entry_kind: 'candidates',
        variable_text: part.variableText ?? '',
        ordering: candidateSet.ordering,
        // The door requires truncated on every candidates entry ("Field
        // required" otherwise); the source CandidateSet marks it optional,
        // so default to false when the response didn't carry one.
        truncated: candidateSet.truncated ?? false,
        candidates,
    };
}

function placeholderEntryFor(part: HydratedPart): DatasetPlaceholderEntry {
    const variable_text = part.variableText ?? '';

    if (part.part?.status === 'no_data') {
        const reason = part.part.no_data?.reason;
        return {
            entry_kind: 'placeholder',
            variable_text,
            status: 'no_data',
            ...(reason ? { reason } : {}),
        };
    }

    const code = part.part?.unsupported?.code;
    return {
        entry_kind: 'placeholder',
        variable_text,
        status: 'unsupported',
        ...(code ? { code } : {}),
    };
}

/** One part's own entry, straight from its current content, no override
 *  applied. Throws if the part has no settled outcome yet (still loading, or
 *  no response has landed for it): a dataset_resubmit only ever posts over
 *  parts that already have content. */
function entryForPart(part: HydratedPart): DatasetResubmitEntry {
    switch (part.part?.status) {
        case 'definite':
            return identityEntryFor(part);
        case 'candidates':
            return candidatesEntryFor(part);
        case 'no_data':
        case 'unsupported':
            return placeholderEntryFor(part);
        default:
            throw new Error(
                `buildDatasetEntries: part ${part.index} has no settled outcome (status=${part.part?.status ?? 'none'})`,
            );
    }
}

/** Apply one override over an already-built `entries` list (see
 *  `DatasetEntriesOverride`'s two forms). Never re-derives from `parts`
 *  itself, since `buildDatasetEntries` is the only place that does that, so
 *  this composes cleanly when a caller folds several overrides in sequence. */
function applyOverride(
    entries: DatasetResubmitEntry[],
    parts: HydratedPart[],
    override: DatasetEntriesOverride,
): DatasetResubmitEntry[] {
    if ('index' in override) {
        return entries.map((entry, i) => (i === override.index ? override.entry : entry));
    }

    return entries.map((entry, i) => {
        if (entry.entry_kind !== 'identity') return entry;
        return { ...entry, identity: override.rewriteIdentity(entry.identity, parts[i]) };
    });
}

/** `entry` with its part's operations attached. A `parsed` entry posts its
 *  `part` unchanged, since that part (a refusal option's request or an
 *  edited restatement) carries its own operations. A part with none leaves
 *  the entry as it is. */
function withOperations(entry: DatasetResubmitEntry, part: HydratedPart): DatasetResubmitEntry {
    const operations = part.part?.operations;

    if (!operations?.length || entry.entry_kind === 'parsed') return entry;
    return { ...entry, operations };
}

/** An identity `entry` with its part's assumptions echoed, unchanged. The
 *  engine decides which still hold after the edit. Every other entry kind,
 *  and a part with none, leaves the entry as it is. */
function withAssumptions(entry: DatasetResubmitEntry, part: HydratedPart): DatasetResubmitEntry {
    const assumptions = part.part?.assumptions;

    if (entry.entry_kind !== 'identity' || assumptions === undefined) return entry;
    return { ...entry, assumptions };
}

/**
 * Build the `entries` list for a `dataset_resubmit` post from the run's
 * current `parts`, in part order. With no override, every entry reflects
 * each part's own current content untouched: the shape a fresh post between
 * edits would carry. See `DatasetEntriesOverride` for what an edit changes;
 * pass an array to apply more than one, in order. Operations and
 * assumptions attach after the overrides, so an edited entry keeps its
 * part's too.
 */
export function buildDatasetEntries(
    parts: HydratedPart[],
    override?: DatasetEntriesOverride | DatasetEntriesOverride[],
): DatasetResubmitEntry[] {
    const overrides = override ? (Array.isArray(override) ? override : [override]) : [];
    const entries = overrides.reduce(
        (acc, one) => applyOverride(acc, parts, one),
        parts.map(entryForPart),
    );

    return entries.map((entry, i) => withAssumptions(withOperations(entry, parts[i]), parts[i]));
}
