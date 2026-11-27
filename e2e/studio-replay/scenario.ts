/**
 * A recorded Studio conversation (fixtures/<name>.json) and what the page
 * should show while and after it plays.
 *
 * A fixture holds each turn's question and its stream in segments: the
 * first answers the question's POST /api/studio/turn, and each later one
 * answers the POST /api/studio/interrupt the reader sends at the pause the
 * segment before it ended on (a plan or a clarifying question). `act` says
 * how the reader answers that pause, and `expect` the members the interrupt
 * request must carry. Frames are the harness's own `data:` frames, in order.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Frame = { event: string; [member: string]: unknown };

export type Act = { kind: 'approve' } | { kind: 'answer'; picks: Record<string, string> };

export type Segment = { act?: Act; expect?: Record<string, unknown>; frames: Frame[] };

export type Turn = { question: string; segments: Segment[] };

export type Scenario = { name: string; description: string; turns: Turn[] };

export type Block = { component_id: string };

export type Manifest = { revision: number; blocks: Block[]; [member: string]: unknown };

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

/** Every recorded scenario, by file name. */
export const SCENARIOS = ['words', 'chart', 'five', 'plan', 'clarify', 'error', 'eight'] as const;

export const loadScenario = (name: string): Scenario =>
    // The fixtures are this directory's own recordings.
    JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')) as Scenario;

/** The canvas a turn's frames leave, or `before` when they change none. */
export const manifestAfter = (frames: Frame[], before: Manifest | null): Manifest | null => {
    let manifest = before;

    for (const frame of frames) {
        if (frame.event === 'composition.updated') {
            manifest = frame.manifest as Manifest;
        } else if (frame.event === 'done' && frame.composition) {
            manifest = frame.composition as Manifest;
        }
    }

    return manifest;
};

/** The words the page must show when the segment ends on a pause: the
 *  plan's title, or the first clarifying question. */
export const pauseWords = (segment: Segment): string | null => {
    const last = segment.frames.at(-1);

    if (last?.event === 'plan.proposed') {
        return String(last.title);
    }

    if (last?.event === 'elicitation.request') {
        const questions = last.questions as { question: string }[] | undefined;

        return questions?.[0]?.question ?? null;
    }

    return null;
};

/** What the page must show once the whole scenario has played: as many
 *  cards as the last canvas holds, and the start of the last turn's reply,
 *  or of its error's detail. */
export const endState = (scenario: Scenario): { cards: number; words: string | null } => {
    let manifest: Manifest | null = null;

    for (const turn of scenario.turns) {
        manifest = manifestAfter(
            turn.segments.flatMap((segment) => segment.frames),
            manifest,
        );
    }

    const last = scenario.turns.at(-1)!.segments.flatMap((segment) => segment.frames);
    const reply = last.findLast((frame) => frame.event === 'message.complete')?.text;
    const error = last.findLast((frame) => frame.event === 'error')?.error as
        { detail?: string } | undefined;
    const words = typeof reply === 'string' ? reply : (error?.detail ?? null);

    return { cards: manifest?.blocks.length ?? 0, words: words ? opening(words) : null };
};

// The first words of `text`, enough to tell it apart, cut at a word and
// short of any Markdown the page renders as formatting.
const opening = (text: string): string => {
    const plain = text.split(/[*_`#[\]\n]/)[0]!.trim();
    const words = plain.split(/\s+/).slice(0, 6).join(' ');

    return words;
};
