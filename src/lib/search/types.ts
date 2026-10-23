/**
 * Search contract types for the site.
 *
 * The wire types come from `@developmentfinance/client/wire`, generated from the API's served
 * OpenAPI document; this file re-exports the ones the site names and builds three kinds of type on
 * top of them:
 *
 * - the page shapes `searchClient.normalizeResponse` produces (`Spec`, `Part`, `CandidateSet`,
 *   `NoData`, `Resolution`), where every nested wire Spec is flattened;
 * - the SSE stream payloads the OpenAPI document does not describe (`Frame`, `LateDepartures`);
 * - the client-only run state (`PartPhase`, `HydratedPart`, `ExpectedPart`).
 *
 * String enums on the wire are open unions, so a value the server adds still typechecks. `Known`
 * closes one where the site writes a value; code that reads one handles the unknown case.
 */

import { PART_STATUSES } from '@developmentfinance/client';
import type * as wire from '@developmentfinance/client/wire';

/** The closed part of an open wire enum, holding the values this release names and omitting the
 *  `string` tail a newer server may fill. */
export type Known<T> = T extends string ? (string extends T ? never : T) : T;

/** True when `key` is one of `map`'s own keys, which narrows an open wire value to the closed
 *  set a site map covers. */
export function hasKey<K extends string>(map: Record<K, unknown>, key: string): key is K {
    return Object.hasOwn(map, key);
}

/** `T` without null and undefined. `NonNullable` intersects with `{}`, which folds an open enum's
 *  literals into its `string & {}` tail. */
type Present<T> = Exclude<T, null | undefined>;

// ---------------------------------------------------------------------------
// Wire types, as generated
// ---------------------------------------------------------------------------

export type {
    Assumption,
    BaseIdentity,
    CatalogueAnswer,
    ConversionCurrency,
    DeclinedAnswer,
    Departure,
    EntityGroup,
    EntityOptions,
    GraphRef,
    IdentityUnitRequest,
    MeasureAxisValue,
    NoDataDenominator,
    NoDataOption,
    ObservationSeries,
    ObservationsOmission,
    OpenConstraintAxisFact,
    ParsedPart,
    ProvenanceRef,
    RelatedMeasure,
    ResubmitCandidate as DatasetCandidateIdentity,
    ResubmitCandidatesEntry as DatasetCandidatesEntry,
    ResubmitIdentityEntry as DatasetIdentityEntry,
    ResubmitParsedEntry as DatasetParsedEntry,
    ResubmitPlaceholderEntry as DatasetPlaceholderEntry,
    ParsedEntity as ParsedPartEntity,
    RequestedOperation as Operation,
    RoleAxis,
    SentenceToken,
    Shape,
    Slot,
    SlotOption,
    SlotOptions,
    SpecAlternativeMeasure,
    SpecObservations,
    TimeWindow,
    UnitAlternative,
    UnitConversion,
    Warning,
} from '@developmentfinance/client/wire';

/** The envelope's contract version. */
export type SchemaVersion = Present<wire.Resolution['schema_version']>;

/** The three outcomes a part with data to show can carry. */
export type ResolveStatus = Exclude<wire.KnownPart['status'], 'unsupported'>;

/** The flat role a resolved entity plays: the subject role or a flow direction. */
export type EntityRoleKey = wire.ResolvedEntity['role'];

/** Who the data on a provenance comes from: the Observatory, Data Commons by Google, or the UN
 *  System Data Commons. */
export type DataCommonsRef = wire.SearchModelsGrammarDataCommonsRef;

/** The fixed slot-grammar axes. */
export type SlotAxis = wire.SlotKey['axis'];

/** Why a part offers a Spec as one of its candidates. */
export type CandidateBasis = Present<wire.ResolvedSpec['basis']>;

/** Why a facet axis holds its value. */
export type FacetBasis = wire.ResolvedFacet['basis'];

/** What one party of a flow is beside the other parties on its side. */
export type PartyKind = Present<wire.SeriesEntityRef['party_kind']>;

/** A Spec's coverage, one of the exact, breadth and bare forms. */
export type Coverage = wire.ResolvedSpec['coverage'];

