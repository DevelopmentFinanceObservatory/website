/* eslint-disable @typescript-eslint/no-explicit-any -- turns unvalidated response bodies and stream events into the page's shapes, so bodies and open slot options are `any` */
/**
 * Browser-side search client for the /prototype gut-check page.
 *
 * Resolve: POST + `Accept: text/event-stream` parsed off a ReadableStream
 * (EventSource can't POST).
 *
 * Base URL: same-origin '/api/search/*' everywhere — nginx routes it to :8083 in
 * the container, and next.config.mjs rewrites it to the local engine in dev,
 * so no CORS setup is needed. Override NEXT_PUBLIC_SEARCH_API_BASE only to hit a
 * remote engine origin directly.
 *
 * The SSE event types below are hand-written, since the OpenAPI document does
 * not describe the stream. The response, slot key and Datasets door types come
 * from `@developmentfinance/client/wire`, generated from that document, through
 * `lib/search/types.ts` or directly.
 */

import type {
    ArtifactEntryModel,
    CoverageDimension,
    EnrichmentOptionModel,
    FormatOptionModel,
    Manifest,
    MembersEnvelope,
    MintRequest,
    OptionsEnvelope,
    OptionsRequest,
    OutputOptionsModel,
    ProblemDetails,
    ProblemIssue,
    ServedMember,
    SlotKey,
} from '@developmentfinance/client/wire';

import { datasetsFetch } from './datasetsFetch.ts';
import { pollOperation } from './operationPoll.ts';
import type { OperationProgress } from './operationPoll';
import { parsePlaceCatalogue, type PlaceCatalogue } from './catalogue.ts';
import {
    outcomeFromDocument,
    type VersionLink,
    type VersionLinkDocument,
    type VersionLinkOutcome,
} from './versionLink.ts';
import {
    type Assumption,
    type DatasetResubmitEntry,
    type EntityGroup,
    type EntityRoleKey,
    type Frame,
    isKnownPart,
    type LateDepartures,
    type Operation,
    type Part,
    type PlaceOptionsScope,
    type Resolution,
    type ResolveStatus,
    type RoleAxis,
    type SentenceToken,
    type SpecIdentity,
    type SpecObservations,
    type Warning,
} from './types.ts';

export const SEARCH_BASE = process.env.NEXT_PUBLIC_SEARCH_API_BASE ?? '';

// Deliberately shallow types: the gut-check renders whatever the engine sends,
// so only the fields the page dereferences are typed; the rest stays `any`.
export type { SlotKey };

// The stream's sentence plans carry the same token shape as the response's.
export type { SentenceToken };

export type SlotOptionsData = {
    key: SlotKey;
    options: any[];
    truncated: boolean;
    source?: 'observed' | 'seed';
};

export type SearchEvent =
    | {
          kind: 'interpretation';
          variables: string[];
          entities: string[];
          dates: any[];
          expected_results: number;
      }
    | {
          /** One part's completed frame (dfo-apis events.py FrameEvent), after
           *  recall and before the part's `shape` event. A part that ends before
           *  its shapes are read, a part answered from the response cache and the
           *  dataset_resubmit door send none. */
          kind: 'frame';
          variable_index: number;
          frame: Frame;
          /** the distinct measurementDenominator dcids the part's eligible
           *  shapes carry, sorted; empty when none divides */
          denominators_on_offer: string[];
      }
    | {
          kind: 'shape';
          /** always true where sent: the shape is the top admissible reading
           *  while bind runs, and the part's `sentence` event names what it
           *  answers with. A server that predates the field omits it. */
          provisional?: true;
          variable_index: number;
          shape_id: string;
          label: string;
          slot_keys: SlotKey[];
          sentence_plan: SentenceToken[];
          slot_options: SlotOptionsData[];
          refine_supported: boolean;
      }
    | {
          /** One part's answered sentence, sent once per part just before the
           *  `response` event of a resolution that ran. It names the Spec the
           *  part answers with: the definite answer, the first candidate of a
           *  candidates part, or the flagged match of a refusal. A response
           *  served from the response cache sends none, and neither does a part
           *  that flags nothing. */
          kind: 'sentence';
          variable_index: number;
          spec_id: string;
          sentence_plan: SentenceToken[];
          slots: any[];
      }
    | {
          kind: 'step';
          variable_index: number | null;
          step: string;
          ran: boolean;
          ms?: number | null;
      }
    | { kind: 'response'; response: any }
    | { kind: 'slot_options'; spec_id: string; key: SlotKey; options: any[]; truncated: boolean }
    | {
          /** Coverage-derived facet values (unit / measurementMethod /
           *  provenance), streamed AFTER the response event — the response's
           *  own facet_options array arrives empty on SSE. */
          kind: 'facet_options';
          spec_id: string;
          axis: string;
          options: any[];
          truncated?: boolean;
      }
    | {
          kind: 'entity_options';
          spec_id: string;
          // Open directional axes have no bound entity, but still stream
          // their candidate list.
          entity_ref?: string | null;
          role: RoleAxis;
          options: any[];
          truncated: boolean;
      }
    | {
          /** Prefetched observationAbout place candidates (dfo-apis
           *  events.py's PlaceOptionsEvent): up to two per spec, one per
           *  scope, so PlaceEditor can open with zero network round trip.
           *  Unlike slot_options/entity_options, `options` here is already
           *  reshaped to the flat EntityOption client shape (see
           *  placeOptionValues) — the SSE parse step below does that
           *  conversion the moment the frame lands, the same way it
           *  normalizes a `response` event's envelope. */
          kind: 'place_options';
          spec_id: string;
          role: 'observationAbout';
          scope: PlaceOptionsScope;
          anchor_ref: string;
          options: EntityOption[];
          truncated: boolean;
      }
    | {
          kind: 'observations';
          spec_id: string;
          /** SpecObservations (see lib/search/types.ts): same shape the buffered
           *  path embeds at Spec.observations, deferred to a trailing event on SSE
           *  so the response isn't blocked on the observation fetch. */
          observations: any;
      }
    | {
          kind: 'done';
          elapsed_ms: number;
          timed_out: boolean;
          /** this request's trace_id, shared with diagnostics and every
           *  problem-details body */
          trace_id: string;
          telemetry: { llm_usage?: Record<string, number> | null };
          /** Late-arriving warnings, some scoped to a spec_id the same way
           *  the observations/slot_options/facet_options trailing events
           *  are (e.g. a deadline-driven observations omission reported
           *  after `response` already went out). See mergeLateWarnings. */
          warnings: Warning[];
          /** Departures that depend on the observations read, one entry per
           *  part (part_index, spec_id). Read only through lateDepartures. */
          late_departures?: LateDepartures[];
      }
    | {
          kind: 'error';
          detail: string;
          code?: string | null;
          /** RFC 9457 pointer into the request the refusal names, e.g.
           *  `/input/entries/1/identity/slots/0` on a `dataset_resubmit`
           *  refusal. A top-level field on the refusal body alongside
           *  type/title/status/detail/code/trace_id (verified live,
           *  2026-09-08). useSearchRun.ts's edit lane keys `editError` to
           *  the entry index a `/input/entries/{i}/...` pointer names. */
          pointer?: string | null;
          /** The problem-details `status` and `trace_id`: an engine error
           *  frame carries both, and a non-2xx response forwards its own. */
          status?: number | null;
          trace_id?: string | null;
      };

