/** Pure decisions for the per-part slot/entity menus: loading gates (a menu
 *  opened before its trailing options frame lands must not read as
 *  confirmed-empty, only while the base stream could still deliver it) and
 *  the unbind edit's payload (mirrors editSlot's own removed shape, since
 *  check_edit_incomplete refuses a dropped role without it). */

import { promoteFromSpec, withEntityEdit, type PromoteFields } from './promote.ts';
import type { BaseIdentity, RemovedParts, RoleAxis, Spec } from './types.ts';
import type { EntityOptionsEntry, SlotOptionsEntry } from './view.ts';

type SpecLike = {
    identity: BaseIdentity;
    stat_vars?: Pick<Spec['stat_vars'], 'items'> | null;
};

/** Reads the map directly. slotOptionsEntry's defaulted read cannot tell an
 *  unseen entry from an empty one, and only an unseen entry means "not
 *  arrived". */
export function awaitingSlotOptions(
    bySpec: Record<string, Record<string, SlotOptionsEntry>>,
    specId: string,
    key: string,
    baseStreamOpen: boolean,
): boolean {
    return baseStreamOpen && bySpec[specId]?.[key] === undefined;
}

export function awaitingEntityOptions(
    entry: EntityOptionsEntry | undefined,
    baseStreamOpen: boolean,
): boolean {
    return baseStreamOpen && entry === undefined;
}

/** dcids binds the role to the whole set. null/[] drops it. Dropping a role
 *  the base had bound must travel as removed.entities or the door's
 *  check_edit_incomplete refuses the post. */
export function entityEditForPick(
    fromSpec: SpecLike,
    role: RoleAxis,
    dcids: string[] | null,
): { identity: BaseIdentity; extra: PromoteFields & { removed?: RemovedParts } } {
    const { identity, removed } = withEntityEdit(fromSpec.identity, role, dcids);

    return {
        identity,
        extra: {
            ...promoteFromSpec(fromSpec as Spec),
            ...(removed ? { removed } : {}),
        },
    };
}
