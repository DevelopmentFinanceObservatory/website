/**
 * Studio v1 wire contract — TypeScript mirror.
 *
 * Source of truth: `services/harness/src/harness/wire.py` on the dfo-ai
 * `feat/studio-v1` branch (and `docs/frontend-interface.md`, which agrees
 * with it). Requests are discriminated on `kind`, frames on `event`. The
 * server refuses unknown fields, so requests here carry exactly the named
 * members and nothing else.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type SpecRef = { spec_id: string; content_version: string };

export type Source = {
    id: string;
    name: string;
    licence: string;
    publisher?: string | null;
    url?: string | null;
    retrieved?: string | null;
    // The graph's provenance dcid. The platform's envelope sources carry it
    // beside their minted `src_` id; the harness's own sources use the dcid
    // as their id.
    ref?: string | null;
};

export type Freshness = {
    data_through: string;
    last_refreshed: string;
    partial_period: boolean;
    next_expected?: string | null;
};

export type WireWarning = {
    code: string;
    severity: 'info' | 'warn' | 'degraded';
    message: string;
    part_index?: number | null;
    spec_id?: string | null;
};

export type Provenance = {
    inputs: SpecRef[];
    sources: Source[];
    freshness: Freshness;
    warnings: WireWarning[];
    generated_at: string;
    citation: string;
    execution_ref?: string | null;
    refreshed_from?: number | null;
};

export type Unit = {
    currency: string | null;
    magnitude: 'units' | 'thousands' | 'millions' | 'billions' | null;
    price_basis: 'current' | 'constant' | null;
    base_year: number | null;
};

export type Indicator = { id: string; name: string; description: string };

export type Attribution = {
    label: string;
    source_count: number;
    indicator_count: number;
    source_detail_url?: string | null;
};

export type ErrorCode =
    | 'schema_invalid'
    | 'binding_invalid'
    | 'constraint_violation'
    | 'unsupported_component_type'
    | 'unsupported_version'
    | 'edit_conflict'
    | 'not_found'
    | 'resource_exhausted'
    | 'transient_unavailable'
    | 'rate_limited'
    | 'cancelled'
    | 'capability_unavailable';

export type RetryMode =
    'correct_and_retry' | 'refresh_then_retry' | 'retry_after_delay' | 'do_not_retry';

export type ToolError = {
    error: ErrorCode;
    retry: RetryMode;
    detail: string;
    constraint_id?: string | null;
    pointer?: string | null;
    fix?: string | null;
    retry_after_seconds?: number | null;
};

export type ComponentType =
    | 'stat_card'
    | 'line_chart'
    | 'bar_chart'
    | 'scatter_chart'
    | 'table'
    | 'note_user'
    | 'note_narration'
    | 'source_card';

// ---------------------------------------------------------------------------
// fact_summary — the bounded set of facts narration may cite
// ---------------------------------------------------------------------------

export type SeriesChange = {
    from_period: string;
    to_period: string;
    absolute?: number | null;
    percent?: number | null;
};

export type FactSeries = {
    id: string;
    label: string;
    point_count: number;
    // The series' NARROWING metadata (stat_var / observationAbout / unit /
    // provenance — the keys that filter the Parquet rows), NOT plot points.
    coordinates?: Record<string, string> | null;
    first?: number | null;
    last?: number | null;
    change?: SeriesChange | null;
};

export type FactSummary = {
    component_id: string;
    revision: number;
    series: FactSeries[];
    indicators: Indicator[];
    attribution: Attribution;
    window?: { start: string; end: string } | null;
    unit?: Unit | null;
    series_truncated?: { showing: number; total: number } | null;
    countries?: string[] | null;
};

// ---------------------------------------------------------------------------
// Composition — the server-owned canvas state
// ---------------------------------------------------------------------------

export type LayoutHint = { type: 'row' | 'comparison'; members: string[] };

export type CardMeta = {
    subtitle?: string | null;
    description?: string | null;
    x_label?: string | null;
    y_label?: string | null;
    // Client-owned free bag; the server stores it verbatim and never
    // interprets it.
    style?: Record<string, unknown> | null;
};

export type CompositionBlock = {
    component_id: string;
    revision: number;
    type: ComponentType;
    title: string;
    pinned?: boolean | null;
    meta?: CardMeta | null;
};

export type CompositionManifest = {
    composition_id: string;
    revision: number;
    actor: 'user' | 'model';
    blocks: CompositionBlock[];
    counts: { all: number; stats: number; charts: number; tables: number; notes: number };
    layout_hints?: LayoutHint[] | null;
};

// ---------------------------------------------------------------------------
// Requests — discriminated on `kind`
// ---------------------------------------------------------------------------

export type ComponentRef = {
    component_id: string;
    revision: number;
    intent: 'follow_up' | 'edit';
};

/** One definite part's Spec block from a Search API response, as the
 *  Search API returned it: `definition.spec_id` equals `spec_id`, and the
 *  block runs to at most 1,048,576 bytes of compact JSON. The harness
 *  accepts the block's other members too. */
export type SeedSpec = {
    spec_id: string;
    definition: { schema_version: 1; spec_id: string; identity: object };
    resolved: object;
};

/** An operation the question asked of a seed's data: the Search API's
 *  `Operation`. */