/** Mirrors SlotKey.as_ref(): the "axis:property_dcid" join key shared by
 * SentenceToken.binding_ref, Slot.key, and SlotOptions.key. */
export function keyRef(key: SlotKey): string {
    return `${key.axis}:${key.property?.ref ?? ''}`;
}

export type SearchInput =
    | { kind: 'raw_text'; query: string }
    | {
          kind: 'dataset_resubmit';
          /** 1 to 6, in response part order; see types.ts's DatasetResubmitEntry */
          entries: DatasetResubmitEntry[];
          /** echo-only; the engine must not re-parse it */
          raw_query?: string;
      };

export function buildRequest(input: SearchInput, includeCoverage: boolean) {
    return {
        // Contract v1 (integer version tag; the string "1.0" was the pre-release
        // form and is refused with unsupported_schema_version).
        schema_version: 1,
        input,
        // include_observations: without it the engine skips the materialise
        // pass and Spec.observations / the trailing `observations` SSE event
        // never arrive. Every buildRequest caller drives the real result
        // view (which always needs observations), so — unlike coverage —
        // this isn't gated by a caller-supplied flag.
        response_options: {
            include_option_coverage: includeCoverage,
            include_observations: true,
        },
    };
}

// ---------------------------------------------------------------------------
// Wire → view adapter (contract v1)
// ---------------------------------------------------------------------------
// The engine carries the payload in `parts[]`, one entry per variable asked,
// each part exactly one of `spec` / `candidates` / `no_data` / `unsupported`.
// Each wire Spec inside a part arrives split in two — `definition` (the
// hashed identity: shape/slots/entities/window) and `resolved` (everything
// shown: sentence, slots, options, coverage, observations, trace). The page
// (and its editors) are built against the flat Spec shape, so
// normalizeResponse below flattens every nested WireSpec right where the
// envelope enters: `resolved` is spread flat onto the Spec.
// .no_data.gate needs no flattening. It's already a scalar.

type WireSpec = { spec_id: string; definition?: any; resolved?: any } & Record<string, any>;

/** Why `validateResolvedStatVars` rejected a value, or that it passed. A
 *  typed result rather than a bare boolean, so the one caller (below) can
 *  report what specifically didn't match instead of re-deriving it from the
 *  raw value. */
type StatVarsValidation = { valid: true } | { valid: false; reason: string };

/** Validates that `value` carries the wire's ResolvedStatVars object shape
 *  ({member_count, member_count_exact, served_count, data_date_range}) — see types.ts's
 *  ResolvedStatVars. A value that doesn't match it is a contract break, not
 *  a variant to tolerate (see the console.error below). Every user-visible
 *  count reads these fields, so a missing or mistyped one fails here rather
 *  than rendering a wrong count. */
function validateResolvedStatVars(value: unknown): StatVarsValidation {
    if (!value || typeof value !== 'object') {
        return { valid: false, reason: 'not an object' };
    }
    const v = value as Record<string, unknown>;
    if (typeof v.member_count !== 'number') {
        return { valid: false, reason: 'member_count is not a number' };
    }
    if (typeof v.member_count_exact !== 'boolean') {
        return { valid: false, reason: 'member_count_exact is not a boolean' };
    }
    if (v.served_count != null && typeof v.served_count !== 'number') {
        return { valid: false, reason: 'served_count is not a number' };
    }
    if (v.data_date_range != null && typeof v.data_date_range !== 'object') {
        return { valid: false, reason: 'data_date_range is not an object' };
    }
    return { valid: true };
}

/** Flatten one wire Spec to the page's Spec. */
export function flattenSpec(spec: WireSpec | null | undefined): any {
    if (!spec) return spec ?? null;

    if (!spec.resolved) {
        // Every deployment sends the definition/resolved split (contract
        // v1), and this deployment has one server, so it always sends one
        // shape. A spec missing `resolved` is flagged the same way an
        // unreadable `stat_vars` is. Passing it through untouched would skip
        // the stat_vars check below and render a blank card instead of a
        // flagged one.
        console.error(
            `[searchClient] spec ${spec.spec_id}: missing the wire's definition/resolved ` +
                'split (contract v1 requires both) — got',
            spec,
        );
        return { ...spec, stat_vars_unreadable: true };
    }

    const { spec_id, definition, resolved, ...rest } = spec;
    const flat = {
        ...rest,
        ...resolved,
        spec_id,
        // The wire's `trace` is the page's `resolution`.
        resolution: resolved.trace ?? resolved.resolution ?? {},
        // The hashed identity, echoed verbatim on a dataset_resubmit entry.
        identity: definition?.identity ?? null,
        // The canonical definition — the Datasets API mints unregistered specs
        // from it (the "sidecar").
        definition: definition ?? null,
    };

    // Contract boundary check, deliberately not a coercion. A `stat_vars`
    // that isn't the {member_count, member_count_exact, served_count, data_date_range} object
    // shape means the
    // wire changed. Silently tolerating a second shape here would repeat the
    // failure that hid the September break (spec.stat_vars?.[0] swallowing
    // an object into `undefined`), and no deployment sends anything else to
    // exercise a coercion branch against. Flag it loudly, so
    // SearchCards/SearchSentence can show a real failure state instead of an
    // empty label.
    if ('stat_vars' in resolved) {
        const validation = validateResolvedStatVars(resolved.stat_vars);

        if (!validation.valid) {
            console.error(
                `[searchClient] spec ${spec_id}: stat_vars is not the wire's ` +
                    `{member_count, member_count_exact, served_count, data_date_range} shape (ResolvedStatVars) — ${validation.reason} — got`,
                resolved.stat_vars,
            );
            flat.stat_vars_unreadable = true;
        }
    }

    return flat;
}

