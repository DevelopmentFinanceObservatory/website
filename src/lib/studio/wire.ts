/**
 * Studio v1 wire contract — TypeScript mirror.
 *
 * Source of truth: `services/harness/src/harness/wire.py` on the dfo-ai
 * `feat/studio-v1` branch (and `docs/frontend-interface.md`, which agrees
 * with it). Requests are discriminated on `kind`, frames on `event`. The
 * server refuses unknown fields, so requests here carry exactly the named
 * members and nothing else.
 */

import type { PayloadUnit } from './payload.ts';

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

/** The 409 `plan_revision_stale` body of POST /api/studio/interrupt: a
 *  ToolError plus `current_plan`, the `plan.proposed` frame of the plan now
 *  awaiting an answer, exactly as the stream sent it (`seq` included). Absent
 *  only for a pause stored before the harness kept cards. */
export type PlanRevisionStaleError = ToolError & { current_plan?: PlanProposed | null };

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
    attribution: Attribution;
    window?: { start: string; end: string } | null;
    // The card's unit in the shapes its payload's `unit` takes. Read
    // through payload.ts's `asUnit`.
    unit?: PayloadUnit | null;
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

/** A clicked `ApplyChoiceSuggestion`, echoed whole: the scope choice of a
 *  stored reading, the option it moves to, the conversation turn whose answer
 *  offered the chip (`turn`, from 1) and the reading it switches (`spec_id`). */
export type ApplyChoice = {
    choice_id: string;
    option_id: string;
    turn: number;
    spec_id: string;
};

export type UnitPrices = 'current' | 'constant';

/** One currency a unit offer lists. `name` is Search's noun ("US dollars"),
 *  `prices` the bases it serves (at least one). The base-year bounds are set
 *  together, and only when `constant` is among `prices`. */
export type UnitCurrency = {
    code: string;
    name: string;
    prices: UnitPrices[];
    base_year_min?: number | null;
    base_year_max?: number | null;
};

/** A chosen unit: a currency code, a price basis, and the base year when
 *  the basis is constant (and only then). */
export type UnitChoice = {
    currency: string;
    prices: UnitPrices;
    base_year?: number | null;
};

/** The units a question or a card offers: every offered currency, the codes
 *  listed before "Change to any currency" (`presets`), and the unit the
 *  chips start on. */
export type UnitOffer = {
    currencies: UnitCurrency[];
    presets: string[];
    start: UnitChoice;
};

/** On a `component.created` frame whose card reads from one convertible
 *  spec: that spec and the offer the card's unit can move within.
 *  `offer.start` is the card's current unit. */
export type UnitChange = {
    spec_id: string;
    offer: UnitOffer;
};

/** A card's unit change, with no message text: the conversation turn whose
 *  answer drew the card (`turn`, from 1), the card, the reading it shows
 *  (`spec_id`) and the unit it moves to. The harness refuses it 422
 *  `scope_choice_stale` when the card is gone or reads another spec than
 *  `spec_id`, and 422 `request_invalid` for a unit outside the offer. */
export type ApplyUnit = {
    component_id: string;
    spec_id: string;
    turn: number;
    unit: UnitChoice;
};

/** A question form a client renders: a `unit` question, a `multi_select`
 *  question. */
export type ClientFeature = 'unit_question' | 'multi_select';

export type TurnRequest = {
    kind: 'turn.request';
    schema_version: 1;
    conversation_id: string;
    /** Absent only beside `apply_choice` or `apply_unit`. The harness reads
     *  an absent message as "". */
    message?: string;
    surface?: 'studio' | 'download' | 'embed';
    component_ref?: ComponentRef | null;
    /** The Search results a "… in Studio" action hands over, one per
     *  definite part, so 1 to 6. The harness mints each before
     *  planning and plans from those datasets and their operations. */
    seed_spec?: Seed[] | null;
    auto_add?: boolean;
    /** A clicked chip. The turn applies the option to the reading the
     *  answer used, with no search. It comes without `message`, `seed_spec`
     *  or `component_ref`. A chip that no longer applies is refused 422
     *  `constraint_violation` with `pointer: "/apply_choice"`
     *  (`scope_choice_stale`, when a later turn has answered or a later
     *  reading holds the choice, or `switch_option_unavailable`) and a
     *  `detail` to show. */
    apply_choice?: ApplyChoice | null;
    /** The index of the turn the request follows (0 before the first). A
     *  request whose turn is not the conversation's latest is refused
     *  409 `edit_conflict` with `constraint_id: "turn_moved"` and begins no
     *  turn, so of two pages sending the same new question one begins it. */
    after_turn?: number | null;
    /** A card's unit change. It comes alone, as `apply_choice` does, so a
     *  request carries one of the two. */
    apply_unit?: ApplyUnit | null;
    /** The question forms this client renders. The harness asks a form only
     *  of a client that names it, and keeps the set the latest request
     *  declared. */
    client_features?: ClientFeature[];
};