/** Why a definite Spec's observations were withheld; doubles as the paired warning's code. */
export type ObservationsOmissionReason = wire.ObservationsOmission['reason'];

/** What a question asked of a part's data beyond showing it. */
export type OperationVerb = wire.RequestedOperation['verb'];

/** Why a question was declined. */
export type DeclinedReason = wire.DeclinedAnswer['reason'];

/** Which candidate universe the options door enumerates for a place role. */
export type PlaceOptionsScope = Present<Known<wire.OptionsFor['scope']>>;

/** What an assumption fills: a declared default, an open flow role, or the place scope. */
export type AssumptionKind = Known<wire.Assumption['kind']>;

/** The block of the answer a sentence token belongs to. */
export type SentenceSegment = Present<wire.SentenceToken['segment']>;

/** Why a no_data outcome was returned. */
export type NoDataReason = wire.NoData['reason'];

/** Which availability gate a no_data outcome's `flagged_match` or `alternate_match` failed. */
export type NoDataGate = Present<wire.NoData['gate']>;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** The identity a dataset_resubmit entry edits and posts back. */
export type SpecIdentity = wire.BaseIdentity;

/** One what/how slot's binding state inside an identity. */
export type IdentityBinding = wire.IdentitySlot['binding'];

/** The sparse facet map of an identity, keyed by facet axis. */
export type IdentityFacets = Present<wire.BaseIdentity['facets']>;

/** The binding the site writes on each facet axis. Every facet carries a provenance, so
 *  `provenance` takes declared refs only; `measurementMethod` and `unit` also take a null ref, and
 *  `unit` alone takes the request form. The wire keys `IdentityFacets` by string and takes any of
 *  these on any axis. */
export type IdentityFacetBinding = {
    provenance: IdentityFacetRefBinding;
    measurementMethod: IdentityFacetRefBinding | wire.IdentityFacetValueAbsent;
    unit: IdentityFacetRefBinding | wire.IdentityFacetValueAbsent | wire.IdentityFacetValueRequest;
};

/** The facet axes an identity binds. */
export type IdentityFacetAxis = keyof IdentityFacetBinding;

/** A facet axis bound to declared values. */
export type IdentityFacetRefBinding = wire.IdentityBindingValue | wire.IdentityBindingSet;

/** An identity's requested window: every year, the latest year, or a range. */
export type IdentityWindow = wire.BaseIdentity['requested_window'];

/** One dataset_resubmit entry. */
export type DatasetResubmitEntry = wire.DatasetResubmitInput['entries'][number];

// ---------------------------------------------------------------------------
// Page shapes (searchClient.normalizeResponse's output)
// ---------------------------------------------------------------------------

/**
 * A wire Spec flattened by `searchClient.flattenSpec`. `resolved` is spread flat, with `spec_id`,
 * the trace again as `resolution`, the definition's `identity`, and the `definition` itself (the
 * Datasets API mints unregistered specs from it). Specs nested in `equivalent_readings` stay in
 * the wire form.
 */
export type Spec = Omit<wire.ResolvedSpec, 'facet_options'> & {
    spec_id: string;
    resolution: wire.ResolutionTrace;
    identity: SpecIdentity | null;
    definition: wire.SpecDefinition | null;
    facet_options?: FacetOptionsEntry[];
};

/** One facet axis's options as the page holds them. The stream's `facet_options` event sends no
 *  `source`. */
export type FacetOptionsEntry = Omit<wire.FacetOptions, 'source'>;

/**
 * A wire Spec `flattenSpec` could not read, because its `stat_vars` is not the wire's shape or it
 * lacks the definition/resolved split. It carries its `spec_id` and whichever page Spec members the body
 * held, so the page shows a failure state in its place.
 */
export type UnreadableSpec = Pick<Spec, 'spec_id'> &
    Partial<Omit<Spec, 'spec_id' | 'stat_vars'>> & { stat_vars_unreadable: true };

/** A Spec as a part holds it: read, or flagged unreadable. `view.statVarsUnreadable` tells them
 *  apart. */
