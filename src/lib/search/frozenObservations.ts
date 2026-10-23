/**
 * Which share ref's frozen observations belong to which replayed part.
 *
 * A snapshot share stores, per part, the `spec_id` it was captured under and
 * the frozen observations are read under that id. The `dataset_resubmit`
 * replay answers each ref's entry with a part whose `spec_id` can differ from
 * the stored one, so the frozen observations are looked up through the ref.
 * A resubmit's `entries` carry one entry
 * per part, in response part order, and the response answers only the parts it
 * was posted (dfo-apis `src/search/README.md`, `dataset_resubmit`): part `i`
 * of the response is share ref `i`.
 *
 * Pure, so `node --test` imports it directly.
 */

import type { Part, Spec } from './types.ts';

/** The ref spec_id a replayed definite part was bound to, with the spec_id the
 *  replay returned for it. `refSpecId` is null when the response does not carry
 *  one part per ref, so no ref owns the part. Null for a part that is not
 *  definite. */
export type SnapshotBinding = { replayedSpecId: string; refSpecId: string | null } | null;

/** The slice of a replayed part this module reads; a `Resolution` part fits. */
type ReplayedPart = Pick<Part, 'status'> & { spec?: Pick<Spec, 'spec_id'> };

/** Binds each definite replayed part to its share ref by position. When the
 *  response does not carry one part per ref, position proves nothing: every
 *  definite part is left without a ref, and so reads as unreadable. */
export const bindSnapshotParts = (
    refs: readonly { specId: string }[],
    response: { parts: readonly ReplayedPart[] },
): SnapshotBinding[] =>
    response.parts.map((part, index) =>
        part.status === 'definite' && part.spec
            ? {
                  replayedSpecId: part.spec.spec_id,
                  refSpecId: response.parts.length === refs.length ? refs[index]!.specId : null,
              }
            : null,
    );

/** The share ref spec_id whose frozen observations belong to the part at
 *  `index` now showing `specId`. Null once an edit gives the part another
 *  spec_id than the replay returned, since the frozen observations describe
 *  the captured dataset. */
export const frozenRefSpecId = (
    bindings: readonly SnapshotBinding[],
    index: number,
    specId: string,
): string | null => {
    const binding = bindings[index];

    return binding?.replayedSpecId === specId ? binding.refSpecId : null;
};

/** The spec_ids the page shows whose frozen read failed, including parts no
 *  ref owns. `unreadableRefs` holds share ref spec_ids; with no bindings yet
 *  the set passes through. */
export const unreadableSpecIds = (
    bindings: readonly SnapshotBinding[],
    unreadableRefs: ReadonlySet<string>,
): ReadonlySet<string> =>
    bindings.length === 0
        ? unreadableRefs
        : new Set(
              bindings.flatMap((binding) =>
                  binding && (binding.refSpecId === null || unreadableRefs.has(binding.refSpecId))
                      ? [binding.replayedSpecId]
                      : [],
              ),
          );
