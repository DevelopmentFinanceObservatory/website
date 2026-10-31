/**
 * The Activity tab's view of one turn: its question, an outcome line, the
 * steps that did work on the planner rail, and the full log behind "Show
 * all". Pure rules over the `ActivityEntry` useChat keeps, so the tab needs
 * no data beyond the steps, the card titles and the turn's approved plan.
 *
 * A step with a `tool` (kept as `args`) or a card is work; one without is a
 * status line ("Working out the next step"), shown only in the full log
 * unless it is running or failed for good. A failed work step folds into a
 * later step of the same label and tool in the same turn that did not fail,
 * as one of its tries. The harness sends no link between the tries, so this
 * match by label and tool is the only one the client can make.
 */

import type { ActivityEntry, ActivityTool } from './activity';

// A step this long shows its duration without a hover.
export const SLOW_MS = 10_000;

// A completed step's detail is cut to this many characters.
const DETAIL_MAX = 140;

export type Attempt = {
    key: string;
    startedAt: number;
    durationMs: number | null;
    worked: boolean;
};

// The tries before a step that worked: the first try's cause, once, and
// every try with the one that worked last.
export type Retry = {
    cause: string | null;
    attempts: Attempt[];
};

export type StepRow = {
    kind: 'step';
    key: string;
    label: string;
    // `failed` here is a failure no later try fixed.
    state: 'complete' | 'failed' | 'skipped' | 'pending' | 'running';
    detail: string | null;
    startedAt: number;
    durationMs: number | null;
    slow: boolean;
    card: { id: string; title: string } | null;
    retry: Retry | null;
};

export type PlanRow = {
    kind: 'plan';
    key: string;
    title: string;
    stepCount: number;
};

export type RailRow = StepRow | PlanRow;

// One line of the full log. `retried` is a failed try a later one fixed,
// with the time of the try after it.
export type LogLine = {
    key: string;
    at: number;
    label: string;
    state: 'complete' | 'failed' | 'retried' | 'skipped' | 'pending' | 'running' | 'plan';
    // True for a status line, false for a step that did work.
    quiet: boolean;
    durationMs: number | null;
    detail: string | null;
    retriedAt: number | null;
    card: { id: string; title: string } | null;
};

export type TurnOutcome =
    | { state: 'live' | 'waiting'; startedAt: number; cards: number; notDone: number }
    | {
          state: 'ended';
          startedAt: number;
          // Null for a turn saved before it ended.
          durationMs: number | null;
          cards: number;
          notDone: number;
      };

export type TurnView = {
    turn: number;
    question: string;
    outcome: TurnOutcome;
    rows: RailRow[];
    log: LogLine[];
};

export type TurnViewInput = {
    entry: ActivityEntry;
    // Card titles by widget id, renames applied.
    cardTitles: Record<string, string>;
    // The plan the user approved for this turn, if any.
    plan?: { title: string; steps: readonly unknown[] } | null;
    // When the user approved it; without it the plan heads the rail and
    // stays out of the timed log.
    approvedAt?: number;
    // Whether this is the newest turn, whether its stream is running, and
    // whether a plan or question waits on the user. Any other turn that never
    // closed (an older one, or one restored from a save) reads as ended.
    isLast: boolean;
    thinking: boolean;
    waiting: boolean;
};

const isWork = (tool: ActivityTool) => tool.args != null || tool.widgetId != null;

const isOpen = (tool: ActivityTool) => tool.state === 'pending' || tool.state === 'running';

// An advice clause: ", so …" up to the next ':' or ';', or the end.
const ADVICE = /, so [^:;]*?(?=[:;]|\.?$)/g;

/**
 * A failure line without its advice, for a failure a later try fixed:
 * "X, so ask again…" reads "X.", and in "X, so ask narrower: A; Y: B" only
 * the clause goes, keeping what follows. A line with no such clause comes
 * back whole. A failure that stands keeps its advice, which says what to do.
 */