/** The wire Spec a page Spec was flattened from: `flattenSpec` undone for a
 * spec that carried the definition/resolved split. `identity` and
 * `resolution` are the two members `flattenSpec` adds; every other member
 * came from `resolved`, `trace` included. */
export function unflattenSpec(spec: any): {
    spec_id: string;
    definition: any;
    resolved: Record<string, any>;
} {
    const { spec_id, definition, ...resolved } = spec;

    delete resolved.identity;
    delete resolved.resolution;

    return { spec_id, definition, resolved };
}

/** A spec's own rendered sentence + plan, when the engine computed one.
 * Null when neither is set — a spec with no sentence data at all. */
export const sentenceOf = (
    spec: any,
): { rendered_sentence: string; sentence_plan: SentenceToken[] } | null =>
    spec?.rendered_sentence || spec?.sentence_plan
        ? {
              rendered_sentence: spec.rendered_sentence ?? '',
              sentence_plan: spec.sentence_plan ?? [],
          }
        : null;

/**
 * The parts' shared status, or "mixed" when two or more parts disagree. The
 * client-side mirror of Resolution.status's own computed-field
 * reduction (the shared value when all parts agree, else mixed). Used by
 * `restorePlaceholderParts` to recompute the envelope's own `status` after
 * swapping a restated placeholder part back for the client's richer copy.
 */
export function envelopeStatus(parts: Part[]): ResolveStatus | 'unsupported' | 'mixed' {
    const first = parts[0]?.status;

    return parts.every((part) => part.status === first)
        ? (first as ResolveStatus | 'unsupported')
        : 'mixed';
}

/**
 * After a `dataset_resubmit` response lands, restore the client's own
 * previously-held copy of any part the engine echoed back as a
 * `part_restated` stub: a `placeholder` entry's response, which carries no
 * real spec data (the engine deliberately doesn't re-resolve it). Every
 * other part rides through the fresh response untouched, including the
 * envelope's own recomposed `rendered_sentence`/`sentence_plan`.
 *
 * Keyed by index, not spec_id: a placeholder part carries no spec at all to
 * key on, and `variable_text` isn't unique (two parts can read alike after a
 * hand-edit). Skipped entirely (the fresh envelope rides through whole) when
 * `response.parts.length` doesn't match the posted `entries.length`, since
 * index alignment means nothing once the count itself has drifted. Pure.
 * Never mutates either argument.
 */
export function restorePlaceholderParts(
    response: Resolution,
    priorParts: (Part | null)[],
    entryCount: number,
): Resolution {
    if (response.parts.length !== entryCount) return response;

    const parts = response.parts.map((part, i) => {
        const restated = part.warnings?.some((warning) => warning.code === 'part_restated');
        const prior = priorParts[i];

        return restated && prior ? prior : part;
    });

    return { ...response, parts, status: envelopeStatus(parts) };
}

/** What identifies a warning as "the same one" for `mergeLateWarnings`'
 *  dedup: code + message + spec_id. Two warnings can share a code with
 *  different messages (both real, both worth rendering), so the identity
 *  includes the message alongside the code. The separator is the escape
 *  `\u0000`, a literal control byte no field's own text can contain, so a
 *  code/message boundary can never be confused with a space inside either
 *  field. */
const warningIdentity = (warning: Warning): string =>
    `${warning.code}\u0000${warning.message}\u0000${warning.spec_id ?? ''}`;

/**
 * Folds a `done` event's late-arriving warnings into the response the
 * `response` event already landed, so a warning the engine reports after
 * streaming its answer still reaches `part.warnings`, the same place a
 * warning riding on `response` would. Keyed by spec_id, the same join every
 * trailing per-spec event (observations/slot_options/facet_options) uses.
 *
 * A warning naming a spec_id no definite part carries is dropped, since the
 * part it was scoped to isn't rendered (a candidates/no_data outcome, for
 * example). A warning with no spec_id at all is dropped too (see
 * Warning.spec_id in types.ts). A late warning identical (code + message +
 * spec_id) to one the part already carries, or to another late warning in
 * the same batch, is dropped as well. The engine can report the same
 * warning once as a part-level warning on `response` and again in `done`'s
 * warnings, and appending it unconditionally would duplicate it in the
 * rendered sentence and in a React key.
 *
 * Pure. Never mutates `response`, and returns it unchanged when nothing
 * matches.
 */
export function mergeLateWarnings(response: Resolution, warnings: Warning[]): Resolution {
    const bySpec = new Map<string, Warning[]>();

    for (const warning of warnings) {
        if (!warning?.spec_id) continue;
        const existing = bySpec.get(warning.spec_id);

        if (existing) existing.push(warning);
        else bySpec.set(warning.spec_id, [warning]);
    }
    if (bySpec.size === 0) return response;

    const parts = response.parts.map((part) => {
        const late =
            isKnownPart(part) && part.status === 'definite' ? bySpec.get(part.spec.spec_id) : null;

        if (!late?.length) return part;

        // Dedupes against part.warnings and within `late` itself, so two
        // structurally identical warnings arriving in the same batch still
        // render exactly once. `existing` is bound once here so the two
        // reads below stay consistent. The wire types part.warnings as
        // required, but a definite part can reach this point without the key.
        const existing = part.warnings ?? [];
        const seen = new Set(existing.map(warningIdentity));
        const fresh: Warning[] = [];

        for (const warning of late) {
            const identity = warningIdentity(warning);

            if (seen.has(identity)) continue;
            seen.add(identity);
            fresh.push(warning);
        }

        return fresh.length ? { ...part, warnings: [...existing, ...fresh] } : part;
    });

    return { ...response, parts };
}

