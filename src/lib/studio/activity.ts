/**
 * The Activity record: one entry per turn, holding the turn's steps as their
 * `activity.step` frames left them. These are the pure rules `useChat`
 * applies as frames arrive, when a turn ends and when a saved conversation
 * is restored.
 *
 * Each entry numbers the events it records in arrival order (a step
 * starting, a step settling, the plan's approval), so the Activity view can
 * tell what came after what without comparing clock times, which a
 * buffered stream delivers all at once.
 */

import type { ActivityStepFrame } from './wire';

export type StepState = ActivityStepFrame['status'];

// One step of a turn (a tool call or a status line), the Activity view's
// log line.
export type ActivityTool = {
    id: string;
    name: string;
    // The step's `tool` as sent.
    args: unknown;
    // The step's latest `detail`.
    summary?: string;
    startedAt: number;
    durationMs?: number;
    // Set when the tool put a card on the canvas.
    widgetId?: string;
    // The step's latest status.
    state: StepState;
    // Its place in the turn's arrival order when it started and when it
    // first settled. Saves made before the order was kept lack them.
    startOrder?: number;
    settleOrder?: number;
};

// One turn's trace: the user's prompt and its steps, in order.
export type ActivityEntry = {
    turn: number;
    prompt: string;
    startedAt: number;
    endedAt?: number;
    // When the user approved the turn's plan. Saves made before it was kept
    // lack it.
    approvedAt?: number;
    // The approval's place in the turn's arrival order.
    approvedOrder?: number;
    // Set when the turn ended in an error, a broken stream or a refusal
    // before its reply had any text. Saves made before it was kept lack it.
    failed?: true;
    tools: ActivityTool[];
};

// Activity as a saved conversation holds it. Older saves have no `state` on a
// step and may carry a `thoughts` string or a `statusLine` flag, which
// restoring drops.
export type SavedActivityEntry = Omit<ActivityEntry, 'tools'> & {
    tools: (Omit<ActivityTool, 'state'> & { state?: StepState })[];
};

const isOpen = (state: StepState) => state === 'pending' || state === 'running';

// The next number in the entry's arrival order.
const nextOrder = (entry: ActivityEntry): number =>
    1 +
    Math.max(
        entry.approvedOrder ?? 0,
        ...entry.tools.map((tool) => Math.max(tool.startOrder ?? 0, tool.settleOrder ?? 0)),
    );

/**
 * The entry with one `activity.step` frame recorded: one line per
 * `step_id`, opened by its first frame and updated by later ones, each
 * start and first settle numbered in arrival order. `now` is the arrival
 * time.
 */
export const recordStep = (
    entry: ActivityEntry,
    frame: Omit<ActivityStepFrame, 'event' | 'seq'>,
    now: number,
): ActivityEntry => {
    const order = nextOrder(entry);
    const settled = !isOpen(frame.status);
    const existing = entry.tools.find((tool) => tool.id === frame.step_id);
    const patch = {
        summary: frame.detail ?? undefined,
        durationMs: frame.duration_ms ?? undefined,
        widgetId: frame.produced?.component_id,
        state: frame.status,
    };

    if (!existing) {
        const tool: ActivityTool = {
            id: frame.step_id,
            name: frame.label,
            args: frame.tool ?? undefined,
            startedAt: now,
            ...patch,
            startOrder: order,
            ...(settled && { settleOrder: order }),
        };

        return { ...entry, tools: [...entry.tools, tool] };
    }

    return {
        ...entry,
        tools: entry.tools.map((tool) =>
            tool === existing
                ? {
                      ...tool,
                      ...patch,
                      ...(settled && { settleOrder: tool.settleOrder ?? order }),
                  }
                : tool,
        ),
    };
};

/** The entry with the plan's approval recorded at `now`, in arrival order. */
export const recordApproval = (entry: ActivityEntry, now: number): ActivityEntry => ({
    ...entry,
    approvedAt: now,
    approvedOrder: nextOrder(entry),
});

/**
 * Activity rebuilt from a save. No restored step can still be live, so a
 * step saved pending or running becomes skipped, and a step saved without a
 * state becomes complete.
 */
export const restoreActivity = (saved: SavedActivityEntry[] | undefined): ActivityEntry[] =>
    (saved ?? []).map(
        ({ turn, prompt, startedAt, endedAt, approvedAt, approvedOrder, failed, tools }) => ({
            turn,
            prompt,
            startedAt,
            endedAt,
            approvedAt,
            approvedOrder,
            failed,
            tools: tools.map(
                ({
                    id,
                    name,
                    args,
                    summary,
                    startedAt,
                    durationMs,
                    widgetId,
                    state,
                    startOrder,
                    settleOrder,
                }) => ({
                    id,
                    name,
                    args,
                    summary,
                    startedAt,
                    durationMs,
                    widgetId,
                    state: state === undefined ? 'complete' : isOpen(state) ? 'skipped' : state,
                    startOrder,
                    settleOrder,
                }),
            ),
        }),
    );

/**
 * Marks `turn` ended. With `open` set, its steps still pending or running
 * take that state: `skipped` when the user stopped the turn, `failed` when
 * the stream failed, since no further frame will settle them. A turn that
 * failed before its reply had any text (`answered` false) is marked failed;
 * one the user stopped, or that failed after some answer, is not.
 */
export const endTurnActivity = (
    activity: ActivityEntry[],
    turn: number,
    open?: 'skipped' | 'failed',
    answered = true,
): ActivityEntry[] =>
    activity.map((entry) =>
        entry.turn === turn
            ? {
                  ...entry,
                  endedAt: Date.now(),
                  ...(open === 'failed' && !answered && { failed: true as const }),
                  tools: open
                      ? entry.tools.map((tool) =>
                            isOpen(tool.state) ? { ...tool, state: open } : tool,
                        )
                      : entry.tools,
              }
            : entry,
    );
