/** Identity-edit helpers for a `dataset_resubmit` identity entry. */

import type {
    BaseIdentity,
    EntityRoleKey,
    IdentityBinding,
    IdentityFacetAxis,
    IdentityFacetRefBinding,
    IdentityFacetBinding,
    IdentityFacets,
    Spec,
} from './types';

// ---------------------------------------------------------------------------
// Resolved-binding → identity-binding adapters
// ---------------------------------------------------------------------------
// The page's slot editors (SearchSentence.tsx, SlotMenu.tsx) build a binding
// in the engine's RESOLVED wire shape (`{kind:'unbound'}` /
// `{kind:'value', value:{ref, value_kind}}` — Spec.slots[i].binding), because
// that's what slot_options entries and the currently-bound value carry. The
// identity core's own binding shape is `{state, ref}` (bare dcid), not
// `{kind, value:{ref:{ref,label}}}` — these adapters bridge the two without
// asking the editors to know about the identity wire shape at all.

/** A slot's binding in the engine's resolved shape. */
type ResolvedBinding = Spec['slots'][number]['binding'];

/** The bound dcid a resolved binding carries, or null when it binds nothing
 *  (unbound, or a set, which names no single dcid). */
function resolvedBindingDcid(binding: ResolvedBinding | null | undefined): string | null {
    return binding?.kind === 'value' ? (binding.value.ref?.ref ?? null) : null;
}

/** One dcid for value, every member's for set. None for unbound or absent. */
function resolvedBindingDcids(binding: ResolvedBinding | null | undefined): string[] {
    switch (binding?.kind) {
        case 'set':
            return binding.values.flatMap((value) => value.ref?.ref ?? []);
        case 'value':
            return binding.value.ref?.ref ? [binding.value.ref.ref] : [];
        default:
            return [];
    }
}

/** Convert a resolved what/how slot binding to its identity-slot form. Every
 *  shape-declared slot is dense (always present, `unbound` if nothing is
 *  bound), so — unlike facets/entities — there is no "drop" case here. */
export function toIdentitySlotBinding(
    binding: ResolvedBinding | null | undefined,
): IdentityBinding {
    const dcid = resolvedBindingDcid(binding);
    return dcid ? { state: 'value', ref: dcid } : { state: 'unbound' };
}

/** Convert a resolved binding to a facet binding, or null when it should be
 *  dropped from the sparse `facets` map entirely (the facet union has no
 *  `unbound` state — an unconstrained axis is simply absent). */
function toIdentityFacetBinding(
    binding: ResolvedBinding | null | undefined,
): IdentityFacetRefBinding | null {
    const dcid = resolvedBindingDcid(binding);
    return dcid ? { state: 'value', ref: dcid } : null;
}

// ---------------------------------------------------------------------------
// Identity-edit helpers: each returns the next identity. The posted identity
// is the whole definition, so a role or facet axis it leaves out is dropped.
// ---------------------------------------------------------------------------

/** Replace one what/how slot's binding, matched by property dcid. Every
 *  other slot rides through untouched, so shape-declared completeness
 *  (identity_edit.check_slots_declared) is preserved for free. */
export function withSlotBinding(
    identity: BaseIdentity,
    property: string | null | undefined,
    binding: IdentityBinding,
): BaseIdentity {
    if (!property) return identity;
    return {
        ...identity,
        slots: identity.slots.map((slot) =>
            slot.property === property ? { ...slot, binding } : slot,
        ),
    };
}

/** Bind or drop one entity role (`observationAbout`/`origin`/`destination`).
 *  `dcids` null/empty drops the role entirely. */
export function withEntityEdit(
    identity: BaseIdentity,
    role: EntityRoleKey,
    dcids: string[] | null,
): BaseIdentity {
    const entities = { ...identity.entities };
    const bound = dcids && dcids.length > 0;

    if (bound) {
        entities[role] = dcids;
    } else {
        delete entities[role];
    }

    return { ...identity, entities };
}

/** Bind or drop one facet axis (e.g. `provenance` for the source picker).
 *  `binding` null drops the axis from the sparse map. */
export function withFacetEdit<A extends IdentityFacetAxis>(
    identity: BaseIdentity,
    axis: A,
    binding: IdentityFacetBinding[A] | null,
): BaseIdentity {
    const facets: IdentityFacets = { ...identity.facets };

    if (binding) {
        facets[axis] = binding;
    } else {
        delete facets[axis];
    }

    return { ...identity, facets: Object.keys(facets).length ? facets : undefined };
}

/**
 * Route one resolved-slot edit (editSlot's `(spec, slotIndex, binding)`) to
 * the right member of `identity`: what/how slots by property dcid, `where`
 * to the role carried by its sentence token, `source` to facets.provenance.
 * A non-directional where token has no role and uses observationAbout.
 * `when` never reaches here — SearchSentence.tsx's WindowEditor calls
 * onEditWindow directly.
 */
export function withResolvedSlotEdit(
    spec: Pick<Spec, 'identity' | 'slots'>,
    slotIndex: number,
    binding: ResolvedBinding,
    entityRole: EntityRoleKey = 'observationAbout',
): BaseIdentity {
    const identity = spec.identity as BaseIdentity;
    const slot = spec.slots[slotIndex];
    const axis = slot?.key?.axis;

    if (axis === 'where') {
        const dcids = resolvedBindingDcids(binding);
        return withEntityEdit(identity, entityRole, dcids.length ? dcids : null);
    }
    if (axis === 'source') {
        return withFacetEdit(identity, 'provenance', toIdentityFacetBinding(binding));
    }
    return withSlotBinding(identity, slot?.key?.property?.ref, toIdentitySlotBinding(binding));
}