export type InterruptDecision = 'approve' | 'amend' | 'reject' | 'switch' | 'answer' | 'skip';

export type InterruptResponse = {
    kind: 'interrupt.response';
    schema_version: 1;
    conversation_id: string;
    interrupt_id: string;
    decision: InterruptDecision;
    // Amendment text (amend), or the chosen option id / free text when
    // answering a legacy single-question elicitation frame. Omitted
    // otherwise.
    payload?: string;
    // One answer per question of an `elicitation.request`, keyed by the
    // frame's question ids exactly. Sent with `answer` only.
    answers?: Record<string, ElicitationAnswer>;
    // A plan's `switch`: the decision's `choice_id`, one of its options'
    // `option_id`, and the `revision` of the plan the user saw. `approve`
    // sends `plan_revision` alone. The harness refuses a stale revision with
    // 409 `plan_revision_stale` (a `PlanRevisionStaleError`) and an option it
    // did not offer, or offered as unavailable, with 422
    // `switch_option_unavailable`.
    choice_id?: string;
    option_id?: string;
    plan_revision?: string;
    // A `switch` on a unit row: the unit picked, which `option_id` names in
    // the row's id form (`USD-current`, `USD-constant-2015`).
    unit?: UnitChoice;
    // Replaces the set the conversation keeps for the questions the resumed
    // turn asks next.
    client_features?: ClientFeature[];
};

/** The ticked options of a multi-select question: at least one, no repeats. */
export type OptionsAnswer = { kind: 'options'; option_ids: string[] };

/** The unit chosen for a unit question: a `UnitChoice` with a `kind`. */
export type UnitAnswer = { kind: 'unit' } & UnitChoice;

export type ElicitationAnswer =
    | { kind: 'option'; option_id: string }
    | OptionsAnswer
    | UnitAnswer
    | { kind: 'text'; text: string }
    | { kind: 'skipped' };

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

/** POST /api/studio/cancel. `turn_index` names the turn to stop; the
 *  harness answers 200 `turn_moved` (CancelSkipped) and stops nothing when
 *  the conversation's latest turn is another. */
export type CancelRequest = {
    kind: 'turn.cancel';
    schema_version: 1;
    conversation_id: string;
    turn_index?: number;
};

/** POST /api/studio/resume: carry on the conversation's open turn
 *  `turn_index` when it is running and no stream holds it. The response is a
 *  new SSE stream continuing the turn. */
export type ResumeRequest = {
    kind: 'turn.resume';
    schema_version: 1;
    conversation_id: string;
    turn_index: number;
};

// ---------------------------------------------------------------------------
// Frames — discriminated on `event`
// ---------------------------------------------------------------------------

/** One step of a plan. `gives_answer` is true on the one step whose result
 *  answers the user's question; a harness that predates it sends none. */
export type PlanStep = {
    id: string;
    label: string;
    description?: string | null;
    gives_answer?: boolean | null;
};

/** One option of a switchable decision. A scope choice's `partial` options
 *  cover only `years` (inclusive `[first, last]` ranges); `unavailable` ones
 *  say why in `reason`, reader copy written by the harness. A planner
 *  decision's options are all `available`. */
export type PlanDecisionOption = {
    option_id: string;
    label: string;
    status: 'available' | 'partial' | 'unavailable';
    reason: string | null;
    years: [number, number][] | null;
};

export type PlanDecision = {
    id: string;
    question: string;
    chosen: string;
    reason: string;
    resolved_by: 'default' | 'user';
    alternatives?: string[] | null;
    // A decision the user can switch: its row's id, every option it offers,
    // and the one the plan counts by now. A scope choice's `choice_id` is
    // built from the requirement and the axis, so it holds across a
    // conversation's switches (an older harness built it from a spec id a
    // switch can re-pin). A planner decision's is `decision/<slot>`, with
    // option ids `option_<n>` in its options' order, and switching it
    // replans with the pick held. A decision without `choice_id` cannot be
    // switched.
    choice_id?: string | null;
    options?: PlanDecisionOption[] | null;
    active_option_id?: string | null;
    // A unit row: the units its parts convert into, starting on the one they
    // are in now. Set only beside `choice_id`, whose `options` are then whole
    // units, so a switch can name any offered unit.
    unit?: UnitOffer | null;
};

export type PlanAction = 'approve' | 'amend' | 'reject' | 'switch';