export const causeOf = (sentence: string | undefined): string | null => {
    const text = sentence?.trim();

    if (!text) {
        return null;
    }

    const cut = text.replace(ADVICE, '').trim();

    if (cut === text || !cut) {
        return text;
    }

    return /[.!?]$/.test(cut) ? cut : `${cut}.`;
};

/**
 * What a completed step reports. A search's detail is "query · Found …",
 * and the part after the last " · " is what it found. Any other detail is
 * cut to its first sentence and DETAIL_MAX characters.
 */
export const detailOf = (tool: ActivityTool): string | null => {
    let text = tool.summary?.trim();

    if (!text) {
        return null;
    }

    if (tool.args === 'search') {
        const at = text.lastIndexOf(' · ');

        text = at < 0 ? text : text.slice(at + 3).trim();
    }

    const first = text.split(/\n|(?<=\.)\s/)[0]?.trim() ?? '';

    return first.length > DETAIL_MAX ? `${first.slice(0, DETAIL_MAX - 1)}…` : first || null;
};

/** Each folded failed try mapped to the later step that took its place. */
const foldRetries = (tools: ActivityTool[]): Map<ActivityTool, ActivityTool> => {
    const retriedBy = new Map<ActivityTool, ActivityTool>();

    tools.forEach((tool, index) => {
        if (tool.state !== 'failed' || !isWork(tool)) {
            return;
        }

        const later = tools.slice(index + 1).find(
            (other) =>
                other.name === tool.name &&
                other.args === tool.args &&
                (other.state === 'complete' || isOpen(other)) &&
                // A retry starts once the failed try has ended; a step
                // that ran beside it (parallel searches share a label)
                // is another step.
                other.startedAt >= tool.startedAt + (tool.durationMs ?? 0),
        );

        if (later) {
            retriedBy.set(tool, later);
        }
    });

    return retriedBy;
};

const cardOf = (tool: ActivityTool, titles: Record<string, string>) => {
    const title = tool.widgetId ? titles[tool.widgetId] : undefined;

    return tool.widgetId && title ? { id: tool.widgetId, title } : null;
};

const plural = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;