type DoneEvent = Extract<SearchEvent, { kind: 'done' }>;

/** The late departures a `done` event carries, one entry per part. The one reader
 *  of the event's field, so a rename on the wire changes this function
 *  alone. */
export function lateDepartures(event: Pick<DoneEvent, 'late_departures'>): LateDepartures[] {
    return event.late_departures ?? [];
}

/**
 * Folds late departures into the response the `response` event already
 * landed. Each entry carries one part's complete departure list after the
 * observations read, and replaces the departures of the part at its
 * `part_index` only: a folded part and the part it folded into share a
 * spec_id but receive different lists. An entry is dropped when no definite
 * part sits at its index or that part's spec carries another spec_id. Pure;
 * returns `response` itself when nothing changes.
 */
export function applyLateDepartures(response: Resolution, late: LateDepartures[]): Resolution {
    if (late.length === 0) return response;

    const byPart = new Map(late.map((entry) => [entry.part_index, entry]));
    let changed = false;

    const parts = response.parts.map((part, index) => {
        const entry = byPart.get(index);

        if (
            !entry ||
            !isKnownPart(part) ||
            part.status !== 'definite' ||
            part.spec.spec_id !== entry.spec_id
        ) {
            return part;
        }
        changed = true;

        return { ...part, departures: entry.departures };
    });

    return changed ? { ...response, parts } : response;
}

/** The response after the stream's `done` event: its late warnings
 *  (mergeLateWarnings) and late departures (applyLateDepartures) merged
 *  into the parts they name. */
export function applyDoneEvent(
    response: Resolution,
    event: Pick<DoneEvent, 'warnings' | 'late_departures'>,
): Resolution {
    return applyLateDepartures(
        mergeLateWarnings(response, event.warnings ?? []),
        lateDepartures(event),
    );
}

/** Flatten every WireSpec nested inside one wire Part (`spec`, or
 * `candidates.specs`, or `no_data.nearest_real`/`no_data.flagged_match`/
 * `no_data.alternate_match`) into the page's flat Spec shape; every other
 * field rides through untouched. */
function flattenPart(part: any): any {
    if (!part || typeof part !== 'object') return part;
    // The page Part's restatement, operations, warnings and departures are
    // required, on a part of any status; the wire's are optional. Default
    // them here so a normalized Part never carries `undefined` for one.
    const defaults = {
        restatement: part.restatement ?? null,
        operations: part.operations ?? [],
        warnings: part.warnings ?? [],
        departures: part.departures ?? [],
    };

    if (part.spec) {
        return { ...part, ...defaults, spec: flattenSpec(part.spec) };
    }
    if (part.candidates) {
        return {
            ...part,
            ...defaults,
            candidates: {
                ...part.candidates,
                specs: (part.candidates.specs ?? []).map(flattenSpec),
            },
        };
    }
    if (part.no_data) {
        return {
            ...part,
            ...defaults,
            no_data: {
                ...part.no_data,
                nearest_real: Array.isArray(part.no_data.nearest_real)
                    ? part.no_data.nearest_real.map(flattenSpec)
                    : part.no_data.nearest_real,
                flagged_match: flattenSpec(part.no_data.flagged_match),
                alternate_match: flattenSpec(part.no_data.alternate_match),
            },
        };
    }
    return { ...part, ...defaults };
}

/**
 * Normalise a v1 ResolveResponse body. A resolution has every WireSpec
 * nested in `parts[]` flattened into the page's flat Spec shape; the
 * envelope and part shape (status, warnings, timing,
 * rendered_sentence/sentence_plan) is otherwise the wire shape verbatim, and
 * nothing is lifted to the envelope level. The envelope's own
 * `rendered_sentence`/`sentence_plan` pair (the composed sentence over every
 * part) rides through untouched via the `...body` spread below, same as
 * every other envelope-level field. A catalogue or declined answer carries
 * no parts and rides through whole.
 *
 * Throws on any other body: a missing or unknown `kind`, or a resolution
 * with no `parts` list. The page renders by `kind`, so a body it cannot
 * place is an error, never a guess. resolveStream turns the throw into the
 * run's `error` event.
 */
export function normalizeResponse(body: any): any {
    if (body?.kind === 'resolution' && Array.isArray(body.parts)) {
        return { ...body, parts: body.parts.map(flattenPart) };
    }
    if (body?.kind === 'catalogue' || body?.kind === 'declined') return body;
    throw new Error(
        body?.kind === 'resolution'
            ? 'The search API answered with a resolution that has no parts.'
            : `The search API answered with ${body?.kind == null ? 'no kind' : `kind "${body.kind}"`}, which this site does not read.`,
    );
}

/**
 * Incremental SSE frame parser. Feed it decoded text chunks (any split points);
 * it calls onFrame(eventName, data) per complete frame. Comment lines (": ping"
 * heartbeats) are skipped; multiple data: lines join with '\n' per the SSE spec.
 */
export function makeSseParser(onFrame: (event: string, data: string) => void) {
    let buf = '';
    return (chunk: string) => {
        buf += chunk;
        let idx: number;
        // Frames end at a blank line. The engine emits \n\n; tolerate \r\n\r\n too.
        while ((idx = buf.search(/\n\n|\r\n\r\n/)) !== -1) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + (buf[idx] === '\r' ? 4 : 2));
            let event = 'message';
            const data: string[] = [];
            for (const line of raw.split(/\r?\n/)) {
                if (!line || line.startsWith(':')) continue;
                const colon = line.indexOf(':');
                const field = colon === -1 ? line : line.slice(0, colon);
                let value = colon === -1 ? '' : line.slice(colon + 1);
                if (value.startsWith(' ')) value = value.slice(1);
                if (field === 'event') event = value;
                else if (field === 'data') data.push(value);
            }
            if (data.length) onFrame(event, data.join('\n'));
        }
    };
}