/** What a switch changed, one entry per scope decision it moved. */
export type PlanMoved = {
    choice_id: string;
    from_label: string;
    to_label: string;
    reason: string;
};

/** One piece of evidence the plan needs, in words the harness composed. */
export type PlanRequirement = {
    id: string;
    kind: string;
    sentence: string;
    decision_ids?: string[];
};

/** One computed step of the plan, in words. */
export type PlanOperation = {
    id: string;
    kind: string;
    sentence: string;
    requirement_id?: string | null;
};

/** One output the user asked for: the step ids that answer it, or why the
 *  plan does not compute it, or both when it answers in part. */
export type PlanAsk = {
    ask: string;
    answered_by?: string[];
    declined?: string | null;
    not_computed?: string | null;
};

export type PlanProposed = {
    event: 'plan.proposed';
    seq: number;
    interrupt_id: string;
    plan_version_id: string;
    version: number;
    title: string;
    steps: PlanStep[];
    // `switch` is listed only when some decision has a `choice_id` with
    // another available option.
    actions: PlanAction[];
    depth?: 'shallow' | 'standard' | 'deep' | null;
    decisions?: PlanDecision[] | null;
    // The plan's approval key, a string distinct from the integer
    // `version`. A `switch` echoes it as `plan_revision`.
    revision?: string | null;
    requirements?: PlanRequirement[] | null;
    operations?: PlanOperation[] | null;
    asks?: PlanAsk[] | null;
    // Set on the plan a switch re-offers.
    moved?: PlanMoved[] | null;
    // One sentence: what is counted, for whom, when and from which source.
    summary?: string | null;
    // Set on the plan re-offered after a switch that did not apply.
    switch_failed?: PlanSwitchFailed | null;
    // Each decision that qualifies the answer (providers differ, a derived
    // whole) as one reader sentence; absent from a harness that predates it.
    caveats?: string[] | null;
};

/** A switch that did not apply: the option the user picked, the refusal's
 *  code, a reader's sentence saying why and what still holds, and whether
 *  picking the option again could apply (false for a failure that would
 *  repeat, such as an option Search cannot serve, and absent from a harness
 *  that predates it). A switch stopped through `/cancel` re-offers the unchanged
 *  plan with `code: "switch_cancelled"` and `retryable: true`. */
export type PlanSwitchFailed = {
    choice_id: string;
    option_id: string;
    code: string;
    reason: string;
    retryable?: boolean | null;
};

export type PlanApprovedStep = { label: string; gives_answer?: boolean | null };

/** One choice of an approved plan: its id (the plan card's
 *  `PlanDecision.choice_id`, `decision/<slot>` for a planner decision), its
 *  short name, the option label it holds, and, when the user's switches
 *  moved it, the label it held on the turn's first plan. */
export type PlanApprovedChoice = {
    // Absent from a frame stored in a chat snapshot before the harness sent it.
    choice_id?: string;
    question: string;
    chosen: string;
    changed_from?: string | null;
};

/** The plan the user approved, sent once on the `approve` answer before the
 *  resumed run's first frame. */
