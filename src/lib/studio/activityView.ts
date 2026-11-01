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
 * match by label and tool is the only one the client can make, and it misses
 * a retry the agent corrected. A failure no later try matched therefore reads
 * as an error the step hit, and only a turn that ended without its answer
 * marks its failures as steps not done.
 */

import type { ActivityEntry, ActivityTool } from './activity';
import type { ApprovedPlan } from './plan';
import { isPrompt } from './transcript.ts';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';

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
    // `errored` and `failed` are a failure no later try matched: `failed` in a
    // turn that ended without its answer, `errored` in any other.
    state: 'complete' | 'errored' | 'failed' | 'skipped' | 'pending' | 'running';
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
    state:
        'complete' | 'errored' | 'failed' | 'retried' | 'skipped' | 'pending' | 'running' | 'plan';
    // True for a status line, false for a step that did work.
    quiet: boolean;
    durationMs: number | null;
    detail: string | null;
    retriedAt: number | null;
    card: { id: string; title: string } | null;
};

export type TurnOutcome =
    | { state: 'live' | 'waiting'; startedAt: number; cards: number }
    | {
          state: 'ended';
          startedAt: number;
          // Null for a turn saved before it ended.
          durationMs: number | null;
          cards: number;
          // The turn ended without its answer.
          failed: boolean;
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
    // The plan the user approved for this turn, if any; the entry holds when.
    // Without that time the plan heads the rail and stays out of the timed
    // log. A stored plan may lack its steps, as `approvedFromFrame` allows.
    plan?: { title: string; steps?: readonly unknown[] | null } | null;
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

/**
 * Whether `later` started after `failed` was done. By arrival order when the
 * entry holds it; a save without it compares the clock, the later step's
 * start against the failed try's start plus its duration.
 */
const startedAfter = (later: ActivityTool, failed: ActivityTool): boolean =>
    later.startOrder != null && failed.settleOrder != null
        ? later.startOrder > failed.settleOrder
        : later.startedAt >= failed.startedAt + (failed.durationMs ?? 0);

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
                // A retry starts once the failed try is done; a step that
                // ran beside it (parallel searches share a label) is
                // another step.
                startedAfter(other, tool),
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

/**
 * The turn of each message in a transcript: a prompt opens its turn, and the
 * replies and answers after it belong to that turn. A message before any
 * prompt has turn 0. The prompts are numbered back from the last Activity
 * entry's turn, so the last prompt takes that turn. This holds because each
 * prompt is appended with its entry, and a card or canvas share empties both
 * the transcript and Activity while keeping `turnCount` (1 for a card share),
 * from which a fork numbers its new entries and cards. Counting prompts from
 * the start would number a fork's turns too low. A save made before Activity
 * was kept has no entries, and a transcript holding more prompts than the last
 * entry's turn cannot align, so both count from turn 1.
 */
export const messageTurns = (
    messages: readonly ChatMessage[],
    activity: readonly ActivityEntry[],
): number[] => {
    const prompts = messages.filter(isPrompt).length;
    const dropped = Math.max(0, (activity.at(-1)?.turn ?? prompts) - prompts);
    let seen = 0;

    return messages.map((message) => {
        if (isPrompt(message)) {
            seen += 1;
        }

        return seen === 0 ? 0 : dropped + seen;
    });
};

/** Each turn's approved plan, found on the reply it produced. */
export const plansByTurn = (
    messages: readonly ChatMessage[],
    turns: readonly number[],
): Record<number, ApprovedPlan> => {
    const plans: Record<number, ApprovedPlan> = {};

    messages.forEach((message, index) => {
        if (message.role === 'bot' && message.plan && turns[index] > 0) {
            plans[turns[index]] = message.plan;
        }
    });

    return plans;
};

/** The view of one turn of the Activity tab. */
export const turnView = ({
    entry,
    cardTitles,
    plan,
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

    // A failure no later try matched: a step not done when the turn ended
    // without its answer, else an error the step hit.
    const failedAs = entry.failed ? 'failed' : 'errored';
    const cards = new Set(tools.flatMap((tool) => (tool.widgetId ? [tool.widgetId] : []))).size;

    const stepRow = (tool: ActivityTool): StepRow => {
        const tries = triesOf.get(tool) ?? [];
        const state = tool.state === 'failed' ? failedAs : tool.state;
        const durationMs = tool.durationMs ?? null;

        return {
            kind: 'step',
            key: tool.id,
            label: tool.name,
            state,
            detail:
                tool.state === 'failed'
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

    const railTools = tools.filter(onRail);
    const rows: RailRow[] = railTools.map(stepRow);
    const log: LogLine[] = tools.map((tool) => {
        const retried = retriedBy.get(tool);

        return {
            key: tool.id,
            at: tool.startedAt,
            label: tool.name,
            state: retried ? 'retried' : tool.state === 'failed' ? failedAs : tool.state,
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
            stepCount: plan.steps?.length ?? 0,
        };
        // The plan goes before the first step that started after the
        // approval: by arrival order when the entry holds it, else by the
        // clock. Without an approval time it heads the rail.
        const { approvedAt, approvedOrder } = entry;
        const afterApproval = (tool: ActivityTool) =>
            approvedOrder != null && tool.startOrder != null
                ? tool.startOrder > approvedOrder
                : approvedAt != null && tool.startedAt > approvedAt;
        const railAt = approvedAt == null ? 0 : railTools.findIndex(afterApproval);

        rows.splice(railAt < 0 ? rows.length : railAt, 0, planRow);

        if (approvedAt != null) {
            const logAt = tools.findIndex(afterApproval);

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

    const open = entry.endedAt == null && isLast && (thinking || waiting);
    const outcome: TurnOutcome = open
        ? { state: thinking ? 'live' : 'waiting', startedAt: entry.startedAt, cards }
        : {
              state: 'ended',
              startedAt: entry.startedAt,
              durationMs: entry.endedAt != null ? entry.endedAt - entry.startedAt : null,
              cards,
              failed: entry.failed === true,
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

// One part of a turn's outcome line; `alert` marks a turn without its
// answer in red.
export type OutcomePart = { key: string; text: string; alert?: true };

/**
 * The outcome line after the question. An ended turn: its start, its
 * length, the cards it made, and "No answer" when it ended without one. A
 * live or waiting turn: its time so far and the cards made yet. A count of
 * zero cards is left out.
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
        outcome.state === 'ended' && outcome.failed
            ? { key: 'failed', text: 'No answer', alert: true }
            : null,
    );

    return parts.filter((part) => part !== null);
};

export const triesText = (retry: Retry): string => {
    const failed = retry.attempts.length - 1;
    const head = `${plural(failed, 'try', 'tries')} failed first`;

    return retry.cause ? `${head}: ${retry.cause.replace(/\.$/, '')}.` : `${head}.`;
};