/** Error `detail` as a display string. FastAPI validation failures send
 * detail as a list of {loc,msg,type} objects, not a string. */
function detailText(body: any, status: number): string {
    const d = body?.detail;
    if (typeof d === 'string') return d;
    if (d != null) return JSON.stringify(d);
    return `Search API ${status}`;
}

/** One `issues[]` entry on a refusal: what the engine objected to, and —
 *  where it can — what would have been valid instead. */
export type ApiIssue = ProblemIssue;

export type ApiError = Error & {
    /** the response's own HTTP status, so a console log can name it without
     *  re-deriving it from the message text. */
    status?: number;
    code?: ProblemDetails['code'] | null;
    pointer?: ProblemDetails['pointer'];
    /** `over_ceiling` only: which ceiling was hit, and the two numbers that
     *  let the message say so plainly instead of in prose. `candidate_window`
     *  counts the measures a broad family matched, so its `count` is the
     *  candidates the read listed rather than the result's size. */
    ceilingKind?: ProblemDetails['ceiling_kind'];
    count?: ProblemDetails['count'];
    cap?: ProblemDetails['cap'];
    issues?: ProblemDetails['issues'];
};

/** A refusal body's own `code` and RFC 9457 `pointer`, top-level fields
 *  alongside type/title/status/detail/trace_id (verified live, 2026-09-08),
 *  attached to the Error every non-2xx JSON response throws or emits as, the
 *  same way `detailText` turns `detail` into the message. */
function apiError(body: any, status: number): ApiError {
    const err = new Error(detailText(body, status)) as ApiError;
    err.status = status;
    err.code = body?.code ?? null;
    err.pointer = body?.pointer ?? null;
    err.ceilingKind = body?.ceiling_kind ?? null;
    err.count = typeof body?.count === 'number' ? body.count : null;
    err.cap = typeof body?.cap === 'number' ? body.cap : null;
    err.issues = Array.isArray(body?.issues) ? (body.issues as ApiIssue[]) : null;
    return err;
}

// ---------------------------------------------------------------------------
// The `options` door (POST /api/search/options) — place_options' successor,
// verified live 2026-08-18. Enumerates the entities that could take a role in
// THIS spec and actually have data for its stat vars: `scope: 'peers'` (other
// countries), `scope: 'children'` (admin level 1 under the current place).
// Request: the spec's hashed identity + `for`. The door derives the identity's
// own StatVar population server-side (dfo-apis #877), posting no
// resolved-stat-var seed. Response: `options.items[].value` = { ref: {ref, label},
// value_kind: 'entity' } and `options.truncated`.
// ---------------------------------------------------------------------------

export type EntityOptionsRequest = {
    identity: SpecIdentity;
    // The wire's full role vocabulary (EntityRoleKey): a directional
    // entity_options call names 'origin'/'destination' explicitly; an
    // omitted role takes the door's own 'observationAbout' default below.
    role?: EntityRoleKey;
    scope: 'peers' | 'children';
};

export type EntityOption = { dcid: string; label: string; coverage?: any };

/** `options.items` from a POST /api/search/options body, or the wire
 *  SlotOption[] a `place_options` SSE event carries (same per-item shape —
 *  `{value: {ref: {ref, label}}, coverage}`, `place_options` just skips the
 *  `items` wrapper) — reshaped to the flat client `EntityOption` PlaceEditor
 *  renders. An item missing a dcid or label is dropped rather than shown
 *  half-filled. */
export function placeOptionValues(items: any[]): EntityOption[] {
    return (items ?? [])
        .filter((item) => item?.value?.ref?.ref && item?.value?.ref?.label)
        .map((item) => ({
            dcid: item.value.ref.ref,
            label: item.value.ref.label,
            coverage: item.coverage ?? undefined,
        }));
}

export async function entityOptions(
    req: EntityOptionsRequest,
    signal?: AbortSignal,
): Promise<{ options: EntityOption[]; truncated: boolean }> {
    const res = await fetch(`${SEARCH_BASE}/api/search/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            schema_version: 1,
            identity: req.identity,
            for: { role: req.role ?? 'observationAbout', scope: req.scope },
            // Per-option data footprint (observation counts / years) for the rows.
            include_coverage: true,
        } satisfies OptionsRequest),
        signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        throw apiError(body, res.status);
    }
    return {
        options: placeOptionValues(body?.options?.items ?? []),
        truncated: !!body?.options?.truncated,
    };
}

// ---------------------------------------------------------------------------
// Datasets API (POST /api/datasets, own contract, verified 2026-08-18): mints a
// downloadable dataset for a spec — csv / xlsx / parquet, optionally bundled
// with datapackage.json + CITATION.cff + README — and answers with a manifest
// whose `artifacts[]` carry a root-relative stable link (`url`) that never
// expires. A GET on it (`artifactHref`) answers 302 to a storage URL signed
// for 5 minutes, so the bytes never pass through our server. A spec the
// registry has not seen yet is minted from its canonical `definition` (the
// sidecar).
// ---------------------------------------------------------------------------

export type DatasetFormat = 'csv' | 'xlsx' | 'parquet';

// The three formats the Datasets API and a Studio card's export route render,
// in the order the download sheet offers them. Which of them a given dataset
// can produce comes from its own options document (an xlsx over Excel's row
// limit reports itself unavailable), so this list sets only the label and the
// order.
export const DATASET_FORMATS: readonly { id: DatasetFormat; label: string }[] = [
    { id: 'csv', label: 'CSV' },
    { id: 'xlsx', label: 'Excel' },
    { id: 'parquet', label: 'Parquet' },
];

export type DatasetArtifact = ArtifactEntryModel;

/** The address a browser or fetch uses for an artifact's `url`, which is
 *  root-relative (`/api/datasets/{spec}/{cv}/files/{digest}`). */
export const artifactHref = (url: string, base: string = SEARCH_BASE): string => `${base}${url}`;

// A request whose estimate exceeds the Datasets API's sync budget answers
// `202` with an operation envelope instead of a manifest (dormant until
// `operation_envelope_active` flips true on the capability document, but
// this door already answers it, so `mintDataset` handles it unconditionally
// rather than gating on that flag). `mintDataset` polls
// `/api/datasets/operations/{operation_id}` — the site's own same-origin
// proxy (src/app/api/datasets/[...path]/route.ts) — through to the done
// manifest, so every caller keeps seeing the same `{ artifacts, manifest }`
// shape a synchronous mint already returns.
export async function mintDataset(
    req: {
        spec_id: string;
        definition?: any;
        format: DatasetFormat;
        bundle?: boolean;
        /** Enrichment tokens (`{column}_{field}`, e.g. `observationAbout_iso3`)
         *  to add to the dataset's default columns. A token-only list keeps
         *  every default column. */
        columns?: string[];
    },
    signal?: AbortSignal,
    /** Rows written against the estimate, read off each poll while the mint
     *  runs as a background operation (202 only — never called on a
     *  synchronous 200). */
    onProgress?: (progress: OperationProgress) => void,
): Promise<{ artifacts: DatasetArtifact[]; manifest: Manifest | null }> {
    const res = await datasetsFetch(`${SEARCH_BASE}/api/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            schema_version: 1,
            input: {
                kind: 'spec_id',
                spec_id: req.spec_id,
                definition: req.definition ?? null,
            },
            options: {
                format: req.format,
                bundle: req.bundle ?? true,
                ...(req.columns?.length ? { columns: req.columns } : {}),
            },
        } satisfies MintRequest),
        signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        throw apiError(body, res.status);
    }
    if (res.status === 202) {
        const manifest = await pollOperation(body.operation, { onProgress, signal });

        return { artifacts: manifest?.artifacts ?? [], manifest };
    }
    const manifest: Manifest | null = body;

    return { artifacts: manifest?.artifacts ?? [], manifest };
}

