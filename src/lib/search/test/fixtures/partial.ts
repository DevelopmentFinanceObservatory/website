/**
 * Hand-written fixtures that hold only the members a test reads. Each member may be left out at any
 * depth (a `resolution` with only `resolved_sources`), and every member a fixture names keeps its
 * wire name and type.
 */

import type { Slot, Spec, SpecReading } from '../../types.ts';

/** `T` with every member optional, at every depth. */
export type DeepPartial<T> = unknown extends T
    ? T
    : T extends string | number | boolean | null | undefined
      ? T
      : T extends readonly (infer U)[]
        ? DeepPartial<U>[]
        : { [K in keyof T]?: DeepPartial<T[K]> };

/** A partial readable spec fixture, as the view helpers read a spec. An unreadable fixture is
 * typed as `UnreadableSpec` directly, so its raw `stat_vars` never passes as readable. */
export const partialSpec = (fixture: DeepPartial<Spec>): SpecReading => fixture as SpecReading;

/** A partial slot fixture. */
export const partialSlot = (fixture: DeepPartial<Slot>): Slot => fixture as Slot;