export type SeedOperation = {
    verb: 'rank' | 'aggregate' | 'growth' | 'share_of' | 'explain' | 'forecast' | 'report';
    phrase: string;
    over?: 'place' | 'origin' | 'destination' | 'category' | 'year' | null;
    target_year?: number | null;
};

/** A Search result handed to Studio: the Spec the user saw, and the
 *  operations the question asked of it. */
export type Seed = {
    spec: SeedSpec;
    operations: SeedOperation[];
};

export type TurnRequest = {
    kind: 'turn.request';
    schema_version: 1;
    conversation_id: string;
    message: string;
    surface?: 'studio' | 'download' | 'embed';
    component_ref?: ComponentRef | null;
    /** The Search results a "… in Studio" action hands over, one per
     *  definite part, so 1 to 6. The harness mints each before
     *  planning and plans from those datasets and their operations. */
    seed_spec?: Seed[] | null;
    auto_add?: boolean;
};

export type InterruptDecision = 'approve' | 'amend' | 'reject' | 'answer' | 'skip';

export type InterruptResponse = {
    kind: 'interrupt.response';
    schema_version: 1;
    conversation_id: string;
    interrupt_id: string;
    decision: InterruptDecision;
    // Amendment text (amend) or the chosen option id / free text (answer);
    // omitted for approve / reject / skip.
    payload?: string;
};

export type MutationOperation =
    | { op: 'add'; component_id: string }
    | { op: 'reorder'; order: string[] }
    | { op: 'remove'; component_id: string }
    | { op: 'pin'; component_id: string }
    | { op: 'unpin'; component_id: string }
    | { op: 'set_layout_hints'; layout_hints: LayoutHint[] | null }
    | { op: 'set_card_meta'; component_id: string; meta: CardMeta };

export type CompositionMutation = {
    kind: 'composition.mutate';
    schema_version: 1;
    conversation_id: string;
    composition_id?: string | null;
    operations: MutationOperation[];
    expected_revision?: number | null;
};

export type CancelRequest = {
    kind: 'turn.cancel';
    schema_version: 1;
    conversation_id: string;
};

// ---------------------------------------------------------------------------
// Frames — discriminated on `event`
// ---------------------------------------------------------------------------

export type PlanStep = { id: string; label: string; description?: string | null };

export type PlanDecision = {
    id: string;
    question: string;
    chosen: string;
    reason: string;
    resolved_by: 'default' | 'user';
    alternatives?: string[] | null;
};

export type PlanProposed = {
    event: 'plan.proposed';
    seq: number;
    interrupt_id: string;
    plan_version_id: string;
    version: number;
    title: string;
    steps: PlanStep[];
    actions: ('approve' | 'amend' | 'reject')[];
    depth?: 'shallow' | 'standard' | 'deep' | null;
    decisions?: PlanDecision[] | null;
};

export type StepProgress = { completed: number; total: number };

export type ActivityStepFrame = {
    event: 'activity.step';
    seq: number;
    step_id: string;
    label: string;
    status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
    detail?: string | null;
    tool?: string | null;
    duration_ms?: number | null;
    produced?: { component_id: string; revision: number } | null;
    progress?: StepProgress | null;
};

export type ComponentCreated = {
    event: 'component.created';
    seq: number;
    component_id: string;
    revision: number;
    type: ComponentType;
    catalog_version: string;
    min_catalog_version: string;
    // ONE's Presentation payload, opaque on the wire. It is either the
    // platform's resolved revision envelope (`{schema_version,
    // catalog_version, component_id, revision, provenance, component}`)
    // or an older harness's `{stored_intent, fact_summary}` shape. Read
    // through payload.ts's readers, which try the envelope first. See
    // that file's header comment.
    payload: Record<string, unknown>;
    fact_summary: FactSummary;
    provenance: Provenance;
    created_from?: { step_id: string; message_seq?: number | null } | null;
};

export type ComponentRevised = {
    event: 'component.revised';
    seq: number;
    component_id: string;
    revision: number;
    changed: string[];
    fact_summary: FactSummary;
    // Same payload shape as ComponentCreated's. Absent when only
    // presentation fields moved.
    payload?: Record<string, unknown> | null;
};

export type ElicitationOption = {
    id: string;
    label: string;
    description?: string | null;
    recommended?: boolean;
};

export type ElicitationRequest = {
    event: 'elicitation.request';
    seq: number;
    interrupt_id: string;
    question: string;
    input: 'single_select' | 'multi_select' | 'text';
    options?: ElicitationOption[] | null;
    allow_free_text: boolean;
    skippable: boolean;
    progress?: StepProgress | null;
    rationale?: string | null;
};

export type StudioFrame =
    | { event: 'message.delta'; seq: number; text: string }
    | { event: 'message.complete'; seq: number; text: string }
    | PlanProposed
    | {
          event: 'plan.versioned';
          seq: number;
          plan_version_id: string;
          version: number;
          supersedes: string;
          changed?: string[] | null;
      }
    | ActivityStepFrame
    | ComponentCreated
    | ComponentRevised
    | { event: 'composition.updated'; seq: number; manifest: CompositionManifest }
    | ElicitationRequest
    | { event: 'suggestions'; seq: number; items: { label: string; prompt: string }[] }
    | { event: 'error'; seq: number; error: ToolError }
    | { event: 'done'; seq: number; trace_id: string; composition?: CompositionManifest | null };