/** The Datasets API's capability document (GET /api/datasets/capabilities):
 *  deployment-mutable switches — which formats are live, and which
 *  enrichment columns (ISO codes etc.) the reshape step can populate. */
export async function fetchDatasetCapabilities(signal?: AbortSignal): Promise<any | null> {
    try {
        const res = await datasetsFetch(`${SEARCH_BASE}/api/datasets/capabilities`, { signal });

        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/** One country's search catalogue (GET /api/search/catalogue?place=): its
 *  counts, and the examples with data there, filled with it. Null when the
 *  API counts no such country or the read fails. A place-scoped starting
 *  point then shows its scope line without counts; a declined answer offers
 *  the whole catalogue's examples. */
export async function fetchSearchCatalogue(
    place: string,
    signal?: AbortSignal,
): Promise<PlaceCatalogue | null> {
    try {
        const res = await fetch(
            `${SEARCH_BASE}/api/search/catalogue?${new URLSearchParams({ place })}`,
            { signal },
        );

        return res.ok ? parsePlaceCatalogue(await res.json()) : null;
    } catch {
        return null;
    }
}

/** One output option's state. Only `available` may be offered; `partial` is offerable but
 *  incomplete (see an enrichment's `coverage` and `missing`); anything else is off. */
export type DatasetOptionState = FormatOptionModel['state'];

export type DatasetEnrichment = EnrichmentOptionModel;

export type DatasetOutputOptions = OutputOptionsModel;

/** One coverage dimension of a dataset: a frame column (or `years`) and its distinct count.
 *  `axis` names the flow direction a role column serves (financingProvider → origin). */
export type DatasetCoverageDimension = CoverageDimension;

/** The parts of an options document, or of a mint's manifest, that the download sheet reads:
 *  the output options and the coverage whose dimensions say which role each column serves. */
export type DatasetOptionsDocument = Pick<OptionsEnvelope, 'output_options' | 'coverage'>;

/**
 * What one dataset says it can do (`/api/datasets/{spec_id}/options`):
 * per-definition, unlike the deployment-wide capability document above.
 * Formats carry a live state and enrichments carry their coverage. With a
 * `definition` the door is POSTed, registers the definition, and answers for
 * a spec no one has minted yet. Without one it is a GET, which answers for a
 * registered spec, such as the frame behind a Studio card. It materialises
 * the frame to answer, so the panel asks only when the download options open
 * or a remembered extra column must be checked against the extras the answer
 * offers. Null on any refusal or failure.
 */
export async function fetchDatasetOptions(
    req: { spec_id: string; definition?: any },
    signal?: AbortSignal,
): Promise<DatasetOptionsDocument | null> {
    const url = `${SEARCH_BASE}/api/datasets/${encodeURIComponent(req.spec_id)}/options`;

    try {
        const res = req.definition
            ? await datasetsFetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ schema_version: 1, definition: req.definition }),
                  signal,
              })
            : await datasetsFetch(url, { signal });

        if (!res.ok) {
            return null;
        }

        const body = (await res.json()) as DatasetOptionsDocument | null;

        return body?.output_options ? body : null;
    } catch {
        return null;
    }
}

/** One StatVar a definition serves, as the members door lists it: `ref` is `dcid:`-prefixed,
 *  `label` null when the graph holds none, and `constraints` maps each constraint property to its
 *  value, null when unbound. */
export type DefinitionMember = ServedMember;

/** What the members door (`POST /api/datasets/{spec_id}/members`) answers: every StatVar the
 *  definition serves, sorted by `ref`, the served count, and the size and digest of the family the
 *  members came from, each null when the door cannot state it. */
export type DefinitionMembers = MembersEnvelope;

/**
 * The StatVars one definition serves, resolved by the Datasets members door
 * as a mint would resolve them but without materialising a frame. The
 * `definition` sidecar lets it answer for a spec no one has minted yet.
 * Throws the door's refusal as an `ApiError`, so a caller can tell a
 * definition with no served members from a failed read.
 */
