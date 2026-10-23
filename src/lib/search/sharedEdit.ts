/**
 * A hoisted qualifier's edit, fanned out to every definite part that carries the axis: which
 * parts it touches, and how it rewrites each touched part's identity. `useSearchRun.editShared`
 * posts the result as one `dataset_resubmit`.
 *
 * Pure, so `node --test` imports it directly.
 */

import { withEntityEdit, withResolvedSlotEdit } from './promote.ts';
import type {
    BaseIdentity,
    EntityRoleKey,
    HydratedPart,
    IdentityFacetBinding,
    IdentityUnitRequest,
    PartSpec,
    RoleAxis,
    Slot,
} from './types.ts';
import { entityOptionsEntry, type EntityOptionsBySpec } from './view.ts';
import type { WindowApplyValue } from './windowState.ts';

/** A hoisted where/when/source/origin/unit/method qualifier's edit, fanned
 *  out to every definite part by `editShared`: one axis, applied everywhere
 *  it hoisted. A unit request applies to every part that converts
 *  (`sharedUnitEdit`); a method binding to every part that binds a method,
 *  the parts a stated method token speaks for. */
export type SharedEdit =
    | { axis: 'where'; binding: Slot['binding']; entityRole: EntityRoleKey }
    | { axis: 'source'; binding: Slot['binding'] }
    | { axis: 'when'; window: WindowApplyValue }
    | { axis: 'entity'; role: RoleAxis; dcid: string }
    | { axis: 'unit'; request: IdentityUnitRequest }
    | { axis: 'method'; binding: IdentityFacetBinding['measurementMethod'] | null };

/** A shared edit that rewrites a slot or an entity role. */
export type SlotSharedEdit = Extract<SharedEdit, { axis: 'where' | 'source' | 'when' | 'entity' }>;

/** The indexes of the definite parts `edit` touches. `origin` (the provider) is not a slot: it
 *  lives on the spec's entities, so an entity edit touches every part with entity options for
 *  its role. Any other edit touches every part with a slot on its axis; a spec flagged
 *  unreadable that carries no slots has none to edit. */
export function sharedEditTouched(
    parts: readonly HydratedPart[],
    edit: SlotSharedEdit,
    entityOptionsBySpec: EntityOptionsBySpec,
): number[] {
    return parts.flatMap((part) => {
        const spec = part.hydratedSpec;

        if (part.part?.status !== 'definite' || !spec) return [];
        if (edit.axis === 'entity') {
            return entityOptionsEntry(spec, entityOptionsBySpec, edit.role) ? [part.index] : [];
        }
        return spec.slots?.some((slot) => slot.key.axis === edit.axis) ? [part.index] : [];
    });
}

/** `identity` with `edit` applied, for a part `sharedEditTouched` returned. */
export function withSharedEdit(
    identity: BaseIdentity,
    spec: PartSpec,
    edit: SlotSharedEdit,
): BaseIdentity {
    if (edit.axis === 'entity') {
        return withEntityEdit(identity, edit.role, [edit.dcid]);
    }
    if (edit.axis === 'when') {
        return { ...identity, requested_window: edit.window };
    }

    const slots = spec.slots ?? [];

    return withResolvedSlotEdit(
        { identity: spec.identity ?? null, slots },
        slots.findIndex((slot) => slot.key.axis === edit.axis),
        edit.binding,
        edit.axis === 'where' ? edit.entityRole : 'observationAbout',
    );
}