export type PlanApproved = {
    event: 'plan.approved';
    seq: number;
    plan_version_id: string;
    version: number;
    revision?: string | null;
    title: string;
    summary?: string | null;
    steps: PlanApprovedStep[];
    choices: PlanApprovedChoice[];
    // Each decision that qualifies the answer (providers differ, a derived
    // whole) as one reader sentence; absent from a harness that predates it.
    caveats?: string[] | null;
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
    // Set only when the card reads from one convertible spec.
    unit_change?: UnitChange | null;
    // The component_id of the card this one replaces in its slot (a Change
    // unit, or an edit the harness redrew). The page keeps the old card's
    // turn, pin, place, size, title and note on the new id.
    replaces?: string | null;
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

export type ElicitationInput = 'single_select' | 'multi_select' | 'text' | 'unit';

export type ElicitationQuestion = {
    id: string;
    question: string;
    input: ElicitationInput;
    options?: ElicitationOption[] | null;
    allow_free_text?: boolean;
    // This question alone may be left to DFO (`{kind: "skipped"}`).
    skippable?: boolean;
    // Why the `recommended` option (if any) is recommended.
    rationale?: string | null;
    // The unit question's offer: set when `input` is `unit`, and only then.
    // Such a question has no `options` and takes no free text.
    unit?: UnitOffer | null;
};

export type ElicitationRequest = {
    event: 'elicitation.request';
    seq: number;
    interrupt_id: string;
    // One to three questions, answered together in one reply.
    questions: ElicitationQuestion[];
    // The whole pause may be dismissed with `decision: "skip"`.
    skippable?: boolean;
    progress?: StepProgress | null;
};

/** The single-question frame of a harness that predates `questions`.
 *  Answered with `payload`, not `answers`. */
export type LegacyElicitationRequest = {
    event: 'elicitation.request';
    seq: number;
    interrupt_id: string;
    question: string;
    input: ElicitationInput;
    options?: ElicitationOption[] | null;
    allow_free_text: boolean;
    skippable: boolean;
    progress?: StepProgress | null;
    rationale?: string | null;
};

/** A chip that sends `prompt` as the user's next message. */
export type SuggestionItem = { label: string; prompt: string };

/** A chip that moves one scope choice of the answer's readings to another
 *  option. A click sends a turn with `apply_choice` and no message. `label`
 *  is the option's label, `turn` the conversation turn whose answer offers
 *  the chip, counted from 1, and `spec_id` the reading the chip switches. */
export type ApplyChoiceSuggestion = {
    kind: 'apply_choice';
    label: string;
    choice_id: string;
    option_id: string;
    turn: number;
    spec_id: string;
};

export type StudioFrame =
    | { event: 'message.delta'; seq: number; text: string }
    | { event: 'message.complete'; seq: number; text: string }
    | PlanProposed
    | PlanApproved
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
    | LegacyElicitationRequest
    | { event: 'suggestions'; seq: number; items: (SuggestionItem | ApplyChoiceSuggestion)[] }
    | { event: 'error'; seq: number; error: ToolError }
    | {
          event: 'done';
          seq: number;
          trace_id: string;
          composition?: CompositionManifest | null;
          // Set when the user's `amend` text asked a different question. The
          // turn set its plan aside, and the page sends the text as the next
          // turn.
          new_question?: string | null;
      };

// ---------------------------------------------------------------------------
// The conversation as stored: GET /api/studio/state
// ---------------------------------------------------------------------------

/** Where a turn stands. `running` and `paused` are open; the rest are closed. */
export type TurnStatus = 'running' | 'paused' | 'done' | 'failed' | 'cancelled' | 'abandoned';

/** The conversation's latest turn. `user_message` is its prompt as a closed
 *  turn's record words it, so a page can show a turn it never held.
 *  `lease_live` says a stream holds the turn now, on some instance, and
 *  `retry_after_seconds` is then the most its lease has left. */
export type TurnState = {
    index: number;
    status: TurnStatus;
    trace_id: string;
    user_message?: string;
    // The `plan.approved` frame of each plan the open turn approved, one per
    // `revision`.
    approved?: PlanApproved[] | null;
    lease_live: boolean;
    retry_after_seconds?: number | null;
};

/** A card a closed turn made or changed, as the conversation stores it.
 *  `unit_change` and `replaces` are its `component.created` frame's: the
 *  offer its Change unit opens on, and the card whose canvas slot it took.
 *  A card an older harness stored carries neither. */
export type StoredCard = {
    component_id: string;
    type: string;
    title: string;
    revision: number;
    fact_summary?: FactSummary | null;
    unit_change?: UnitChange | null;
    replaces?: string | null;
};

/** One closed turn: the user's message as the turn recorded it, the reply it
 *  closed on (empty when none), the cards it made or changed, the code a
 *  turn that did not end cleanly closed on, and the question a turn ended by
 *  a new question set its plan aside for (see `done`'s `new_question`). */
export type ClosedTurn = {
    turn_index: number;
    user_message: string;
    reply: string;
    component_ids: string[];
    // The stored card of each id in `component_ids` the conversation holds a
    // card for, in the same order. Absent from an older harness.
    cards?: StoredCard[];
    // The `plan.approved` frame of each plan the turn approved, one per
    // `revision`.
    approved?: PlanApproved[] | null;
    error?: string | null;
    new_question?: string | null;
};

/** The open pause of a paused turn, and the frames it was sent as, its
 *  `plan.proposed` or `elicitation.request` last. */
export type PendingPause = {
    interrupt_id: string;
    kind: 'plan' | 'elicitation';
    frames: StudioFrame[];
};

/** GET /api/studio/state: `turn` is absent before the first turn,
 *  `closed_since` holds the closed turns after the request's `since` (oldest
 *  first, at most 3), `closed_total` how many closed turns the conversation
 *  holds (the index of the last), `pause` the open pause of a paused turn,
 *  and `manifest` the canvas. */
export type ConversationRead = {
    conversation_id: string;
    turn?: TurnState | null;
    closed_since: ClosedTurn[];
    closed_total?: number;
    pause?: PendingPause | null;
    manifest?: CompositionManifest | null;
};
