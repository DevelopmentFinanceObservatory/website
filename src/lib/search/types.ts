/**
 * Search engine contract — TypeScript mirror.
 *
 * Single source of truth for every consumer. These types mirror the Search API
 * contract shipped by dfo-apis (authoritative pydantic models; live schema at
 * `GET /api/search/schema`). The engine owns the contract; we consume it. When
 * the models and these types diverge, the models win and these types must be
 * updated (and the schema_version bumped if MAJOR).
 *
 * MIRROR: A second, deliberately-shallow mirror lives at `lib/search/searchClient.ts`
 * (transport-level event types). Keep both aligned with the engine schema; this file is the fuller one.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Contract v1 (deployed 2026-08-17): an integer version tag. The pre-release
 *  "1.0" string form is refused with unsupported_schema_version. */
export type SchemaVersion = number;

/** The only three outcomes the envelope can carry. */
export type ResolveStatus = 'definite' | 'candidates' | 'no_data';

/** A directional flow endpoint (provider/recipient read-back). Mirrors the
 *  server's own `RoleAxis` name and values one-for-one (dfo-apis
 *  dfo_platform/roles.py:17, src/search/models/grammar.py:293). */
export type RoleAxis = 'origin' | 'destination';

/** One currency a unit_not_resolved refusal offers in place of the unit phrase it could
 *  not resolve. Mirrors dfo-apis src/search/models/outcomes.py's UnitAlternative. */
export interface UnitAlternative {
    /** the value a caller resubmits as facets.unit.request.currency: an ISO 4217
     *  code, or a role shape for a role-relative currency phrase */
    currency: string | IdentityCurrencyRole;
    /** the currency's display name, or the role's reader-facing noun */
    label: string;
}

/**
 * Mirrors the server's own Ordering (dfo-apis vocab.py) one-for-one:
 * broadest_first when ambiguous from the start (descending breadth, spec_id
 * tie-break); intent_rank when the near-neighbor margin gate downgraded a
 * definite answer, best-match first.
 */
export type Ordering = 'broadest_first' | 'intent_rank';

/** Why a no_data outcome was returned (closed enum). */
export type NoDataReason =
    | 'entity_not_resolved'
    | 'entity_ambiguous'
    | 'entity_set_too_large'
    | 'entity_role_not_admitted'
    | 'variable_not_resolved'
    | 'role_not_resolved'
    | 'unit_not_resolved'
    | 'rate_coverage_gap'
    | 'no_matching_slice'
    | 'binding_mismatch'
    | 'denominator_not_available'
    | 'no_observations'
    | 'facet_not_available'
    | 'role_incompatible'
    | 'role_signature_incompatible'
    | 'qualifier_not_bound';

/**
 * Present on `NoData.gate` exactly when `flagged_match` or `alternate_match`
 * is present, except `role_incompatible`/`qualifier_not_bound`, whose
 * `flagged_match` records a graph-confirmed identity with no availability
 * verdict taken. Mirrors dfo-apis `NoDataGate` one-for-one.
 */
export type NoDataGate =
    | 'no_member_has_data_at_place'
    | 'no_member_asserts_bound_properties'
    | 'only_alternate_has_data';

/** Warning severity levels. */
export type WarningSeverity = 'info' | 'warn' | 'degraded';

/** Qualitative retrieval confidence for an interpretation. */
export type Confidence = 'high' | 'medium' | 'low';

/** Where a slot's option set came from. */
export type SlotOptionsSource = 'observed' | 'seed';

/**
 * Where a level-scoped SlotOption sits relative to its slot's bound value:
 * "child"/"parent" narrow or widen one step in a hierarchical code system's
 * taxonomy. "root" is a classification root: every root of an unbound
 * slot, every other root beside a bound root, or any value of a flat code
 * system, so it does not tell bound from unbound. Mirrors the server's
 * SlotOptionRelation (dfo-apis src/search/models/vocab.py) one-for-one.
 */
export type SlotOptionRelation = 'child' | 'parent' | 'root';

/**
 * What one party of a flow is beside the other parties on its side: a
 * `party` holds figures of its own, a `total` holds other parties' figures
 * ("Africa, Total"), so a sum across the role that counts it counts its
 * members twice, and a `residual` holds figures no other party holds. Mirrors
 * PartyKind (dfo-apis src/search/models/vocab.py) one-for-one.
 */
export type PartyKind = 'party' | 'total' | 'residual';

/** A {ref, label} pair. Every identifier in the contract is a GraphRef. */
export interface GraphRef {
    /** the graph identifier, a dcid */
    ref: string;
    /** plain-language display name, read from the graph */
    label: string;
}

/** The Data Commons a provenance's data comes from: the Observatory's own
 *  imports, Data Commons by Google, or the UN System Data Commons. Mirrors
 *  dfo-apis src/search/models/vocab.py DataCommonsId. */
export type DataCommonsId = 'dfo' | 'base' | 'un_system';

/** The organisation behind a provenance, which is the Source node its
 *  `source` arc names or, on the UN System Data Commons, the agency
 *  provenance itself. The site calls it the publisher. */
export interface SourceRef {
    ref: string;
    label: string;
}

/** The Data Commons a provenance's data comes from, with its display name
 *  (Development Finance Observatory, Data Commons by Google, UN System Data
 *  Commons). */
export interface DataCommonsRef {
    id: DataCommonsId;
    label: string;
}

/** A provenance on the wire (dfo-apis src/search/models/grammar.py
 *  ProvenanceRef). `source` and `data_commons` come from the origin
 *  catalogue, and are absent for a provenance the catalogue does not list,
 *  which then carries its dcid as `label`. */