export type PartSpec = Spec | UnreadableSpec;

/** A set of competing Specs, each flattened. */
type CandidateSet = Omit<wire.CandidateSet, 'specs'> & { specs: PartSpec[] };

/** A no_data outcome with its nearest, flagged and alternate Specs flattened. */
export type NoData = Omit<wire.NoData, 'nearest_real' | 'flagged_match' | 'alternate_match'> & {
    nearest_real?: PartSpec[] | null;
    flagged_match?: PartSpec | null;
    alternate_match?: PartSpec | null;
};

/** The members `searchClient.flattenPart` defaults when the wire omits them. */
type PartDefaults = {
    restatement: wire.ParsedPart | null;
    operations: wire.RequestedOperation[];
    warnings: wire.Warning[];
    departures: wire.Departure[];
};

type PagePart<TPart, TPayload> = Omit<TPart, keyof PartDefaults | keyof TPayload> &
    PartDefaults &
    TPayload;

type DefinitePart = PagePart<wire.DefinitePart, { spec: PartSpec }>;
export type CandidatesPart = PagePart<wire.CandidatesPart, { candidates: CandidateSet }>;
export type NoDataPart = PagePart<wire.NoDataPart, { no_data: NoData }>;
type UnsupportedPart = PagePart<wire.UnsupportedPart, object>;

/** A part whose status this release knows; its `status` narrows it. */
type KnownPart = DefinitePart | CandidatesPart | NoDataPart | UnsupportedPart;

/** A part whose status this release does not know. Its members pass through, with the defaults
 *  `flattenPart` gives every part. */
type UnknownPart = wire.UnknownPart & PartDefaults;

/** One part of a resolution after normalisation. `isKnownPart` separates an unknown part before
 *  a switch on `status`. */
export type Part = KnownPart | UnknownPart;

const KNOWN_PART_STATUSES: ReadonlySet<string> = new Set(PART_STATUSES);

/** True for a part whose status this release knows, which then narrows on `status`. */
export function isKnownPart(part: Part): part is KnownPart {
    return KNOWN_PART_STATUSES.has(part.status);
}

/** The part as a known part; null for no part, or for one whose status this release does not
 *  know. */
export function knownPart(part: Part | null | undefined): KnownPart | null {
    return part && isKnownPart(part) ? part : null;
}

/** A resolution with its parts normalised. */
export type Resolution = Omit<wire.Resolution, 'parts'> & { parts: Part[] };

/** Every resolve response body after normalisation, discriminated on `kind`. */
export type ResolveResponse = Resolution | wire.CatalogueAnswer | wire.DeclinedAnswer;

// ---------------------------------------------------------------------------
// Stream payloads, hand-written because the OpenAPI document does not describe the SSE stream
// ---------------------------------------------------------------------------

/** Departures the stream's `done` event adds to one part. They are facts that depend on the
 *  observations read, which arrive after `response`. A folded part and the part it folded into
 *  share a spec_id, so `part_index` names the part and `spec_id` confirms it holds that part's
 *  spec. */
export interface LateDepartures {
    part_index: number;
    spec_id: string;
    departures: wire.Departure[];
}

/** Who stated a frame field: the caller, the extraction model, a code reader over the request's
 *  words, the quantity read's model over the variable phrase, or the default the question left
 *  in place. */
type FrameStatedBy = 'caller' | 'extraction' | 'reader' | 'model' | 'default';

/** A frame value and who stated it. */
interface FrameStated<T> {
    value: T;
    stated_by: FrameStatedBy;
}

/** One place the part names, keyed by the request's text for it. */
interface FramePlace {
    /** the request's text for the place, or the dcid on the dataset_resubmit door */
    name: string;
    stated_by: FrameStatedBy;
    /** `both` is a place put on both axes, as a self-flow; `undirected` a place named with no
     *  axis */
    direction: 'origin' | 'destination' | 'both' | 'undirected';
    /** whether the request's words give the place its direction. A role read off the measure,
     *  as in a possessive, states none */
    direction_stated: boolean;
    /** its members each as their own place, or the default, which is the set's node where it
     *  has one and its members otherwise */
    reading: 'default' | 'members';
    /** the dcid the caller pinned for the place, when it gave one */
    pin?: string | null;
    /** the places the name stands for under its reading, once resolved; empty before place
     *  resolution and for a name that did not resolve */
    dcids: string[];
}