export async function fetchDefinitionMembers(
    req: { spec_id: string; definition?: any },
    signal?: AbortSignal,
): Promise<DefinitionMembers> {
    const res = await datasetsFetch(
        `${SEARCH_BASE}/api/datasets/${encodeURIComponent(req.spec_id)}/members`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                schema_version: 1,
                ...(req.definition ? { definition: req.definition } : {}),
            }),
            signal,
        },
    );
    const body = await res.json().catch(() => null);

    if (!res.ok) {
        throw apiError(body, res.status);
    }
    return {
        ...body,
        members: Array.isArray(body?.members) ? body.members : [],
    } as DefinitionMembers;
}

/** Default inactivity ceiling between reader.read() completions (see
 *  resolveStream) — the engine sends ': ping' heartbeat comments, so a healthy
 *  stream never goes this long between chunks. Exported so tests can assert
 *  the wired-through default without hardcoding the number twice. */
export const DEFAULT_STALL_TIMEOUT_MS = 45000;

/** Race a single reader.read() against an inactivity timer. Resolves 'stalled'
 *  if the timer wins; otherwise resolves the read result (or rejects with
 *  whatever reader.read() rejected with, e.g. AbortError on a user abort) and
 *  clears the timer either way, so nothing outlives one iteration. */
function readOrStall(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    ms: number,
): Promise<ReadableStreamReadResult<Uint8Array> | 'stalled'> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve('stalled'), ms);
        reader.read().then(
            (result) => {
                clearTimeout(timer);
                resolve(result);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

/** A `response` event for `body`, or an `error` event naming why the body
 *  is not one the page can render (see normalizeResponse). False on the
 *  error. */
function emitResponse(onEvent: (ev: SearchEvent) => void, body: unknown, frame?: object): boolean {
    let response: any;
    try {
        response = normalizeResponse(body);
    } catch (error) {
        onEvent({ kind: 'error', detail: (error as Error).message, code: 'UNREADABLE_RESPONSE' });
        return false;
    }
    onEvent({ ...frame, kind: 'response', response });
    return true;
}

/**
 * Streaming path. Emits every parsed event through onEvent, including the
 * terminal done/error. Route-level failures (non-2xx JSON body, or a JSON
 * body where a stream was expected — i.e. streaming is broken upstream) are
 * surfaced as synthetic 'error' / 'response' events so the timeline shows them.
 *
 * `stallTimeoutMs` bounds the gap between reader.read() completions — a
 * silently dead connection (no engine error, no close, just nothing) would
 * otherwise spin the loading view forever. On a stall the reader is cancelled
 * and a synthetic 'error' event is emitted (STALL_TIMEOUT), matching the
 * route-level-failure treatment above. A user abort (AbortSignal) rejects
 * reader.read() with AbortError, which this function simply propagates,
 * bypassing the stall path entirely.
 */
export async function resolveStream(
    req: unknown,
    onEvent: (ev: SearchEvent) => void,
    signal?: AbortSignal,
    stallTimeoutMs: number = DEFAULT_STALL_TIMEOUT_MS,
): Promise<void> {
    const res = await fetch(`${SEARCH_BASE}/api/search/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(req),
        signal,
    });
    const ctype = res.headers.get('content-type') ?? '';
    if (!res.ok || !ctype.includes('text/event-stream')) {
        const body = await res.json().catch(() => null);
        if (res.ok && body != null) {
            // Server ignored the Accept header — a gut-check finding in itself.
            emitResponse(onEvent, body);
            onEvent({
                kind: 'error',
                detail: 'expected text/event-stream, got buffered JSON — streaming broke upstream',
                code: 'NOT_A_STREAM',
            });
        } else {
            onEvent({
                kind: 'error',
                detail: detailText(body, res.status),
                code: body?.code ?? null,
                pointer: body?.pointer ?? null,
                status: res.status,
                trace_id: body?.trace_id ?? null,
            });
        }
        return;
    }
    if (!res.body) {
        onEvent({ kind: 'error', detail: 'response has no body stream', code: null });
        return;
    }
    // A frame the page cannot read ends the stream: its `error` event is the
    // run's last, so a trailing `done` cannot settle the run over it.
    let unreadable = false;
    const parse = makeSseParser((_event, data) => {
        if (unreadable) return;
        // `kind` inside the payload duplicates the `event:` line; trust the payload.
        try {
            const ev = JSON.parse(data);
            if (ev?.kind === 'response') {
                unreadable = !emitResponse(onEvent, ev.response, ev);
            } else if (ev?.kind === 'place_options') {
                // Wire SlotOption[] -> the flat EntityOption shape a live
                // POST to /api/search/options already returns, so PlaceEditor
                // treats a prefetched entry exactly like a fetched one.
                onEvent({ ...ev, options: placeOptionValues(ev.options ?? []) });
            } else {
                onEvent(ev);
            }
        } catch {
            unreadable = true;
            onEvent({
                kind: 'error',
                detail: `unparsable frame: ${data.slice(0, 200)}`,
                code: null,
            });
        }
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
        const result = await readOrStall(reader, stallTimeoutMs);
        if (result === 'stalled') {
            await reader.cancel().catch(() => {});
            onEvent({
                kind: 'error',
                detail: `Search stream stalled — no data received for ${stallTimeoutMs}ms.`,
                code: 'STALL_TIMEOUT',
            });
            return;
        }
        if (result.done) break;
        parse(decoder.decode(result.value, { stream: true }));
        if (unreadable) {
            await reader.cancel().catch(() => {});
            return;
        }
    }
}

/**
 * The live suggestion for a draft query: the answer the stream's `response`
 * event carries. It posts the body a submit of the same text posts
 * (buildRequest with coverage) over SSE, so the search API's response cache
 * stores the run under the submit's key and can serve the submit from it.
 * The stream keeps reading to `done` after the promise settles, since the
 * cache stores nothing for a run that ends early; abort `signal` to stop it.
 * Rejects on an `error` event before the response, on a stream that ends
 * without one, and with AbortError on an abort.
 */
export function resolveSuggestion(query: string, signal: AbortSignal): Promise<any> {
    return new Promise((resolve, reject) => {
        resolveStream(
            buildRequest({ kind: 'raw_text', query }, true),
            (event) => {
                if (event.kind === 'response') {
                    resolve(event.response);
                } else if (event.kind === 'error') {
                    reject(new Error(event.detail));
                }
            },
            signal,
        ).then(() => reject(new Error('Search stream ended without a response')), reject);
    });
}

/** The one live suggestion stream a prompt holds; see createSuggestionSlot. */
export type SuggestionSlot = {
    /** The suggestion for `query`: the live stream's when it asked the same
     *  text, otherwise a new stream, which aborts the live one. */
    suggest(query: string): Promise<any>;
    /** Aborts the live stream unless it asked `query`; null aborts it
     *  whatever it asked. */
    keepOnly(query: string | null): void;
};

/**
 * Holds the prompt's suggestion stream. The search API single-flights
 * identical requests, so a submit of the suggestion's text joins the live
 * stream and is answered at its `done`, and aborting that stream would send
 * the submit back to a cold run. The stream is aborted only when the draft
 * moves to other text, a different text is submitted, or the prompt goes
 * away. A failed stream is aborted and leaves the slot, so asking again
 * retries.
 */
export function createSuggestionSlot(): SuggestionSlot {
    let live: { query: string; controller: AbortController; response: Promise<any> } | null = null;

    const keepOnly = (query: string | null) => {
        if (live && live.query !== query) {
            live.controller.abort();
            live = null;
        }
    };

    return {
        suggest(query) {
            keepOnly(query);
            if (live) {
                return live.response;
            }
            const controller = new AbortController();
            const response = resolveSuggestion(query, controller.signal);
            const entry = { query, controller, response };

            live = entry;
            response.catch(() => {
                controller.abort();
                if (live === entry) {
                    live = null;
                }
            });
            return response;
        },
        keepOnly,
    };
}

// ---------------------------------------------------------------------------
// Search shares (POST /api/share kind 'search', GET /api/share/<id>): links
// that store dataset references, not numbers — see lib/search/searchShare.ts.
// ---------------------------------------------------------------------------

export type SearchShareMode = 'live' | 'snapshot';

export type OpenedSearchShare = {
    id: string;
    mode: SearchShareMode;
    query: string;
    createdAt: string;
    refs: {
        partIndex: number;
        variableText: string | null;
        specId: string;
        identity: unknown;
        /** The shared Spec's named groups, posted beside the identity on
         *  replay. Null when it had none. */
        entityGroups: Record<string, EntityGroup> | null;
        operations: Operation[];
        /** The part's assumptions as the shared response gave them, echoed
         *  on replay. Null for a share stored without them and for a
         *  version link. */
        assumptions: Assumption[] | null;
        contentVersion: string | null;
    }[];
    /** Set when the view opened from a version link (lib/search/versionLink)
     *  rather than a stored share. */
    link?: VersionLink;
};

/** Mints a share link for the definite parts on screen: its id, or the
 *  platform's refusal code (`over_ceiling`, …) — `null` code when the
 *  request itself failed. */
export async function createSearchShare(req: {
    mode: SearchShareMode;
    query: string;
    parts: {
        partIndex: number;
        variableText: string | null;
        specId: string;
        identity: unknown;
        entityGroups: Record<string, EntityGroup> | null;
        operations: Operation[];
        definition: unknown;
    }[];
}): Promise<{ id: string } | { refused: string | null }> {
    try {
        const res = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'search', ...req }),
        });
        const body = await res.json().catch(() => null);

        return res.ok && typeof body?.id === 'string'
            ? { id: body.id }
            : { refused: typeof body?.detail === 'string' ? body.detail : null };
    } catch {
        return { refused: null };
    }
}

export async function fetchSearchShare(
    id: string,
    signal?: AbortSignal,
): Promise<OpenedSearchShare | null> {
    try {
        const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { signal });

        return res.ok ? ((await res.json()) as OpenedSearchShare) : null;
    } catch {
        return null;
    }
}

export type VersionLinkResult =
    | VersionLinkOutcome
    // The Datasets API knows no such version or spec, or the version has
    // expired or been revoked (404 / 410).
    | { kind: 'gone' }
    | { kind: 'failed' };

/** Reads a version link's definition from the Datasets API, as the share it
 *  opens as (see lib/search/versionLink). */
export async function fetchVersionLink(
    link: VersionLink,
    signal?: AbortSignal,
): Promise<VersionLinkResult> {
    const spec = encodeURIComponent(link.specId);
    const url = link.contentVersion
        ? `${SEARCH_BASE}/api/datasets/${spec}/${encodeURIComponent(link.contentVersion)}`
        : `${SEARCH_BASE}/api/datasets/${spec}/options`;

    try {
        const res = await datasetsFetch(url, { signal });

        if (res.status === 404 || res.status === 410) {
            return { kind: 'gone' };
        }

        const outcome = res.ok
            ? outcomeFromDocument(link, (await res.json()) as VersionLinkDocument)
            : null;

        return outcome ?? { kind: 'failed' };
    } catch {
        return { kind: 'failed' };
    }
}

/**
 * Asks the site to pin a version it just downloaded (POST /api/download-pin,
 * which holds the principal): the version, so the version link in the
 * bundle keeps opening. Fire and forget: the download neither waits on it nor
 * fails with it. The server logs a refused pin; a request that never reaches
 * it is logged here.
 */
export function pinDownloadedVersion(req: {
    specId: string;
    contentVersion: string;
    definition: unknown;
}): void {
    void fetch('/api/download-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
    }).catch((error: unknown) => {
        console.warn('Version pin request failed', error);
    });
}

/**
 * A snapshot share's frozen observations, as dfo-apis serves them from the
 * pinned snapshot: `GET /api/datasets/{spec_id}/{content_version}/observations`
 * through the same-origin Datasets proxy. Null on any failure (a 404, or a 410
 * `artifact_expired` / `snapshot_revoked`).
 */
export async function fetchSnapshotObservations(
    specId: string,
    contentVersion: string,
): Promise<SpecObservations | null> {
    try {
        const res = await datasetsFetch(
            `/api/datasets/${encodeURIComponent(specId)}/${encodeURIComponent(contentVersion)}/observations`,
        );

        return res.ok ? ((await res.json()) as SpecObservations) : null;
    } catch {
        return null;
    }
}