export interface ProvenanceRef extends GraphRef {
    source?: SourceRef | null;
    data_commons?: DataCommonsRef | null;
    /** the Graph API route of the provenance's document,
     *  `/api/graph/documentation/{dcid}` */
    documentation: string;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/** The fixed slot-grammar axes the engine defines. */
export type SlotAxis = 'what' | 'how' | 'where' | 'when' | 'source';

export interface SlotKey {
    axis: SlotAxis;
    /**
     * The constraint property that defines this slot when one exists; non-null on
     * how/what/where when a specific property drives the axis; null for when,
     * source, and the where-axis slot that binds the subject/recipient entity
     * directly (no constraint property backs it).
     */
    property: GraphRef | null;
    /** human label, e.g. "purpose", "provider" */
    label: string;
}

export interface TimeWindow {
    /** absent => open-ended start */
    start_year?: number;
    /** absent => open-ended end ("to latest") */
    end_year?: number;
}

/**
 * A requested when-axis signal for identity purposes: either a concrete
 * TimeWindow, or the literal "latest" for a query that explicitly asked for
 * the most-recent/current value. Distinct from `undefined` (no date signal at
 * all) — a resubmit carrying "latest" re-resolves to whatever year is currently
 * latest, instead of pinning to the year the original request resolved to.
 */
export type RequestedWindow = TimeWindow | 'latest';

export type SlotValueKind = 'entity' | 'enum_value' | 'time_window' | 'source' | 'literal';

export interface SlotValue {
    /** the graph object bound, when the value is a graph object */
    ref?: GraphRef;
    value_kind: SlotValueKind;
    /** present iff value_kind === "time_window" */
    time_window?: TimeWindow;
    /** present iff value_kind === "literal" */
    literal?: string;
}

/** Exactly one taxonomy member. */
export interface BindingValue {
    kind: 'value';
    value: SlotValue;
}

/** Two or more members, all in scope (union). A length-1 set is illegal. */
export interface BindingSet {
    kind: 'set';
    values: SlotValue[];
    /** the group the set was drawn from, when one exists (e.g. "DAC donors") */
    set_ref?: GraphRef;
}

/** Explicit "whole slot in scope" — NOT null/missing. */
export interface BindingUnbound {
    kind: 'unbound';
}

/** The slot's constraint property is NOT present on the resolved SVs (un-decomposed series). */
export interface BindingAbsent {
    kind: 'absent';
}

export type Binding = BindingValue | BindingSet | BindingUnbound | BindingAbsent;
export type BindingKind = Binding['kind'];

export interface Slot {
    key: SlotKey;
    /** exactly one of the four binding states */
    binding: Binding;
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface Shape {
    shape_id: string;
    /** plain-language family name, e.g. "development finance flows" */
    label: string;
    // The five structural anchors. All nullable: a custom-DC import may omit any
    // five-tuple arc, so the StatVar doesn't assert it.
    population_type: GraphRef | null;
    measured_property: GraphRef | null;
    stat_type: GraphRef | null;
    /** structural anchor; present only when the measured property is qualified */
    measurement_qualifier?: GraphRef | null;
    /** structural anchor; present only on a ratio or per-capita measure */
    measurement_denominator?: GraphRef | null;
    /** the constraint + facet slots this family exposes, in display order */
    slot_keys: SlotKey[];
    /** how many StatVars this shape's current bindings admit, narrowing as a
     *  slot binds and widening again as one is cleared */
    member_count: number;
    /** Hash of the family's members, null when Search did not settle the
     *  family. The members read is keyed by it, since membership can change
     *  under the same spec_id. */
    member_digest?: string | null;
    /**
     * Whether this shape's slots can be edited/refined via construct-and-confirm:
     * the engine builds sibling StatVar candidates for the edited slot and confirms
     * them against the graph before answering (never a guess). True for both named
     * families (e.g. dev_finance_crs_dac, via construct_sv_dcid) and standard/
     * catch-all shapes (via construct_standard_sibling_candidates) alike — the flag
     * applies the same way to both. False only for a ratio-backed _AsAFractionOf_
     * standard shape, where no sibling StatVar can be constructed for an edited
     * slot. Gate editability on this rather than treating every slot as freely
     * editable. Defaults to false.
     */
    refine_supported?: boolean;
    /** every Data Commons holding admitted data for a member StatVar, in the
     *  order dfo, base, un_system, and empty when the engine derived the shape
     *  without its members */
    data_commons?: DataCommonsRef[];
    /** the one source and Data Commons every member's data comes through, for
     *  a shape outside the Observatory's own imports whose members sit under
     *  exactly one source */
    upstream?: ShapeUpstream | null;
}

export interface ShapeUpstream {
    source: SourceRef;
    data_commons: DataCommonsRef;
}

// ---------------------------------------------------------------------------
// StatVar / Entity
// ---------------------------------------------------------------------------

/** Earliest and latest confirmed dates across a Spec's served members. */
export interface DateRange {
    /** earliest confirmed date, e.g. "2012" */
    start?: string | null;
    /** latest confirmed date, e.g. "2022" */
    end?: string | null;
}

/**
 * The size of the StatVar population behind a Spec (dfo-apis src/search/
 * models/statvar.py). `member_count` counts the measure family's members
 * with data, and `member_count_exact` is false when that count is a floor.
 * `served_count` counts the members this Spec serves, stated only once
 * membership settled; null means the walk could not finish within its
 * budget, so the served set is unverified. `data_date_range` spans the
 * served members' data. The members themselves come from
 * the Datasets members door (`fetchDefinitionMembers`).
 */
export interface ResolvedStatVars {
    member_count: number;
    member_count_exact: boolean;
    served_count?: number | null;
    /** the first and last dates across the served members' data; null when
     *  membership is unsettled or no member reported a range */
    data_date_range?: DateRange | null;
}

/** dfo-apis src/search/models/vocab.py:83 EntityRoleKey, the flat role
 *  string a resolved entity plays. Wider than RoleAxis by the subject
 *  role ("observationAbout") every non-directional entity carries. */
export type EntityRoleKey = 'observationAbout' | 'origin' | 'destination';

/**
 * One resolved entity under Spec.entities, mirroring the engine's own
 * ResolvedEntity (dfo-apis src/search/models/entity.py). `ref` is the bare
 * dcid string, not a GraphRef, and `role` is the flat EntityRoleKey string.
 */
export interface ResolvedEntity {
    /** the resolved entity's dcid — a bare string, not a GraphRef */
    ref: string;
    label?: string | null;
    /** e.g. Country, AdministrativeArea1, ContinentalUnion, Organization */
    entity_type?: string | null;
    role: EntityRoleKey;
    confidence?: Confidence | null;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export interface BreadthDim {
    /** the dimension, e.g. "providers", "years", "methods", "sources" */
    label: string;
    count: number;
}

export type Coverage =
    | {
          kind: 'exact';
          has_data: boolean;
          observation_count: number;
          dimensions?: BreadthDim[];
          window?: TimeWindow;
      }
    | { kind: 'breadth'; has_data: boolean; dimensions: BreadthDim[]; window?: TimeWindow }
    | { kind: 'bare'; has_data: boolean; window?: TimeWindow };

export type CoverageKind = Coverage['kind'];

// ---------------------------------------------------------------------------
// Resolution trace
// ---------------------------------------------------------------------------

/** Why a slot has its value: the bind call's own election, a code named in
 *  the query's text, the measure-family election, or a code system's
 *  declared default. */
export type BindingProvenance =
    'binder' | 'text_recognized' | 'measure_elected' | 'declared_default';

export interface ResolvedFilter {
    key: SlotKey;
    binding_kind: BindingKind;
    /** the bound graph objects (empty for unbound) */
    refs: GraphRef[];
    /** why the slot has this value; absent on an older engine */
    provenance?: BindingProvenance;
}

/** One narrowing term the request named, and whether a final slot binding
 * consumed it. `unbound_qualifiers` exposes the entries that were not bound
 * when a qualifier_not_bound outcome prevents a broader answer. */
export interface ResolvedQualifier {
    text: string;
    named: GraphRef[];
    slot?: string | null;
    disposition: 'bound' | 'unbound' | 'no_vocabulary';
}

export interface ResolutionTrace {
    resolved_entities: GraphRef[];
    resolved_sources: ProvenanceRef[];
    slot_filters: ResolvedFilter[];
    query_qualifiers?: ResolvedQualifier[];
    /**
     * The date window originally requested (query intent); absent when no date
     * was requested.
     * The literal string "latest" means the query explicitly asked for the
     * most-recent/current value — distinct from absent (no date signal at all).
     * spec_id is anchored on the identity's own requested_window (an
     * IdentityWindow, a distinct wire shape from this field) — see
     * BaseIdentity.requested_window, which a dataset_resubmit identity entry
     * round-trips to keep identity stable across promote.
     */
    requested_window?: RequestedWindow;
}

// ---------------------------------------------------------------------------
// Slot / entity options (the taxonomy a slot was bound against)
// ---------------------------------------------------------------------------

/** One candidate value the binder had available for a slot. */
export interface SlotOption {
    /** one taxonomy member or observed facet value */
    value: SlotValue;
    /**
     * This option's observation footprint if bound instead of the current value —
     * the "consequence before commit" count. Populated only when the request set
     * include_option_coverage; null otherwise.
     */
    coverage?: Coverage | null;
    /**
     * Where this option sits relative to its slot's bound value, for a
     * level-scoped constraint-slot option on a code-index-carried taxonomy.
     * Absent on every other surface this type serves: entity_options,
     * facet_options, and the options door's OptionsSet.
     */
    relation?: SlotOptionRelation | null;
    /**
     * How many StatVars this index holds coded directly to this option's
     * value (not a subtree rollup), for a level-scoped constraint-slot
     * option. Absent on every other surface this type serves: entity_options,
     * facet_options, and the options door's OptionsSet.
     */
    member_count?: number | null;
    /**
     * The flat dcid of this option's parent in its classification, on a
     * level-scoped option that has one. With no value bound on a
     * hierarchical slot, the options hold each root and its children, and a
     * child names its root here.
     */
    parent?: string | null;
    /**
     * The rows a download of this answer would write with this option bound
     * instead of the current value, in the terms of `DownloadFacts.rows`; a
     * bound slot is counted with that slot left unbound. A counted menu omits
     * every option that would serve nothing, except the slot's current value.
     * Null where the option is not counted yet: a subject-place family's
     * bound slot gets its count in a trailing slot_options event.
     */
    served_rows?: number | null;
    /** false when served_rows is an upper bound; null exactly when
     *  served_rows is null */
    served_rows_exact?: boolean | null;
    /**
     * On an origin or destination entity option, what the party is beside the
     * others on its side, as the code index lists it. Absent for a party the
     * index does not list, and on every other option.
     */
    party_kind?: PartyKind | null;
}

/**
 * The full candidate set one slot was bound against. `key` joins to the matching
 * `Spec.slots` entry on axis + property.ref (see SlotKey ref form "axis:dcid").
 */
export interface SlotOptions {
    key: SlotKey;
    options: SlotOption[];
    /**
     * False when options is the full known set for this slot at its
     * current level: a curated seed taxonomy, a level-scoped taxonomy
     * sourced from the packaged code index, or an observed taxonomy from
     * the same source. True when options is only the values observed
     * among the resolved candidates, bounded by retrieval/confirm caps.
     */
    truncated: boolean;
    source: SlotOptionsSource;
}

/**
 * The candidate set for a directional entity axis. An open axis has no bound
 * entity_ref but still carries its candidates.
 */
export interface EntityOptions {
    /** dcid of the bound directional entity; absent/null while the axis is open */
    entity_ref?: string | null;
    role: RoleAxis;
    options: SlotOption[];
    /** false when options is the full known candidate set (a curated seed) */
    truncated: boolean;
    source: SlotOptionsSource;
}

/**
 * The candidate set one facet axis (provenance / measurementMethod / unit)
 * was bound against, coverage-derived rather than a shape slot. The buffered
 * body carries these inline on `Spec.facet_options`. The SSE path defers
 * them to trailing `facet_options` events instead (the response's own array
 * arrives empty), joined back onto the spec client-side by `spec_id` +
 * `axis`. On `measurementMethod` and `unit`, an option whose `value` has no
 * `ref` stands for the facets that declare no value on the axis; it appears
 * only beside at least one declared value.
 */
export interface FacetOptions {
    axis: string;
    options: SlotOption[];
    truncated: boolean;
    source?: SlotOptionsSource;
}

// ---------------------------------------------------------------------------
// SpecObservations: the observation values behind a Spec's coverage
// ---------------------------------------------------------------------------

/** One (date, value) pair from a resolved StatVar's observation series. */
export interface ObservationPoint {
    /** the observation date, e.g. "2018" */
    date: string;
    /** null when the graph reports a date with no value */
    value: number | null;
}

/** One axis's value on a single series' selected observation facet.
 *  `source`, `data_commons` and `documentation` ride the provenance axis
 *  only; the first two are absent for a provenance the origin catalogue does
 *  not list. */
export interface SeriesFacetRef {
    ref: string;
    /** best-effort display label, null when unresolved */
    label?: string | null;
    source?: SourceRef | null;
    data_commons?: DataCommonsRef | null;
    /** the Graph API route of the provenance's document */
    documentation?: string | null;
}

/** A series' StatVar: its dcid and the row's own distinguishing label. */
export interface SeriesStatVarRef {
    ref: string;
    label?: string | null;
}

/** One entity in a series' role tuple. */
export interface SeriesEntityRef {
    role: EntityRoleKey;
    ref: string;
    /** best-effort display label, null when unresolved */
    label?: string | null;
    /** on an origin or destination entity, what the party is beside the
     *  others on its side, as the code index lists it. Absent for a party
     *  the index does not list, on observationAbout, and from an API that
     *  predates it. */
    party_kind?: PartyKind | null;
}

/** One constraint of a series' StatVar: the property and the value the
 *  StatVar holds on it. The wire carries no property label, so a client names
 *  the property from the Spec's slots. */
export interface SeriesAxisRef {
    /** the constraint property's dcid, e.g. "crsPurpose" */
    property: string;
    /** the dcid of the value the StatVar holds on `property` */
    ref: string;
    /** display label for `ref`: its graph label, else the dcid's tail split
     *  into lower-case words */
    label: string;
}

/** One entity a converted series substituted with its recipe's fallback entity. */
export interface SeriesConversionFallbackExample {
    entity: string;
    fallback_entity: string;
}

/** The recipe and table versions behind a converted series' points. */
export interface ObservationSeriesConversion {
    recipe_id: string;
    /** the Provenance node the exchange-rate and deflator tables loaded under */
    table_provenance: SeriesFacetRef;
    exchange_rate_table_version: string;
    /** absent for a current-prices conversion */
    deflator_table_version?: string | null;
    fallback_count: number;
    fallback_examples?: SeriesConversionFallbackExample[];
    projected_count: number;
    /** capped, sorted 'entity@year' keys */
    projected_examples?: string[];
}

/**
 * One (stat_var, role tuple) pair's observation points, in chronological
 * order (dfo-apis src/search/models/observations.py ObservationSeries).
 */
export interface ObservationSeries {
    stat_var: SeriesStatVarRef;
    /** the role tuple: one observationAbout entry for a single-role series,
     *  origin and destination for a bilateral dev-finance series */
    entities: SeriesEntityRef[];
    /** one entry per constraint of the StatVar, ordered by property dcid;
     *  empty for a StatVar with no constraints. Absent from an API that
     *  predates it, and from shares saved before it. */
    axes?: SeriesAxisRef[];
    /** the full series when SpecObservations.truncated is false, else the latest points only */
    points: ObservationPoint[];
    /** the selected facet's in-window point count, before truncation */
    total_obs: number;
    /** provenance of the one observation facet these points were read from */
    source_refs: ProvenanceRef[];
    /** the selected facet per axis (provenance / measurementMethod / unit),
     *  sparse, and `provenance` agrees with `source_refs` */
    facet: Record<string, SeriesFacetRef>;
    /** absent on a series served in its native facet */
    conversion?: ObservationSeriesConversion | null;
}

/**
 * Why a definite Spec's observations were explicitly withheld, distinct from
 * an ordinary empty result (dfo-apis src/search/models/observations.py's
 * ObservationsOmission, paired with SpecObservations.omitted below). `reason`
 * doubles as the code on the paired Warning the engine also emits (dfo-apis
 * src/search/engine/region/codes.py), so `reason` and the warning code share
 * one vocabulary. Some deployments don't send this field yet. A definite
 * spec with no `omitted` and no `observations` event at all may simply
 * predate it, not an assertion that the slice is empty. See view.ts's
 * resolveObservationsOmission for the fallback this implies.
 */
export type ObservationsOmissionReason =
    | 'observations_timed_out'
    | 'observations_no_matching_source'
    | 'observations_windowed_scope_unsupported'
    | 'observations_converted_scope_unsupported'
    | 'observations_no_dispatchable_facet'
    | 'observations_bulk_fetch_failed'
    | 'observations_probe_failed'
    | 'observations_preview_too_large'
    | 'observations_nothing_to_probe'
    | 'observations_clients_unavailable'
    | 'observations_no_points';

/** Set exactly when the preview was withheld: `series`, `total_obs`, and
 *  `truncated` on the enclosing SpecObservations then read `[]`, `0`, `false`
 *  respectively. `pairs`/`cap` are populated on `observations_preview_too_large`
 *  (the (stat_var, entity) pair count and the ceiling it exceeded). The rest
 *  are diagnostic bookkeeping for the fetch itself, meant for logs rather
 *  than display. */
export interface ObservationsOmission {
    reason: ObservationsOmissionReason;
    message: string;
    pairs?: number | null;
    cap?: number | null;
    dispatched?: number | null;
    empty?: number | null;
    hard_failed?: number | null;
    facet_rejected?: number | null;
}

/**
 * The observation values behind a Spec's coverage: an always-on bounded preview,
 * or the full series when the resolved answer is small enough to ship in full.
 * Describes the SAME (stat_var, entity) selection Spec.coverage already reports.
 */
export interface SpecObservations {
    /** one entry per (stat_var, entity) pair with observations */
    series: ObservationSeries[];
    /** total observation count across every series; known even when truncated */
    total_obs: number;
    /** false when every series carries its full point set; true when each was truncated to its latest points */
    truncated: boolean;
    /** why the preview was withheld, when it was; absent/null on an ordinary
     *  fetched result (whether or not it found points) and on an engine that
     *  doesn't send this field yet. */
    omitted?: ObservationsOmission | null;
    /** how the preview's series were picked when it was cut to its cap:
     *  "ranked" (most recent and largest first) or "fixed"; absent/null when
     *  it was not cut, and on an engine that doesn't send this field yet */
    order?: 'ranked' | 'fixed' | null;
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

/** Why a facet axis holds its value: bound by the request, completed from a
 *  declared default, or the engine's own most-in-window-points pick. */
export type FacetBasis = 'bound' | 'declared_default' | 'fallback';

/**
 * One facet axis's resolved value on a Spec (dfo-apis src/search/models/
 * spec.py ResolvedFacet). Exactly one of `ref` and `selection` is present:
 * `ref` (with `label`, and on the provenance axis `source`, `data_commons`
 * and `documentation`) when one value served every carried series,
 * `selection` when the series differ.
 */
export interface ResolvedFacet {
    basis: FacetBasis;
    ref?: string | null;
    label?: string | null;
    source?: SourceRef | null;
    data_commons?: DataCommonsRef | null;
    /** provenance axis only: the Graph API route of the provenance's document */
    documentation?: string | null;
    selection?: 'per_series' | null;
    /** unit axis only, alongside `ref`: the ISO 4217 code ("USD", "KES") of
     *  the currency `ref` is denominated in; absent when `ref` is no
     *  currency */
    currency?: string | null;
    /** unit axis only, when bound through the request form */
    request_basis?: Record<string, FacetBasis> | null;
}

/**
 * A Spec's hashed definition, minted by editing the elected Spec's identity
 * onto an alternative measure's axes. No stat_vars, no coverage, no trace.
 * Post its identity as a dataset_resubmit identity entry; the API resolves
 * the membership from the identity.
 */
export interface SpecDefinition {
    schema_version: SchemaVersion;
    spec_id: string;
    identity: SpecIdentity;
}

/**
 * Another populated partition from the same measure family, or a distinct
 * also_plausible candidate differing only in measured_property, folded in
 * here instead of a second candidates entry. Mirrors dfo-apis
 * SpecAlternativeMeasure.
 */
export interface SpecAlternativeMeasure {
    definition: SpecDefinition;
    /** readable text for this option, distinct from every other entry's on
     *  the same axis: a 'what' entry names the measure without its price
     *  basis ("net disbursements"), a 'unit' entry the prices it switches to
     *  ("constant prices") */
    label: string;
    /** the token whose menu offers this entry: 'what', the measure noun, or
     *  'unit', the byline's unit token (binding_ref "unit:"), for a
     *  partition that differs from the Spec's only in price basis */
    axis: 'what' | 'unit';
    /** the values this measure's partition holds, as Spec.measure_axis_values */
    measure_axis_values?: MeasureAxisValue[];
    /** the rows a download would write after a switch to this measure, in
     *  the terms of `DownloadFacts.rows`; null where counting needs graph
     *  reads */
    served_rows?: number | null;
    /** false when served_rows is an upper bound; null exactly when
     *  served_rows is null */
    served_rows_exact?: boolean | null;
}

/** One measure axis and the value a measure partition holds on it, e.g.
 *  nettingBasis = Gross. Mirrors dfo-apis MeasureAxisValue. */
export interface MeasureAxisValue {
    axis: string;
    value: GraphRef;
}

/**
 * Another StatVar from the smallest StatVarGroup the Spec's one StatVar
 * belongs to, with data at the Spec's places. Post `definition.identity` as
 * a dataset_resubmit identity entry. Mirrors dfo-apis RelatedMeasure.
 */
export interface RelatedMeasure {
    /** the sibling StatVar: its label names the row, its dcid the info icon */
    stat_var: GraphRef;
    definition: SpecDefinition;
}

/**
 * What a Datasets mint of the Spec's definition writes in its default file
 * (no grouping), known before the first download. Mirrors dfo-apis
 * DownloadFacts.
 */
export interface DownloadFacts {
    /** the rows the definition's series serve, one per series and date, totals
     *  included. A long-layout CSV or XLSX keeps the rows where a role in the
     *  options document's `long_layout_totals` holds a total out of its main
     *  table, so that table can hold fewer. Null when the count could
     *  understate, as when a served member is missing from the coverage
     *  artifact. */
    rows?: number | null;
    /** false when rows is an upper bound, or null */
    rows_exact: boolean;
    /** distinct (StatVar, entities) with a point. Null when rows is null. */
    series?: number | null;
    /** the first and last years of the file's points. Null when rows is null. */
    window?: TimeWindow | null;
    /** the licence of the one provenance the answer serves. Null when it
     *  serves several or the catalogue names none. */
    licence?: { label: string } | null;
}

/**
 * Whether the elected Spec's served members agree on a single declared value
 * for this axis or differ. Mirrors dfo-apis OpenConstraintAxisFact.
 */
export interface OpenConstraintAxisFact {
    /** the constraint property dcid this fact is about */
    property: string;
    varies: boolean;
    /** the single value every declaring member agrees on; present only when
     *  varies is false and at least one member declares a value */
    value?: GraphRef | null;
    /** how many distinct declared values the served members exhibit, not
     *  counting a member that declares nothing */
    distinct_count: number;
    /** how many served members declare no value at all for this axis */
    undeclared_count: number;
    /** every declared value with the served members declaring it, highest
     *  count first. The counts plus undeclared_count sum to the members. */
    values?: { value: GraphRef; count: number }[];
}

export interface Spec {
    /**
     * Deterministic hash of (shape_id + canonical slot bindings). Permalink-safe;
     * dedup key; golden-comparison handle; cache key. Same spec_id implies same
     * Spec.entities GraphRef set. Does NOT depend on slot_options/entity_options.
     */
    spec_id: string;
    shape: Shape;
    /** one entry per slot the shape defines, each in a binding state */
    slots: Slot[];
    /**
     * The candidate set each bound slot was chosen from, one entry per slot with a
     * non-empty taxonomy (omits when/source and empty slots). Rides on the response.
     */
    slot_options?: SlotOptions[];
    /** the candidate set each bound directional entity was chosen from (dev-finance provider) */
    entity_options?: EntityOptions[];
    /** the candidate set each facet axis (provenance/measurementMethod/unit) was
     *  chosen from; empty on the SSE path until the trailing events merge in
     *  (see FacetOptions) */
    facet_options?: FacetOptions[];
    /** how many StatVars the Spec's family holds and serves */
    stat_vars: ResolvedStatVars;
    /** resolved entities the data is about; may be empty if "where" is unbound */
    entities: ResolvedEntity[];
    /** the named group each role's entities stand for, keyed by role key.
     *  Null when no role was asked for as a group. Read it afresh after
     *  every response and post it unchanged beside any identity derived
     *  from this Spec (`DatasetIdentityEntry.entity_groups`); the client
     *  never edits a group. */
    entity_groups?: Record<string, EntityGroup> | null;
    coverage: Coverage;
    /** the facet axis values that backed this Spec's observations, sparse,
     *  and {} when observations were not resolved for this Spec */
    facets?: Record<string, ResolvedFacet>;
    resolution: ResolutionTrace;
    /**
     * Whether this spec's representative stat var has observations at the resolved
     * place. true=confirmed; false=matched but no data here (flagged_match); null=not
     * assessed (no place, or a named family).
     */
    available_at_place?: boolean | null;
    /** qualitative, relative retrieval confidence; null when not assessed */
    confidence?: Confidence | null;
    /**
     * The observation values behind coverage above; absent when not resolved for this
     * Spec (no entity to probe, options.include_observations is false, deferred to a
     * trailing SSE `observations` event, or a candidates/nearest_real/flagged_match spec).
     * Populated only on a primary definite answer.
     */
    observations?: SpecObservations | null;
    /**
     * The identity a dataset_resubmit entry edits and posts back. Null only for a test fixture built without a definition/resolved
     * split.
     */
    identity?: SpecIdentity | null;
    /** v1: the resolved Spec's own sentence (the envelope mirrors the primary one) */
    rendered_sentence?: string | null;
    sentence_plan?: SentenceToken[] | null;
    /** Null when this Spec's shape carries no measure family and no
     *  measure-sibling candidate was folded in; a served partition with
     *  every sibling unlabelled still publishes []. */
    alternative_measures?: SpecAlternativeMeasure[] | null;
    /** Null under the same condition as alternative_measures. */
    measure_label?: string | null;
    /** the measure-axis identifiers measure_label was composed from, so a
     *  bound how-slot sharing one doesn't repeat what measure_label already
     *  said; [] when measure_label is null */
    measure_label_axes?: string[];
    /** Null when the served members declare no such axis at all. */
    open_axis_facts?: OpenConstraintAxisFact[] | null;
    /** each axis in measure_label_axes with the value the served partition
     *  holds on it, defaults included. [] when measure_label is null. */
    measure_axis_values?: MeasureAxisValue[];
    /** the StatVarGroup related_measures come from. Null when the list is
     *  null or empty. */
    related_group?: GraphRef | null;
    /** up to 5 other members of related_group with data at the Spec's
     *  places. Null when not computed, [] when there are none. */
    related_measures?: RelatedMeasure[] | null;
    /** what a download of this Spec's definition holds. Null when the Spec
     *  has no read plan or merges several answers. */
    download?: DownloadFacts | null;
    /** the currencies and price bases this answer converts to. Null when
     *  its series cannot be converted. */
    unit_conversion?: UnitConversion | null;
}

/** One currency a unit request can convert the answer to. Mirrors dfo-apis
 *  ConversionCurrency. */
export interface ConversionCurrency {
    /** the ISO 4217 code a request names the currency by */
    code: string;
    /** the plural noun the sentence names it by ("euros") */
    noun: string;
    /** the years a current-price request shows; null when none converts */
    current_years: TimeWindow | null;
    /** the years a constant-price request shows; null when none converts */
    constant_years: TimeWindow | null;
    /** the run of base years constant prices take; null when none */
    base_year_min: number | null;
    base_year_max: number | null;
}

/**
 * What a convertible answer can switch its unit to, through a resubmit
 * whose `identity.facets.unit` carries an IdentityUnitRequest. Mirrors
 * dfo-apis UnitConversion.
 */
export interface UnitConversion {
    /** each currency a unit request converts the answer to, by code */
    currencies: ConversionCurrency[];
    /** the base year a constant-price request takes when none is named */
    default_base_year: number;
    /** the currency of the one entity each role names, keyed by role */
    role_currencies: Partial<Record<EntityRoleKey, string>>;
}

/**
 * One what/how identity slot's binding state: the identity core's own wire
 * shape, distinct from the engine's resolved `Binding` union
 * (`Spec.slots[i].binding`, `{kind, value}`) that `lib/search/searchClient.ts`'s
 * Slot/Binding mirror types describe. `state` (not `kind`) is the
 * discriminator; `ref`/`refs` carry bare dcid strings, never a full
 * `{ref,label}` GraphRef.
 *
 * What each state denotes: `value` denotes the bound code and every code
 * under it via the code system's declared hierarchy — the code alone where
 * the system is flat or the code is a leaf. `exact` denotes the code alone,
 * even where the system's hierarchy would otherwise widen it; no engine
 * mints this state yet (the datasets door exports it, and dfo-apis's search
 * doors refuse a posted one with `exact_binding_unsupported`), so nothing in
 * this codebase produces it, but a document carrying one type-checks. `set`
 * denotes the union of its members' `value` denotations. `unbound` denotes
 * any value or absence.
 */
export type IdentityBinding =
    | { state: 'value'; ref: string }
    | { state: 'exact'; ref: string }
    | { state: 'set'; refs: string[] }
    | { state: 'unbound' };

/** One what/how slot's identity contribution: bare property dcid + binding
 *  state. Never where/when/source — see BaseIdentity's field docs. */
export interface IdentitySlot {
    property: string;
    binding: IdentityBinding;
}

/** The role form of a unit request's `currency`: the currency of the entity bound
 *  to that role, resolved per row. Mirrors dfo-apis IdentityCurrencyRole. */
export type IdentityCurrencyRole = { role: EntityRoleKey };

/** A completed unit-conversion request — legal only inside a `unit`-axis
 *  facet binding's `request` form. */
export interface IdentityUnitRequest {
    /** an ISO 4217 code, or the currency of the one entity a role names */
    currency: string | { role: EntityRoleKey };
    prices: 'current' | 'constant';
    /** required exactly when prices === 'constant' */
    base_year?: number;
}

/** A facet axis bound to declared values: the slot union minus `unbound`
 *  (a facet map is sparse — an unconstrained axis is simply absent, not
 *  `unbound`). */
export type IdentityFacetRefBinding =
    { state: 'value'; ref: string } | { state: 'set'; refs: string[] };

/** A declared-value binding, or `ref: null`: the facets that declare no
 *  value on the axis. The engine echoes the null back. */
export type IdentityNullableFacetBinding = IdentityFacetRefBinding | { state: 'value'; ref: null };

/** A unit bound to the national currency of each entity a role names: the
 *  facets whose unit is that entity's own currency, served as published. */
export interface IdentityNationalCurrencyBinding {
    state: 'value';
    national_currency: { role: EntityRoleKey };
}

/** The sparse facet map over the identity core's three axes. Every facet
 *  carries a provenance, so `provenance` takes declared refs only;
 *  `measurementMethod` and `unit` also take a null ref, and `unit` alone
 *  takes the request and national-currency forms. */
export interface IdentityFacets {
    provenance?: IdentityFacetRefBinding;
    measurementMethod?: IdentityNullableFacetBinding;
    unit?:
        | IdentityNullableFacetBinding
        | { state: 'value'; request: IdentityUnitRequest }
        | IdentityNationalCurrencyBinding;
}

export type IdentityFacetAxis = keyof IdentityFacets;

/** The identity core's own `requested_window` union — distinct from the
 *  engine's resolved `RequestedWindow` (`TimeWindow | 'latest' | undefined`):
 *  `undefined` there maps to `{kind:'all'}` here, since a BaseIdentity always
 *  carries this member, never omits it. */
export type IdentityWindow =
    | { kind: 'all' }
    | { kind: 'latest' }
    | { kind: 'range'; start_year?: number; end_year?: number };

/**
 * Contract v1 identity core (`BaseIdentity` on the wire): exactly what gets
 * hashed into spec_id, serialised once and echoed back verbatim — never
 * re-derived client-side. `shape` is opaque here (never constructed by this
 * page, only copied or compared); `slots` covers only what/how axes — where
 * lives in `entities` (keyed `observationAbout`/`origin`/`destination`),
 * when in `requested_window`, source in `facets.provenance`.
 */
export interface BaseIdentity {
    identity_version: 'spec1';
    shape: unknown;
    slots: IdentitySlot[];
    entities: Record<string, string[]>;
    requested_window: IdentityWindow;
    facets?: IdentityFacets;
}

/** A named group whose members fill one entity role ("European Union").
 *  The members are the role's dcids in `BaseIdentity.entities`. With a
 *  `ref`, the API takes the label from the graph. Mirrors dfo-apis
 *  EntityGroup. */
export interface EntityGroup {
    /** the group's graph node; null when the graph holds none */
    ref: string | null;
    label: string;
    /** the graph type of the group's node (`Continent`, `UNGeoRegion`);
     *  null or absent when the group has no node */
    entity_type?: string | null;
    /** the party the dataset publishes as the group's total, which the role
     *  binds in place of the members (`DACAfrica` for Africa); null or
     *  absent when the role binds the members */
    total?: string | null;
}

/** Alias for `Spec.identity`'s type; `BaseIdentity` is the canonical declaration. */
export type SpecIdentity = BaseIdentity;

/**
 * Contract v1 wire Spec: `definition` (hashed identity) + `resolved` (everything
 * the page shows). searchClient.flattenSpec spreads `resolved` into the flat
 * Spec above (with `resolution` = resolved.trace, `identity` = definition.identity).
 */
export interface WireSpec {
    spec_id: string;
    definition: { schema_version: SchemaVersion; spec_id: string; identity: SpecIdentity };
    resolved: Omit<Spec, 'spec_id' | 'identity' | 'resolution'> & { trace: ResolutionTrace };
}

// ---------------------------------------------------------------------------
// Sentence plan (the engine's rendered, tokenised confirmation sentence)
// ---------------------------------------------------------------------------

/** The block of the answer a sentence token belongs to: the heading states
 *  what the answer is, the byline its unit and source, and a departure
 *  token carries the text of one `Departure` on the same part. */
export type SentenceSegment = 'heading' | 'byline' | 'departure';

/** The axis a sentence token fills: every slot axis plus the byline's
 *  facet axes no request slot carries: 'unit', the unit of measure, and
 *  'method', the measurement method (`binding_ref` "method:"), stated only
 *  while the identity binds it. */
export type SentenceAxis = SlotAxis | 'unit' | 'method';

/**
 * One token in the ordered sentence plan: connective text, or a bound phrase.
 * `rendered_sentence` is the flat join of every token's `text`. A "slot" token
 * with nothing bound still appears, with text="". Mirrors dfo-apis
 * src/search/models/grammar.py SentenceToken.
 */
export interface SentenceToken {
    /** 'text' is invariant wording (a connective, a separator, the terminal
     *  ".", or a departure sentence); 'slot' is a bound phrase */
    kind: 'text' | 'slot';
    /** rendered text for this token; empty string for a slot with nothing
     *  bound, or a how slot bound but silenced because the measure noun
     *  states it */
    text: string;
    /** the block this token belongs to. A Spec's own plan holds heading and
     *  byline tokens only; departure tokens sit on a part's or the
     *  envelope's plan. */
    segment: SentenceSegment;
    /** the grammatical axis this token fills, when kind==="slot" */
    axis?: SentenceAxis | null;
    /** the constraint property dcid this token renders, when one exists */
    property_dcid?: string | null;
    /** "origin"/"destination" when this token renders a directional entity role */
    role?: RoleAxis | null;
    /** the binding this token edits: "origin:", "where:", "when:", "unit:",
     *  "method:", or "how:<property dcid>" (SlotKey ref form) */
    binding_ref?: string | null;
    /**
     * entity dcids this token renders, one per entity in the token's group (e.g. a
     * multi-recipient "to" token carries every recipient's dcid, in the same order
     * as the entities joined into `text`); absent/[] when this isn't a directional
     * role token
     */
    entity_refs?: string[];
    /**
     * The refs this heading or byline slot token states, so the reader edits
     * each from this token: its own binding_ref, then each binding the
     * renderer left silent because this token's text already says it
     * ("how:crsTypeOfFlow" on "gross ODA disbursements"), plus
     * "axis:<property dcid>" for a measure axis no slot carries. Empty on a
     * token with empty text. A binding no token states is offered by Refine.
     * Absent on a wire that predates it.
     */
    states?: string[];
    /** true on a candidate's token whose text differs from the same-bucket
     *  text on another candidate in the same set */
    distinguishes?: boolean | null;
    /**
     * Which part of a multi-variable envelope this token belongs to, when the
     * plan is the envelope's own composed `sentence_plan` (ResolveResponse,
     * not a single Spec's). Absent (never `null` on the wire) on a shared
     * skeleton token: a connective, a hoisted qualifier, or the terminal ".".
     * Compare with `== null`, not `=== null`. Always absent on a Spec's own
     * sentence_plan, which describes one part only.
     */
    part_index?: number | null;
}

// ---------------------------------------------------------------------------
// Departures (how a part's answer differs from what its request asked)
// ---------------------------------------------------------------------------

/** Every way an answer can differ from what its request asked, in the API's
 *  precedence order (dfo-apis src/search/models/vocab.py DepartureCode). */
export type DepartureCode =
    | 'closest_match'
    | 'measure_not_applied'
    | 'operation_not_applied'
    | 'breakdown_not_applied'
    | 'entity_unavailable'
    | 'year_unavailable'
    | 'modelled_values'
    | 'group_read_as_members'
    | 'direction_discarded'
    | 'scope_limited';

/** One way a part's answer differs from what its request asked. Mirrors
 *  dfo-apis src/search/models/departure.py Departure. */
export interface Departure {
    code: DepartureCode;
    /** the binding whose edit clears this departure ("when:", "where:",
     *  "origin:", "unit:", "source:", "how:<property dcid>"); null when no
     *  binding edit clears it */
    binding_ref?: string | null;
    /** what the request named, in its own wording */
    asked?: string | null;
    /** what the answer shows instead, as the heading states it */
    shown?: string | null;
    /** the departure as one or two short sentences for people */
    text: string;
}

/** Departures the stream's `done` event adds to one part: facts that depend
 *  on the observations read, which arrive after `response`. A folded part and
 *  the part it folded into share a spec_id, so `part_index` names the part;
 *  `spec_id` confirms it still holds that part's spec. */
export interface LateDepartures {
    part_index: number;
    spec_id: string;
    departures: Departure[];
}

// ---------------------------------------------------------------------------
// Envelope sub-objects
// ---------------------------------------------------------------------------

/** A set of 2..N competing Specs, ordered broadest-first. Each spec carries
 *  its own rendered_sentence/sentence_plan, lifted flat by flattenSpec. */
export interface CandidateSet {
    /** constant "broadest_first" in v1 */
    ordering: Ordering;
    /** the maximum number of candidates applied */
    max_candidates: number;
    /** 2..N competing Specs, broadest to narrowest */
    specs: Spec[];
    truncated?: boolean;
}

/** One graph node an ambiguous wording could name (dfo-apis
 *  src/search/models/outcomes.py AmbiguousEntityCandidate). */
export interface AmbiguousEntityCandidate {
    ref: string;
    label: string;
    /** country, continent, subregion, continental_union, organisation,
     *  aggregate, place_other, or other */
    kind: string;
}

/** One query wording that resolved to more than one graph node, with the
 *  nodes it could name. `text` equals some `restatement.entities[i].text`
 *  on the same part. */
export interface AmbiguousEntityGroup {
    text: string;
    candidates: AmbiguousEntityCandidate[];
}

/** Outcome when no grounded result can be returned. */
export interface NoData {
    /** why nothing could be returned (closed enum) */
    reason: NoDataReason;
    /**
     * The entity wordings this refusal is about, in query order — populated
     * for entity_not_resolved / entity_ambiguous / entity_role_not_admitted,
     * empty for every other reason. The engine's own contract says to read
     * this rather than parse `rendered_sentence` for the name.
     */
    entity_terms?: string[];
    /** Every ambiguous wording behind an entity_ambiguous outcome, in query
     *  order, each with the nodes it could name. Empty for every other
     *  reason. */
    ambiguous_entities?: AmbiguousEntityGroup[];
    /**
     * Set when the reason is entity_ambiguous: the parsed form of this part,
     * with every resolved entity's dcid pinned and the ambiguous entity's
     * dcid left empty. The site pins a pick onto the part's `restatement`
     * instead (parsedEdit.ts's buildAmbiguousPickPart), so it reads none of
     * this.
     */
    data_query?: ParsedInput | null;
    /** Terms the engine refused to silently drop before answering. Present
     * only for qualifier_not_bound. */
    unbound_qualifiers?: ResolvedQualifier[];
    /** optional; real, grounded specs with data adjacent to the request */
    nearest_real?: Spec[] | null;
    gate?: NoDataGate | null;
    /**
     * optional; the single best-matched variable that exists but has no observation
     * at the resolved place (available_at_place=false). Distinct from nearest_real:
     * same variable + same place with no data here, vs. constraint-relaxed specs
     * that DO have data nearby.
     */
    flagged_match?: Spec | null;
    /**
     * Distinct from flagged_match (the elected variable, present on the
     * other two gates) and from nearest_real (constraint-relaxed variants of
     * the SAME variable). At most one of flagged_match/alternate_match is
     * present at once.
     */
    alternate_match?: Spec | null;
    /**
     * The currencies a unit_not_resolved refusal offers, in the binder's order.
     * Present only with that reason and when the binder has candidates.
     */
    unit_alternatives?: UnitAlternative[];
}

/** A run-health signal. */
export interface Warning {
    /** stable machine code, e.g. DATE_COVERAGE_PARTIAL, COUNT_UNAVAILABLE */
    code: string;
    severity: WarningSeverity;
    message: string;
    /**
     * The spec_id this warning attaches to, when it concerns one returned
     * spec specifically, and omitted otherwise. A warning with no spec_id
     * has no part to attach it to (the per-spec signal it summarises
     * arrives separately, through that spec's own events) and is dropped.
     * Mirrors dfo-apis src/search/models/envelope.py's Warning.spec_id.
     */
    spec_id?: string | null;
    /**
     * The counts and labels the message states. Three codes send it:
     * observations_series_truncated {shown, total, order}, where order is
     * "ranked" (most recent and largest first) or "fixed" and is absent
     * from an API that predates it, elected_shape_no_data
     * {no_data, elected}, whose values are lists of labels, and
     * un_system_unavailable (UnSystemParams).
     */
    params?: (Record<string, number | string | string[]> & UnSystemParams) | null;
}

/** An `un_system_unavailable` warning's params (dfo-apis
 *  src/search/engine/region/un_system.py un_unavailable_warning): the place
 *  dcids the UN System Data Commons refused, the StatVar dcids of the reads
 *  that failed, and those StatVars' labels in the same order, an empty
 *  string where the graph holds none. Each list is empty when the warning
 *  holds none. */
export type UnSystemParams = {
    places?: string[];
    variables?: string[];
    variable_labels?: string[];
};

/** Latency breakdown for the response. */
export interface Timing {
    /** total run latency in ms */
    total: number;
    /** per-step latency in ms */
    by_step?: Record<string, number> | null;
}

/** Run health, warnings, timing, and build stamp. */
export interface Diagnostics {
    /** engine build id; distinct from schema_version */
    engine_build: string;
    /** this request's trace_id, shared with every problem-details body and
     *  the SSE stream's `done` event */
    trace_id: string;
    /** degraded-mode, applied-signal, partial-graph signals */
    warnings: Warning[];
    timing_ms?: Timing | null;
    /** per-request LLM token counts {input_tokens, output_tokens, cached_tokens} */
    llm_usage?: Record<string, number> | null;
    /** buffered transport only: soft deadline truncated this response (null on SSE, where the done event carries it) */
    timed_out?: boolean | null;
}

export interface QueryEcho {
    entry_path: 'raw_text' | 'parsed' | 'dataset_resubmit';
    /** the user's words, when one was supplied */
    raw_query?: string | null;
    /** post-extraction normalised text, when extraction ran */
    normalized_query?: string | null;
    /** true when the extraction step was skipped for this request */
    extract_skipped: boolean;
}

// ---------------------------------------------------------------------------
// Part (contract v1): one entry per variable in ResolveResponse.parts
// ---------------------------------------------------------------------------
// The engine carries the payload — spec / candidates / no_data / unsupported,
// plus rendered_sentence / sentence_plan — inside a `parts[]` list, one entry
// per variable the query asked about, in query order. A single-variable query
// is one part. The page renders every part, in order (useSearchRun.ts's
// `HydratedPart[]`). WirePart is the shape a part carries on the wire (nested
// WireSpecs, un-flattened).
// searchClient.normalizeResponse maps each WirePart to the page-side `Part`
// below, whose specs are flattened by searchClient.flattenSpec.

/** Wire-shaped candidate set carried on a candidates Part: `specs` are un-flattened
 *  WireSpecs (searchClient.flattenSpec turns these into CandidateSet.specs above). */
export interface WireCandidateSet {
    /** constant "broadest_first" in v1 */
    ordering: Ordering;
    /** the maximum number of candidates applied */
    max_candidates: number;
    /** 2..N competing WireSpecs, broadest to narrowest */
    specs: WireSpec[];
    truncated?: boolean;
}

/** Wire-shaped no_data outcome carried on a no_data Part. */
export interface WireNoData {
    reason: NoDataReason;
    entity_terms?: string[];
    ambiguous_entities?: AmbiguousEntityGroup[];
    data_query?: ParsedInput | null;
    unbound_qualifiers?: ResolvedQualifier[];
    /** optional; real, grounded WireSpecs with data adjacent to the request */
    nearest_real?: WireSpec[] | null;
    gate?: NoDataGate | null;
    /** optional; the single best-matched variable that exists but has no observation
     *  at the resolved place (available_at_place=false) */
    flagged_match?: WireSpec | null;
    alternate_match?: WireSpec | null;
    /**
     * The currencies a unit_not_resolved refusal offers, in the binder's order.
     * Present only with that reason and when the binder has candidates.
     */
    unit_alternatives?: UnitAlternative[];
}

/** Outcome when the query itself can't be answered by this contract (e.g. an
 *  unsupported operation). The page shows `detail` in place of an empty
 *  heading. */
export interface Unsupported {
    code: string;
    pointer?: string | null;
    detail?: string | null;
    definition?: unknown;
}

/** What a question asked of a part's data beyond showing it. */
export type OperationVerb =
    'rank' | 'aggregate' | 'growth' | 'share_of' | 'explain' | 'forecast' | 'report';

/** The axis an operation runs over. */
export type OperationAxis = 'place' | 'origin' | 'destination' | 'category' | 'year';

/**
 * One operation the question asked of a part that search did not apply,
 * such as `rank` over `origin` for "top 5 donors". The part's data covers
 * the whole axis; the website offers the operation to Studio.
 */
export interface Operation {
    verb: OperationVerb;
    /** the query's own wording for the operation, e.g. "top 5 donors" */
    phrase: string;
    /** null when the verb runs over no axis, as `explain` does */
    over?: OperationAxis | null;
    /** the four-digit year a `forecast` runs to, e.g. 2030 for "by 2030"; absent on other verbs */
    target_year?: number | null;
}

/**
 * One variable's complete outcome inside ResolveResponse.parts, as it rides
 * the wire: its own status and exactly one of the four payload fields below,
 * plus its own warnings/timing/sentence (not shared via the envelope).
 * `spec`/`candidates`/`no_data` carry un-flattened WireSpecs — see `Part`
 * for the page-side, flattened shape.
 */
export interface WirePart {
    /** Every dataset_resubmit entry kind echoes its own variable_text onto
     *  the rebuilt part. Null is reserved for the raw_text path's
     *  empty-query refusal. */
    variable_text?: string | null;
    /** this part's own signals only (e.g. binding_folded, observations_omitted) */
    warnings: Warning[];
    /** this part's own by_step timing; excludes the shared once-per-request extract step */
    timing_ms?: Timing | null;
    /** a definite part stays null (the confirmation sentence lives at
     *  spec.resolved.rendered_sentence instead) */
    rendered_sentence?: string | null;
    sentence_plan?: SentenceToken[] | null;
    /** Null whenever this part was resolved from a posted identity/candidate
     *  set/stub (none carry a phrase of their own), or for another reason
     *  the wire does not name. */
    restatement?: ParsedPart | null;
    /** operations the question asked of this part that search did not apply */
    operations?: Operation[];
    /** every way this part's answer differs from what its request asked, in
     *  DepartureCode order; [] when the answer is what was asked */
    departures: Departure[];
    status: ResolveStatus | 'unsupported';
    /** present iff status === "definite" */
    spec?: WireSpec;
    /** present iff status === "candidates" */
    candidates?: WireCandidateSet;
    /** present iff status === "no_data" */
    no_data?: WireNoData;
    /** present iff status === "unsupported" */
    unsupported?: Unsupported;
}

/**
 * The page-side `Part`: same fields as `WirePart`, after
 * searchClient.normalizeResponse has flattened every nested WireSpec (the
 * definite `spec`, each of `candidates.specs`, and `no_data.nearest_real` /
 * `no_data.flagged_match`) into the flat `Spec` shape above.
 */
export interface Part {
    variable_text?: string | null;
    /** this part's own signals only (e.g. binding_folded, observations_omitted) */
    warnings: Warning[];
    /** this part's own by_step timing; excludes the shared once-per-request extract step */
    timing_ms?: Timing | null;
    /** a definite part stays null (the confirmation sentence lives at
     *  spec.rendered_sentence instead) */
    rendered_sentence?: string | null;
    sentence_plan?: SentenceToken[] | null;
    restatement: ParsedPart | null;
    /** operations the question asked of this part that search did not
     *  apply; normalizeResponse defaults it to empty when the wire omits it */
    operations: Operation[];
    /** every way this part's answer differs from what its request asked, in
     *  DepartureCode order; [] when the answer is what was asked. The stream's
     *  `done` event can add more (see searchClient.applyDoneEvent). */
    departures: Departure[];
    status: ResolveStatus | 'unsupported';
    /** present iff status === "definite" */
    spec?: Spec;
    /** present iff status === "candidates" */
    candidates?: CandidateSet;
    /** present iff status === "no_data" */
    no_data?: NoData;
    /** present iff status === "unsupported" */
    unsupported?: Unsupported;
}

// ---------------------------------------------------------------------------
// ResolveResponse (the envelope)
// ---------------------------------------------------------------------------

/** The fields every response body carries, whatever its `kind`. */
interface ResponseBody {
    schema_version: SchemaVersion;
    query_echo: QueryEcho;
    diagnostics: Diagnostics;
}

/**
 * A resolution: one entry in `parts` per variable the query asked about, in
 * query order — a single-variable query is one part. Each part carries its
 * own outcome (`status` plus exactly one of `spec` / `candidates` /
 * `no_data` / `unsupported`). searchClient.normalizeResponse flattens the
 * nested WireSpecs in `parts`. The page renders every part, in order
 * (useSearchRun.ts's `HydratedPart[]`).
 */
export interface Resolution extends ResponseBody {
    kind: 'resolution';
    /** the parts' shared status, or "mixed" when two or more parts disagree.
     *  Includes "unsupported", a Part's own status literal distinct from
     *  ResolveStatus: an all-unsupported envelope is itself a valid shared
     *  value, separate from mixed. */
    status: ResolveStatus | 'unsupported' | 'mixed';
    /** one entry per variable asked, in query order; always >= 1 */
    parts: Part[];
    /**
     * The envelope's own composed sentence over every part in `parts`: one
     * hero sentence rather than N per-part ones. A single-part response's
     * plan equals that part's own plan. See SentenceToken.part_index
     * and `lib/search/sentencePlan.ts`'s tokenPart for how a multi-part
     * plan's tokens route to their part.
     */
    rendered_sentence?: string | null;
    sentence_plan?: SentenceToken[] | null;
}

/** The country a catalogue or declined answer is about, when the query named
 *  one and the resolver confirmed it. */
export interface Scope {
    place: GraphRef | null;
}

/** A question about what data exists, such as "What data do you have on
 *  Kenya?". It carries no parts; the website renders the catalogue. */
export interface CatalogueAnswer extends ResponseBody {
    kind: 'catalogue';
    scope: Scope;
}

/** Why a question was declined: it asks for something outside the data
 *  (`out_of_scope`), or for analysis without naming data to show
 *  (`requires_analysis`). */
export type DeclinedReason = 'out_of_scope' | 'requires_analysis';

/** A question search does not answer. It carries no parts and no message;
 *  the website writes the copy. */
export interface DeclinedAnswer extends ResponseBody {
    kind: 'declined';
    reason: DeclinedReason;
    scope: Scope;
}

/** Every resolve response body, discriminated on `kind`. Every outcome is
 *  HTTP 200; only a resolution carries parts and a `status`. */
export type ResolveResponse = Resolution | CatalogueAnswer | DeclinedAnswer;

// ---------------------------------------------------------------------------
// Per-part run state (client-side only; never on the wire). One resolve run
// holds N parts in query order, each streaming, editing, and erroring on its
// own. See useSearchRun.ts's top doc comment for how these compose.
// ---------------------------------------------------------------------------

/** One part's own loading lifecycle within a run: 'loading' while its content
 *  is unresolved (the initial run hasn't reached `done` yet) or an edit
 *  targeting it is in flight; 'done' once that window closes; 'error' on a
 *  transport failure scoped to that part's own stream (a resubmit that never
 *  got a response). An edit that resolved to no_data/candidates sets
 *  `editError` on an otherwise still-'done' part instead. */
export type PartPhase = 'loading' | 'done' | 'error';

/** One entry per part, in query order. Index always equals wire part
 *  position. Nothing filters or reorders this list. `part` is null until the
 *  run's `response` event lands for this index, or stays null for a rejected
 *  edit (the previous content stays under the old `part`/`hydratedSpec`,
 *  with `editError` set instead of a replacement). */
export interface HydratedPart {
    index: number;
    /** Most edits leave it unchanged, but a typed `what` edit lands a new
     *  phrase here; permalink replay's guard uses the BASE run's own phrase
     *  instead (never this field), since a chain of edits would otherwise
     *  drift the guard from the phrase a reload reproduces. */
    variableText: string | null;
    part: Part | null;
    /** `part.spec` with its trailing observations/facet_options merged in;
     *  populated only when `part.status === 'definite'`. */
    hydratedSpec: Spec | null;
    /** True while this part's hydrated spec exists, its `observations` is
     *  still null, and one of the run's streams is open (the base run is
     *  loading, or an edit post is in flight): "the observations have not
     *  arrived yet". Distinct from an empty result, whose observations are
     *  null with every stream closed, the case that must still reach the
     *  omission copy once the engine has settled. */
    observationsPending: boolean;
    phase: PartPhase;
    /** set when an edit targeting this part resolved to no_data/candidates.
     *  The block keeps its previous content and shows this message instead
     *  of a page-level banner. Cleared on the part's next successful edit,
     *  or by a fresh raw_text run. */
    editError: string | null;
}

/** The named skeleton list a run seeds from the `interpretation` event,
 *  before any part has its own content, sized to `expected_results`, in
 *  query order. Reset (and re-derived from the confirmed `parts`) once the
 *  `response` event lands, so a `variables_clamped` request still lines up. */
export interface ExpectedPart {
    index: number;
    variableText: string;
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/** path A: UI, Python package. Extract runs. */
export interface RawTextInput {
    kind: 'raw_text';
    query: string;
}

/** path B: pre-parsed parts, extract skipped. Also the shape of
 *  `NoData.data_query`. Parts byte-identical in every field collapse to
 *  one before resolution. */
export interface ParsedInput {
    kind: 'parsed';
    /** 1 to 6, one per variable ask */
    parts: ParsedPart[];
    /** echo-only; the engine MUST NOT re-parse it */
    raw_query?: string | null;
}

/**
 * `role_text` is the display role when the query bound a directional role,
 * absent for a plain subject entity. `dcid` is a caller-supplied pin, only
 * ever sent on a posted entry, only when the response being edited carried
 * `ambiguous_entities`.
 */
export interface ParsedPartEntity {
    text: string;
    role_text?: string | null;
    /** a pinned graph node for `text`: name resolution is skipped and the
     *  dcid confirmed against the graph instead */
    dcid?: string | null;
    /** true when the entity names a group whose member places fill the role */
    members?: boolean | null;
}

/**
 * The canonical restatement of one part's inputs: what the engine actually
 * resolved from, not the user's own wording. Posting it back (a `parsed`
 * dataset_resubmit entry) reproduces the same DateRequest, entities, unit,
 * source, and spec_id. `time_text` is absent for an open-start or reversed
 * window, where no phrase exists for it. Never shown to the user as "what
 * you asked".
 */
export interface ParsedPart {
    variable_text: string;
    /** null, omitted or empty all mean no entity was named for this part */
    entities?: ParsedPartEntity[] | null;
    time_text?: string | null;
    unit_text?: string | null;
    source_text?: string | null;
    /** echoed onto the resolved part */
    operations?: Operation[];
}

// ---------------------------------------------------------------------------
// dataset_resubmit: the multi-part edit door (contract v1). Four entry kinds
// are modeled here, keyed by `entry_kind`. `buildDatasetEntries`
// (datasetEntries.ts) never derives a `parsed` entry from a part's own
// status; a typed edit or an entity_ambiguous pick builds one directly and
// passes it in as an override. Every entry carries its part's `operations`
// back, and the engine echoes them onto the rebuilt part.
// ---------------------------------------------------------------------------

/** A definite part's entry: the complete identity the part should resolve
 *  to, edited or not. Mirrors `ResubmitIdentityPayload` (dfo-apis
 *  src/search/models/request.py), which derives the membership from the
 *  identity alone. Every entry carries `variable_text`: the engine nulls it
 *  otherwise and the composer would render a blank phrase. `entity_groups`
 *  is the `Spec.entity_groups` of the Spec the identity derives from, keyed
 *  by role key; the engine keeps a group whose role the identity still
 *  binds to the group's members and drops the rest. */
export interface DatasetIdentityEntry {
    entry_kind: 'identity';
    variable_text: string;
    identity: BaseIdentity;
    entity_groups?: Record<string, EntityGroup> | null;
    operations?: Operation[];
}

/** One competing identity inside a `candidates` entry, with the
 *  `Spec.entity_groups` of the candidate Spec it came from. Specs return in
 *  posted order. */
export interface DatasetCandidateIdentity {
    identity: BaseIdentity;
    entity_groups?: Record<string, EntityGroup> | null;
}

/** A candidates part's entry: `ordering`/`truncated` echoed verbatim from the
 *  part's own CandidateSet, `candidates` at least 2. No `max_candidates`: the
 *  door defines the entry without it and rejects the extra field. A
 *  candidate that promotes to no_data drops. Fewer than 2 survivors return
 *  definite (1) or no_data (0) in the response. */
export interface DatasetCandidatesEntry {
    entry_kind: 'candidates';
    variable_text: string;
    ordering: Ordering;
    truncated: boolean;
    candidates: DatasetCandidateIdentity[];
    operations?: Operation[];
}

/** A no_data or unsupported part's entry: holds the part's position in the
 *  request without asking the engine to re-derive anything. The response
 *  part for this entry carries `part_restated`. The client keeps its own
 *  richer copy of that part rather than trusting the returned stub. */
export interface DatasetPlaceholderEntry {
    entry_kind: 'placeholder';
    variable_text: string;
    status: 'no_data' | 'unsupported';
    reason?: NoDataReason;
    code?: string;
    operations?: Operation[];
}

/**
 * Re-parsed, where `placeholder` only restates a stub. `part` already
 * carries its own required `variable_text`, so this entry needs no separate
 * top-level echo, and its operations ride on `part`. Mirrors dfo-apis
 * `ResubmitParsedEntry`.
 */
export interface DatasetParsedEntry {
    entry_kind: 'parsed';
    part: ParsedPart;
}

export type DatasetResubmitEntry =
    DatasetIdentityEntry | DatasetCandidatesEntry | DatasetPlaceholderEntry | DatasetParsedEntry;

/**
 * path D: the multi-part edit door. `entries` are 1 to 6, in response
 * part order. `raw_query` is echo-only, same as ParsedInput's.
 */
export interface DatasetResubmitInput {
    kind: 'dataset_resubmit';
    entries: DatasetResubmitEntry[];
    raw_query?: string;
}

export type ResolveInput = RawTextInput | ParsedInput | DatasetResubmitInput;

export interface ResolveOptions {
    coverage?: 'auto' | 'prefer_exact' | 'breadth_only' | 'none';
    place_as_constraint?: boolean;
    /** when true, each SlotOption.coverage carries an observation count */
    include_option_coverage?: boolean;
    /**
     * When true (the default -- absent also means true), Spec.observations is
     * populated with the resolved answer's observation values. Set false to opt
     * out. Delivery mirrors include_option_coverage's SSE/buffered transport split.
     */
    include_observations?: boolean;
}

export interface ResolveRequest {
    schema_version: SchemaVersion;
    input: ResolveInput;
    options?: ResolveOptions;
}

// ---------------------------------------------------------------------------
// EntityOptionsWire: on-demand entity-slot alternatives (POST /api/search/options),
// place_options' successor (see searchClient.ts's entityOptions for the door itself).
// ---------------------------------------------------------------------------

/** Which anchor types each scope supports in v1 is documented on the engine's
 * options endpoint (app.py); an unsupported anchor type is a typed 400,
 * not a silent empty result. */
export type PlaceOptionsScope = 'peers' | 'children';

/**
 * Request body for the options door. Lazy and on-demand: fetched only when a
 * user opens an entity editor, not part of /resolve. The door derives the
 * identity's own StatVar population server-side, so the client posts no
 * resolved-stat-var seed, just the spec's hashed identity and
 * which role/scope it wants alternatives for. `for.role` names which entity
 * role the returned options fill: the bound anchor's own role, e.g.
 * 'destination' for a CRS recipient, defaulting to 'observationAbout' for a
 * non-directional place.
 */
export interface EntityOptionsWireRequest {
    /** the spec's hashed identity, opaque to the client */
    identity: unknown;
    for: { role: EntityRoleKey; scope: PlaceOptionsScope };
    /** per-option data footprint (observation counts / years) for the rows */
    include_coverage: boolean;
}

/** One candidate entity confirmed to have data, with a resolved display label. */
export interface EntityOptionsWireValue {
    ref: GraphRef;
    value_kind: 'entity';
}

/** Response for POST /api/search/options. */
export interface EntityOptionsWireResponse {
    options: {
        /** candidate entities confirmed to have data, in candidate order */
        items: Array<{
            value: EntityOptionsWireValue;
            coverage?: Coverage | null;
            /** on an origin or destination entity option, what the party is
             *  beside the others on its side, as the code index lists it.
             *  Absent for a party the index does not list. */
            party_kind?: PartyKind | null;
        }>;
        /**
         * true when items is only a subset of the full candidate set (the
         * endpoint's own cap), false when items is the complete candidate
         * set -- NOT a statement about how many candidates had data.
         */
        truncated: boolean;
    };
}
