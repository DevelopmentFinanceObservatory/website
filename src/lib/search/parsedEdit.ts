/** Pure logic behind the parsed dataset_resubmit entry. A typed phrase edit
 *  rewrites one restatement field chosen from the token's axis/role (how has
 *  none, falling back to raw-text refineAt). An entity_ambiguous pick
 *  rewrites the restatement entity whose text matches the picked group.
 *  canPinEntityDcid gates a pinned dcid to only when the response itself
 *  carried ambiguous_entities, never invented from a candidate in hand some
 *  other way. */

import type {
    AmbiguousEntityCandidate,
    AmbiguousEntityGroup,
    NoData,
    ParsedPart,
    ParsedPartEntity,
    RoleAxis,
    SlotAxis,
} from './types';

export type RestatementTarget =
    | { field: 'variable_text' }
    | { field: 'time_text' }
    | { field: 'source_text' }
    | { field: 'entity'; role: RoleAxis | null };

/** how facets are bound on Spec.slots, not restated on ParsedPart. Null
 *  means the caller falls back to raw-text refineAt. */
export function restatementTargetForToken(
    axis: SlotAxis | null | undefined,
    role: RoleAxis | null | undefined,
): RestatementTarget | null {
    switch (axis) {
        case 'what':
            return { field: 'variable_text' };
        case 'when':
            return { field: 'time_text' };
        case 'source':
            return { field: 'source_text' };
        case 'where':
            return { field: 'entity', role: role ?? null };
        default:
            return null;
    }
}

/** `RoleAxis` -> the `role_text` word a restatement entity for that role
 *  carries (`{role_text: "to" | "from"}`). */
const ROLE_TEXT: Record<RoleAxis, string> = { origin: 'from', destination: 'to' };

/** Whether a restatement entity fills the token's role: its `role_text`
 *  for a directional role, no `role_text` for a subject. */
const inRole = (entity: ParsedPartEntity, role: RoleAxis | null): boolean =>
    (entity.role_text ?? null) === (role ? ROLE_TEXT[role] : null);

/** Null means target names a role/subject the restatement doesn't carry:
 *  stale or unpostable, not a safe edit to send. */
export function applyRestatementEdit(
    restatement: ParsedPart,
    target: RestatementTarget,
    text: string,
): ParsedPart | null {
    switch (target.field) {
        case 'variable_text':
            return { ...restatement, variable_text: text };
        case 'time_text':
            return { ...restatement, time_text: text };
        case 'source_text':
            return { ...restatement, source_text: text };
        case 'entity': {
            const entities = restatement.entities ?? [];
            const index = entities.findIndex((entity) => inRole(entity, target.role));
            if (index === -1) return null;

            // One token renders every entity in its role ("to Kenya and
            // Ethiopia"), so the typed text replaces them all, in the first
            // one's place. The old dcids were pinned for the picked text, not
            // for whatever the caller types next, so the replacement drops them.
            const { role_text } = entities[index];
            const replacement = role_text ? { text, role_text } : { text };
            const updated = entities.flatMap((entity, i) =>
                i === index ? [replacement] : inRole(entity, target.role) ? [] : [entity],
            );
            return { ...restatement, entities: updated };
        }
    }
}

/** Null means there's no restatement to edit from, or the axis/role has no
 *  restatement field. The caller's cue is to fall back to the raw-text
 *  refineAt path. */
export function resolveTypedEdit(
    restatement: ParsedPart | null | undefined,
    axis: SlotAxis | null | undefined,
    role: RoleAxis | null | undefined,
    text: string,
): ParsedPart | null {
    if (!restatement) return null;

    const target = restatementTargetForToken(axis, role);
    if (!target) return null;

    return applyRestatementEdit(restatement, target, text);
}

export function canPinEntityDcid(
    noData: NoData | null | undefined,
): noData is NoData & { ambiguous_entities: AmbiguousEntityGroup[] } {
    return Boolean(noData?.ambiguous_entities?.length);
}

type AmbiguousPickerPart = { no_data?: NoData | null; restatement?: ParsedPart | null };

const hasAmbiguousPickerShape = (part: unknown): part is AmbiguousPickerPart =>
    typeof part === 'object' && part !== null;

/** Whether a no_data part renders SearchCards' "Choose a Match" picker
 *  rather than a generic Studio hand-off panel: an entity_ambiguous reason,
 *  a response that itself carried ambiguous_entities (canPinEntityDcid), and
 *  a restatement to pin the pick onto. The one gate SearchCards and
 *  studioHandoffParts must agree on, so a picker-eligible part always keeps
 *  its own picker instead of collapsing into the generic studio callout. */
export function offersAmbiguousPicker(part: unknown): part is AmbiguousPickerPart & {
    no_data: NoData & { ambiguous_entities: AmbiguousEntityGroup[] };
    restatement: ParsedPart;
} {
    if (!hasAmbiguousPickerShape(part)) return false;

    return (
        part.no_data?.reason === 'entity_ambiguous' &&
        canPinEntityDcid(part.no_data) &&
        Boolean(part.restatement)
    );
}

/** Rewrites the restatement entity whose text equals groupText to the
 *  candidate's label, pinned with its dcid. Returns null when no entity
 *  matches (the invariant broken), which the caller must treat as a no-op
 *  rather than re-confirming the same ambiguity. */
export function buildAmbiguousPickPart(
    restatement: ParsedPart,
    groupText: string,
    candidate: AmbiguousEntityCandidate,
): ParsedPart | null {
    const entities = restatement.entities ?? [];
    const index = entities.findIndex((entity) => entity.text === groupText);
    if (index === -1) return null;

    const updated = entities.slice();
    updated[index] = { ...updated[index], text: candidate.label, dcid: candidate.dcid };
    return { ...restatement, entities: updated };
}
