/**
 * A recorded stream with the harness's placeholders for coming cards added,
 * as the contract sends them and no recording carries them yet
 * (src/lib/studio/comingCards.ts has the rules):
 *
 * - A drawing call's running line (`tool` `make_charts`) carries `coming`:
 *   one entry per card the drawing lines right after it draw, with
 *   `placeholder_id` `<step_id>.<n>`, the card's `type` and its title.
 * - Each of those cards carries `created_from.placeholder_id`.
 * - The drawing call's `complete` line moves to just after its last card,
 *   since a placeholder ends when its line closes and the harness closes
 *   the line once its cards are drawn. The frames keep the recorded `seq`
 *   values, in rising order.
 *
 * Every other value stays as recorded.
 */
import type { Frame, Scenario } from './scenario.ts';

type Created = Frame & {
    component_id: string;
    type: string;
    payload: { component: { title: { text: string } } };
    created_from: Record<string, unknown>;
};

const isRunning = (frame: Frame, tool?: string) =>
    frame.event === 'activity.step' &&
    frame.status === 'running' &&
    (tool === undefined || frame.tool === tool);

/** `frames` with the placeholder members added (see above). */
export const withComingFrames = (source: readonly Frame[]): Frame[] => {
    const frames = structuredClone(source) as Frame[];
    for (const call of frames.filter((frame) => isRunning(frame, 'make_charts'))) {
        const at = frames.indexOf(call);
        // The drawing lines right after the call, up to a line of any other
        // tool.
        const lines = new Set<unknown>();

        for (const frame of frames.slice(at + 1)) {
            if (!isRunning(frame)) continue;
            if (frame.tool !== 'write_component') break;

            lines.add(frame.step_id);
        }

        const cards = frames.filter(
            (frame): frame is Created =>
                frame.event === 'component.created' &&
                lines.has((frame as Created).created_from.step_id),
        );

        if (cards.length === 0) continue;

        call.coming = cards.map((card, index) => ({
            placeholder_id: `${String(call.step_id)}.${index}`,
            type: card.type,
            title: card.payload.component.title.text,
        }));
        cards.forEach((card, index) => {
            card.created_from = {
                ...card.created_from,
                placeholder_id: `${String(call.step_id)}.${index}`,
            };
        });

        const closed = frames.findIndex(
            (frame) =>
                frame.event === 'activity.step' &&
                frame.step_id === call.step_id &&
                frame.status === 'complete',
        );

        if (closed >= 0) {
            const [line] = frames.splice(closed, 1);

            frames.splice(frames.indexOf(cards.at(-1)!) + 1, 0, line!);
        }
    }

    const seqs = frames
        .map((frame) => frame.seq)
        .filter((seq): seq is number => typeof seq === 'number')
        .toSorted((a, b) => a - b);

    frames.forEach((frame) => {
        if (typeof frame.seq === 'number') frame.seq = seqs.shift();
    });

    return frames;
};

/** `scenario` with every turn's frames carrying the placeholder members.
 *  A pause splits a turn's frames, so each segment is changed alone. */
export const withComing = (scenario: Scenario): Scenario => ({
    ...scenario,
    name: `${scenario.name}-coming`,
    turns: scenario.turns.map((turn) => ({
        ...turn,
        segments: turn.segments.map((segment) => ({
            ...segment,
            frames: withComingFrames(segment.frames),
        })),
    })),
});