/** One data source a part names or excludes, as its words, a reference, or both. */
interface FrameSourceMention {
    text?: string | null;
    ref?: string | null;
    polarity: 'include' | 'exclude';
}

/** The codes the part's words match in one recalled vocabulary. */
interface FrameVocabularyCodes {
    /** the vocabulary's constraint properties, sorted */
    vocabulary: string[];
    /** the code dcids matched, in match order */
    codes: string[];
}

/** The value a constraint slot takes where the question names none. */
interface FrameSlotDefault {
    property: string;
    value: string;
    stated_by: 'default';
}

/** What the part measures, as the recalled vocabularies read its words. */
interface FrameMeasure {
    codes: FrameStated<FrameVocabularyCodes[]>;
    /** the measure class a word names (prevalence, incidence, mortality) */
    measure_class?: FrameStated<string> | null;
    /** the statType: measuredValue unless a measure word states another */
    stat_type: FrameStated<string>;
    /** the qualifier phrases the door dropped from the variable */
    dropped: FrameStated<string[]>;
    /** the declared default of each constraint slot the recalled shapes hold */
    slot_defaults: FrameSlotDefault[];
}

/** The form the part asks its measure in. */
interface FrameNormalisation {
    /** the normalisations the words name, sorted; "level" when they name none */
    form: FrameStated<string[]>;
    /** the denominator the words name, as the quantity read chose it, either a base the eligible
     *  shapes divide by under its graph name or else the words that name it; null when the
     *  words name none */
    denominator?: FrameStated<string> | null;
}

/** Something the frame could not settle, with its possible readings. direction: a place named
 *  with no axis on a question a recalled shape gives roles; span: words that match two or more
 *  codes, or a code and a measure value; group_reading: a set holding both a node and members,
 *  read by default. */
interface FrameUnresolved {
    kind: 'direction' | 'span' | 'group_reading';
    /** the place name or the words */
    subject: string;
    readings: string[];
}

/** What one part asks, carried by the stream's `frame` event. `measure`, `normalisation` and
 *  `unresolved` are set after recall. The dataset_resubmit door builds no frame. */
export interface Frame {
    variable: FrameStated<string>;
    places: FramePlace[];
    /** every year the data holds, the latest year, or a window of years */
    window: FrameStated<'all' | 'latest' | wire.TimeWindow>;
    /** the unit phrase the question states */
    unit?: FrameStated<string | wire.IdentityUnitRequest> | null;
    sources?: FrameStated<FrameSourceMention[]> | null;
    operations: FrameStated<wire.RequestedOperation[]>;
    /** the flow axes asked member by member, sorted */
    open_roles: FrameStated<wire.RoleAxis[]>;
    /** the measurementQualifier the words name; no value stated by "default" reads the
     *  dataset's declared default reading. The stream omits a null value, so `value` is absent
     *  then. */
    price_basis: { value?: string | null; stated_by: FrameStatedBy };
    measure?: FrameMeasure | null;
    normalisation?: FrameNormalisation | null;
    unresolved: FrameUnresolved[];
}

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
    hydratedSpec: PartSpec | null;
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

/** A definite part whose spec has landed. */
export type DefiniteHydratedPart = HydratedPart & { hydratedSpec: PartSpec };

/** True for a definite part whose spec has landed. */
export function hasDefiniteSpec(part: HydratedPart): part is DefiniteHydratedPart {
    return part.part?.status === 'definite' && part.hydratedSpec != null;
}

/** The named skeleton list a run seeds from the `interpretation` event,
 *  before any part has its own content, sized to `expected_results`, in
 *  query order. Reset (and re-derived from the confirmed `parts`) once the
 *  `response` event lands, so a `variables_clamped` request still lines up. */
export interface ExpectedPart {
    index: number;
    variableText: string;
}
