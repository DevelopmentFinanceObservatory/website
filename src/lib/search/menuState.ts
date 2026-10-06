/** Pure decisions for the per-part slot/entity menus: loading gates (a menu
 *  opened before its trailing options frame lands must not read as
 *  confirmed-empty, only while the base stream could still deliver it). */

import type { EntityOptionsEntry, SlotOptionsEntry } from './view.ts';

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
