/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are validated field by field below */
import type {
    Assumption,
    AssumptionKind,
    EntityGroup,
    EntityRoleKey,
    HydratedPart,
    Operation,
} from './types.ts';

/**
 * The shape and limits of a search share request, checked before any
 * platform call. Like `snapshot.ts`, this module has no database or
 * path-alias dependency, so `node --test` imports it directly.
 */

export type SearchShareMode = 'live' | 'snapshot';

const MODES: SearchShareMode[] = ['live', 'snapshot'];

/** One definite part of the result being shared, as the page holds it. */
export type SearchSharePart = {
    partIndex: number;
    variableText: string | null;
    specId: string;
    identity: unknown;
    // The Spec's named groups, keyed by role key, which the replay posts
    // beside the identity. Null when no role was asked for as a group.
    entityGroups?: Record<string, EntityGroup> | null;
    // What the question asked of the part beyond its data. The replay
    // carries them back.
    operations: Operation[];
    // The values the answer filled that the question did not ask for, as
    // the response gave them, [] included. The replay echoes them, so a
    // shared answer states the same defaults. Null when the response gave
    // none.
    assumptions?: Assumption[] | null;
    // The canonical definition from the resolve response, which register
    // and mint take. Not stored, since the identity is enough to replay.
    definition: unknown;
};

const SPEC_SHAPE = /^spec_[a-z0-9]+$/;

const ENTITY_ROLE_KEYS: string[] = [
    'observationAbout',
    'origin',
    'destination',
] satisfies EntityRoleKey[];

// Search's own bounds on an `EntityGroup`: a label of 1 to 120 code points,
// and a ref, an entity type and a total of at most 1024 characters each.
const GROUP_LABEL_MAX_LENGTH = 120;
const GROUP_IDENTIFIER_MAX_LENGTH = 1024;

const isGroupIdentifier = (value: unknown): boolean =>
    value == null || (typeof value === 'string' && value.length <= GROUP_IDENTIFIER_MAX_LENGTH);

const isPlainObject = (value: any): boolean =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const isEntityGroup = (value: any): value is EntityGroup =>
    isPlainObject(value) &&
    Object.keys(value).every(
        (member) =>
            member === 'ref' ||
            member === 'label' ||
            member === 'entity_type' ||
            member === 'total',
    ) &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    // A label within the bound spans at most two UTF-16 units per code point.
    value.label.length <= GROUP_LABEL_MAX_LENGTH * 2 &&
    [...value.label].length <= GROUP_LABEL_MAX_LENGTH &&
    isGroupIdentifier(value.ref) &&
    isGroupIdentifier(value.entity_type) &&
    isGroupIdentifier(value.total);

/** A part's groups as Search takes them beside an identity: one group per
 *  role key at most, each holding a label and an optional ref, entity type
 *  and total only. */
const isEntityGroups = (value: any): value is Record<string, EntityGroup> =>
    isPlainObject(value) &&
    Object.entries(value).every(
        ([role, group]) => ENTITY_ROLE_KEYS.includes(role) && isEntityGroup(group),
    );

const ASSUMPTION_KINDS: string[] = [
    'declared_default',
    'open_role',
    'place_scope',
] satisfies AssumptionKind[];

// Search's own bounds on an echoed `Assumption`: a text of 1 to 200 code
// points, at most one ref of at most 1024 characters, a binding ref of at
// most 1036 characters, and at most 67 items in a part's list. A share
// storing one past them cannot open.
const ASSUMPTION_TEXT_MAX_LENGTH = 200;
const ASSUMPTION_MAX_REFS = 1;
const ASSUMPTION_REF_MAX_LENGTH = 1024;
const ASSUMPTION_BINDING_REF_MAX_LENGTH = 1036;
const ASSUMPTIONS_MAX = 67;

const isAssumption = (value: any): value is Assumption =>
    isPlainObject(value) &&
    Object.keys(value).every((member) =>
        ['kind', 'binding_ref', 'refs', 'text'].includes(member),
    ) &&
    ASSUMPTION_KINDS.includes(value.kind) &&
    typeof value.binding_ref === 'string' &&
    value.binding_ref.length <= ASSUMPTION_BINDING_REF_MAX_LENGTH &&
    Array.isArray(value.refs) &&
    value.refs.length <= ASSUMPTION_MAX_REFS &&
    value.refs.every(
        (ref: unknown) => typeof ref === 'string' && ref.length <= ASSUMPTION_REF_MAX_LENGTH,
    ) &&
    typeof value.text === 'string' &&
    value.text.length > 0 &&
    // A text within the bound spans at most two UTF-16 units per code point.
    value.text.length <= ASSUMPTION_TEXT_MAX_LENGTH * 2 &&
    [...value.text].length <= ASSUMPTION_TEXT_MAX_LENGTH;

/** A part's echoed list as Search takes it: within the item cap, every item
 *  an `Assumption` within its bounds. */
export const isAssumptions = (value: any): value is Assumption[] =>
    Array.isArray(value) && value.length <= ASSUMPTIONS_MAX && value.every(isAssumption);

export const isSearchSharePart = (value: any): value is SearchSharePart =>
    !!value &&
    typeof value === 'object' &&
    Number.isInteger(value.partIndex) &&
    typeof value.specId === 'string' &&
    SPEC_SHAPE.test(value.specId) &&
    !!value.identity &&
    typeof value.identity === 'object' &&
    // Search refuses an identity that holds its groups, so a share storing
    // one cannot open.
    !Object.hasOwn(value.identity, 'entity_groups') &&
    (value.entityGroups == null || isEntityGroups(value.entityGroups)) &&
    Array.isArray(value.operations) &&
    (value.assumptions == null || isAssumptions(value.assumptions)) &&
    !!value.definition &&
    typeof value.definition === 'object';

/** The share part a definite part on screen posts: its Spec's identity, with
 *  the Spec's groups beside it, and the part's operations and assumptions. */
export const searchSharePart = (part: HydratedPart): Required<SearchSharePart> => {
    const spec = part.hydratedSpec as any;

    return {
        partIndex: part.index,
        variableText: part.variableText,
        specId: spec.spec_id,
        identity: spec.identity,
        entityGroups: spec.entity_groups ?? null,
        operations: part.part?.operations ?? [],
        assumptions: part.part?.assumptions ?? null,
        definition: spec.definition,
    };
};

/**
 * The most parts one search share holds. Matches Search's `SEARCH_MAX_PARTS`,
 * the most parts a result carries, so a larger request cannot have come from
 * the page.
 */
export const SEARCH_SHARE_MAX_PARTS = 6;

export type SearchShareRequest = {
    mode: SearchShareMode;
    query: string;
    parts: SearchSharePart[];
};

/** The request a body describes, or null when the share route should answer 400. */
export const readSearchShareRequest = (body: any): SearchShareRequest | null => {
    const parts = Array.isArray(body?.parts) ? body.parts : [];
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 500) : '';

    if (
        !MODES.includes(body?.mode) ||
        !query ||
        parts.length === 0 ||
        parts.length > SEARCH_SHARE_MAX_PARTS ||
        !parts.every(isSearchSharePart)
    ) {
        return null;
    }

    return { mode: body.mode, query, parts };
};
