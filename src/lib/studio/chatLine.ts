/**
 * The chat line: one line saying what the agent is doing now. These are the
 * pure rules behind `useChat`'s `status`, `statusDetail` and `stalled`.
 */

import type { ActivityStepFrame } from './wire';

export type ChatLine = { label: string; detail: string | null };

// What a frame leaves when no step is running.
export const IDLE = 'idle';

export type StepLineUpdate = ChatLine | typeof IDLE | null;

// What the line says while a turn works and no step is running.
export const WORKING = 'Working';

// How long no step may be running before the line falls back to
// {@link WORKING}. A step that ends often hands over to the next one within
// about 10 ms, and the line keeps its label across that gap.
export const WORKING_GRACE_MS = 300;

// Silence (no frame, no keep-alive) this long marks an open stream stalled.
export const STALL_MS = 20_000;

// The preamble's one-line cap, in characters.
export const PREAMBLE_CAP = 120;

/**
 * Follows one stream's `activity.step` frames and returns the line each
 * frame leaves, or null when the frame leaves it unchanged (a `pending`
 * frame). Only `running` frames open a line. The line shows the most
 * recently opened step still running, ordered by each step's first frame. A
 * later `running` frame for an open step updates its detail only. When a
 * step ends (complete, failed or skipped) the line falls back to the next
 * step still running, else {@link IDLE}: the caller decides how long to keep
 * the old label before showing {@link WORKING} (see
 * {@link createWorkingGrace}).
 */
export const createStepLine = () => {
    // step_id → the order of its first frame.
    const opened = new Map<string, number>();
    const running = new Map<string, ChatLine>();

    return (
        frame: Pick<ActivityStepFrame, 'step_id' | 'label' | 'status' | 'detail'>,
    ): StepLineUpdate => {
        if (!opened.has(frame.step_id)) {
            opened.set(frame.step_id, opened.size);
        }

        if (frame.status === 'pending') {
            return null;
        }

        if (frame.status === 'running') {
            const open = running.get(frame.step_id);

            running.set(
                frame.step_id,
                open
                    ? { ...open, detail: frame.detail ?? open.detail }
                    : { label: frame.label, detail: frame.detail ?? null },
            );
        } else {
            running.delete(frame.step_id);
        }

        let latest: { order: number; line: ChatLine } | null = null;

        for (const [id, line] of running) {
            const order = opened.get(id) ?? 0;

            if (!latest || order > latest.order) {
                latest = { order, line };
            }
        }

        return latest?.line ?? IDLE;
    };
};

/**
 * Delays the fall back to {@link WORKING}. `idle()` starts the clock when no
 * step is running (a second call while it runs leaves it alone) and
 * `onWorking` fires once {@link WORKING_GRACE_MS} passes with no step
 * running. `cancel()` stops it: call it when a step starts running, a line
 * replaces the label, or the stream ends.
 */
export const createWorkingGrace = (onWorking: () => void, ms = WORKING_GRACE_MS) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cancel = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    return {
        idle: () => {
            if (timer !== null) {
                return;
            }

            timer = setTimeout(() => {
                timer = null;
                onWorking();
            }, ms);
        },
        cancel,
    };
};

/**
 * The preamble as the chat line shows it: its first sentence on one line,
 * cut at a word boundary with an ellipsis past {@link PREAMBLE_CAP}
 * characters. Empty when the text has no words yet.
 */
export const preambleLine = (text: string): string => {
    const flat = text.replace(/\s+/g, ' ').trim();
    const first = flat.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? flat;

    if (first.length <= PREAMBLE_CAP) {
        return first;
    }

    const cut = first.slice(0, PREAMBLE_CAP - 1);
    const space = cut.lastIndexOf(' ');

    return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`;
};

/**
 * A line's label as the live status shows it: the label with exactly one
 * trailing ellipsis, whether or not the label already ends in an ellipsis
 * or a sentence period.
 */
export const withEllipsis = (label: string): string =>
    `${label.replace(/(…|\.\.\.|\.)+$/, '')}…`;

/**
 * Watches one open stream for silence. `beat()` marks a sign of life (a
 * frame or a keep-alive) and restarts the clock; `stop()` ends the watch
 * for good when the stream ends or pauses. `onChange` hears each flip of the
 * stalled flag: true after {@link STALL_MS} of silence, false on the next
 * beat or on stop.
 */
export const createStallWatch = (onChange: (stalled: boolean) => void, ms = STALL_MS) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stalled = false;
    let stopped = false;

    const flip = (next: boolean) => {
        if (stalled !== next) {
            stalled = next;
            onChange(next);
        }
    };

    const clear = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    return {
        beat: () => {
            if (stopped) {
                return;
            }

            clear();
            flip(false);
            timer = setTimeout(() => {
                timer = null;
                flip(true);
            }, ms);
        },
        stop: () => {
            stopped = true;
            clear();
            flip(false);
        },
    };
};

// The transcript note for a turn stopped before it said anything.
export const STOPPED_NOTE = '_Stopped._';

/**
 * What a stopped turn's bot message shows when nothing reached it: the
 * preamble the line was showing, else {@link STOPPED_NOTE}.
 */
export const stoppedReply = (preamble: string): string => preamble.trim() || STOPPED_NOTE;