/** The view of one turn of the Activity tab. */
export const turnView = ({
    entry,
    cardTitles,
    plan,
    approvedAt,
    isLast,
    thinking,
    waiting,
}: TurnViewInput): TurnView => {
    const { tools } = entry;
    const retriedBy = foldRetries(tools);
    const triesOf = new Map<ActivityTool, ActivityTool[]>();

    for (const [failed, later] of retriedBy) {
        triesOf.set(later, [...(triesOf.get(later) ?? []), failed]);
    }

    const standing = tools.filter((tool) => tool.state === 'failed' && !retriedBy.has(tool));
    const cards = new Set(tools.flatMap((tool) => (tool.widgetId ? [tool.widgetId] : []))).size;

    const stepRow = (tool: ActivityTool): StepRow => {
        const tries = triesOf.get(tool) ?? [];
        const state = tool.state;
        const durationMs = tool.durationMs ?? null;

        return {
            kind: 'step',
            key: tool.id,
            label: tool.name,
            state,
            detail:
                state === 'failed'
                    ? (tool.summary?.trim() ?? null)
                    : state === 'complete'
                      ? detailOf(tool)
                      : null,
            startedAt: tool.startedAt,
            durationMs,
            slow: durationMs != null && durationMs >= SLOW_MS,
            card: state === 'complete' ? cardOf(tool, cardTitles) : null,
            retry:
                tries.length && state === 'complete'
                    ? {
                          cause: causeOf(tries[0]?.summary),
                          attempts: [...tries, tool].map((attempt) => ({
                              key: attempt.id,
                              startedAt: attempt.startedAt,
                              durationMs: attempt.durationMs ?? null,
                              worked: attempt === tool,
                          })),
                      }
                    : null,
        };
    };

    // The rail: work steps not folded into a later try, the running step
    // whatever its kind, and any failure that stands.
    const onRail = (tool: ActivityTool) =>
        tool.state === 'running' ||
        (tool.state === 'failed' && !retriedBy.has(tool)) ||
        (isWork(tool) && !retriedBy.has(tool));

    const steps = tools.filter(onRail).map(stepRow);
    const rows: RailRow[] = [...steps];
    const log: LogLine[] = tools.map((tool) => {
        const retried = retriedBy.get(tool);

        return {
            key: tool.id,
            at: tool.startedAt,
            label: tool.name,
            state: retried ? 'retried' : tool.state,
            quiet: !isWork(tool),
            durationMs: tool.durationMs ?? null,
            detail:
                tool.state === 'failed'
                    ? retried
                        ? null
                        : (tool.summary?.trim() ?? null)
                    : isWork(tool) && tool.state === 'complete'
                      ? detailOf(tool)
                      : null,
            retriedAt: retried?.startedAt ?? null,
            card: tool.state === 'complete' ? cardOf(tool, cardTitles) : null,
        };
    });

    if (plan) {
        const planRow: PlanRow = {
            kind: 'plan',
            key: 'plan',
            title: plan.title,
            stepCount: plan.steps.length,
        };
        // The plan goes before the first step that started after the
        // approval, or heads the rail when that time is unknown.
        const railAt =
            approvedAt == null ? 0 : steps.findIndex((step) => step.startedAt > approvedAt);

        rows.splice(railAt < 0 ? rows.length : railAt, 0, planRow);

        if (approvedAt != null) {
            const logAt = log.findIndex((line) => line.at > approvedAt);

            log.splice(logAt < 0 ? log.length : logAt, 0, {
                key: 'plan',
                at: approvedAt,
                label: 'You approved the plan',
                state: 'plan',
                quiet: false,
                durationMs: null,
                detail: null,
                retriedAt: null,
                card: null,
            });
        }
    }

    const base = { startedAt: entry.startedAt, cards, notDone: standing.length };
    const open = entry.endedAt == null && isLast && (thinking || waiting);
    const outcome: TurnOutcome = open
        ? { state: thinking ? 'live' : 'waiting', ...base }
        : {
              state: 'ended',
              ...base,
              durationMs: entry.endedAt != null ? entry.endedAt - entry.startedAt : null,
          };

    return { turn: entry.turn, question: entry.prompt, outcome, rows, log };
};

// --- Formats -----------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** A clock time, "23:29:38", in the reader's time zone. */
export const clockText = (ms: number): string => {
    const date = new Date(ms);

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** A step's duration in seconds to one decimal: "3.6s". */
export const secondsText = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** A turn's length: "38 s", "2 min 3 s". */
export const spanText = (ms: number): string => {
    const total = Math.max(0, Math.round(ms / 1000));

    return total < 60 ? `${total} s` : `${Math.floor(total / 60)} min ${total % 60} s`;
};

// One part of a turn's outcome line; `alert` marks the failures in red.
export type OutcomePart = { key: string; text: string; alert?: true };

/**
 * The outcome line after the question. An ended turn: its start, its
 * length, the cards it made, and the steps that stand failed. A live or
 * waiting turn: its time so far and the cards made yet. A count of zero
 * cards or failures is left out.
 */
export const outcomeParts = (outcome: TurnOutcome, now: number): OutcomePart[] => {
    const parts: (OutcomePart | null)[] =
        outcome.state === 'ended'
            ? [
                  { key: 'start', text: clockText(outcome.startedAt).slice(0, 5) },
                  outcome.durationMs != null
                      ? { key: 'length', text: spanText(outcome.durationMs) }
                      : null,
              ]
            : [{ key: 'length', text: spanText(now - outcome.startedAt) }];

    parts.push(
        outcome.cards ? { key: 'cards', text: plural(outcome.cards, 'card') } : null,
        outcome.notDone
            ? { key: 'notDone', text: `${plural(outcome.notDone, 'step')} not done`, alert: true }
            : null,
    );

    return parts.filter((part) => part !== null);
};

export const triesText = (retry: Retry): string => {
    const failed = retry.attempts.length - 1;
    const head = `${plural(failed, 'try', 'tries')} failed first`;

    return retry.cause ? `${head}: ${retry.cause.replace(/\.$/, '')}.` : `${head}.`;
};
