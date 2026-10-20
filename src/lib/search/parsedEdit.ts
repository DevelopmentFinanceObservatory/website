/** Pure logic behind the parsed dataset_resubmit entry. A typed phrase edit
 *  rewrites one restatement field chosen from the token's axis/role (how has
 *  none, falling back to raw-text refineAt). An entity_ambiguous pick posts
 *  one of the refusal's own options (`no_data.options`) unchanged
 *  (entityChoiceGroups, entityChoicePart). */

import type {
    NoData,
    NoDataOption,
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

/** One ambiguous wording of an entity_ambiguous refusal and the options
 *  that settle it (`no_data.options` whose `mentions` hold the wording), in
 *  the order the refusal lists them. */
export type EntityChoiceGroup = { text: string; options: NoDataOption[] };

/** The refusal's options grouped by the wording each settles, wordings in
 *  the order their first option comes. An option settling two wordings
 *  stands in both groups. Empty for every reason but entity_ambiguous. */
export function entityChoiceGroups(noData: NoData | null | undefined): EntityChoiceGroup[] {
    if (noData?.reason !== 'entity_ambiguous') return [];

    const groups = new Map<string, NoDataOption[]>();

    for (const option of noData.options ?? []) {
        for (const text of option.mentions) {
            groups.set(text, [...(groups.get(text) ?? []), option]);
        }
    }

    return [...groups].map(([text, options]) => ({ text, options }));
}

/** The part an entity choice posts: its option's one-part request,
 *  unchanged. Null for an option carrying no part. */
export const entityChoicePart = (option: NoDataOption): ParsedPart | null =>
    option.data_query.parts[0] ?? null;

/** Whether a no_data part renders a "Choose a Match" picker rather than a
 *  generic Studio hand-off panel: an entity_ambiguous refusal with at least
 *  one option (entityChoiceGroups). The one gate SearchCards, SearchSentence
 *  and studioHandoffParts agree on, so a picker-eligible part always keeps
 *  its own picker instead of collapsing into the generic studio callout. */
export function offersAmbiguousPicker(part: unknown): part is { no_data: NoData } {
    if (typeof part !== 'object' || part === null) return false;

    return entityChoiceGroups((part as { no_data?: NoData | null }).no_data).length > 0;
}
