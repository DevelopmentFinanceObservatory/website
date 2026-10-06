/**
 * The Activity record: one entry per turn, holding the turn's steps as their
 * `activity.step` frames left them. These are the pure rules `useChat`
 * applies when a turn ends and when a saved conversation is restored.
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
};

// One turn's trace: the user's prompt and its steps, in order.
export type ActivityEntry = {
    turn: number;
    prompt: string;
    startedAt: number;
    endedAt?: number;
    tools: ActivityTool[];
};

// Activity as a saved conversation holds it. Older saves have no `state` on a
// step and may carry a `thoughts` string or a `statusLine` flag, which
// restoring drops.
export type SavedActivityEntry = Omit<ActivityEntry, 'tools'> & {
    tools: (Omit<ActivityTool, 'state'> & { state?: StepState })[];
};

const isOpen = (state: StepState) => state === 'pending' || state === 'running';

/**
 * Activity rebuilt from a save. No restored step can still be live, so a
 * step saved pending or running becomes skipped, and a step saved without a
 * state becomes complete.
 */
export const restoreActivity = (saved: SavedActivityEntry[] | undefined): ActivityEntry[] =>
    (saved ?? []).map(({ turn, prompt, startedAt, endedAt, tools }) => ({
        turn,
        prompt,
        startedAt,
        endedAt,
        tools: tools.map(({ id, name, args, summary, startedAt, durationMs, widgetId, state }) => ({
            id,
            name,
            args,
            summary,
            startedAt,
            durationMs,
            widgetId,
            state: state === undefined ? 'complete' : isOpen(state) ? 'skipped' : state,
        })),
    }));

/**
 * Marks `turn` ended. With `open` set, its steps still pending or running
 * take that state: `skipped` when the user stopped the turn, `failed` when
 * the stream failed, since no further frame will settle them.
 */
export const endTurnActivity = (
    activity: ActivityEntry[],
    turn: number,
    open?: 'skipped' | 'failed',
): ActivityEntry[] =>
    activity.map((entry) =>
        entry.turn === turn
            ? {
                  ...entry,
                  endedAt: Date.now(),
                  tools: open
                      ? entry.tools.map((tool) =>
                            isOpen(tool.state) ? { ...tool, state: open } : tool,
                        )
                      : entry.tools,
              }
            : entry,
    );
