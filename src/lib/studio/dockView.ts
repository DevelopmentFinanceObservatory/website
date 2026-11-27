/**
 * What the Prompt layout's dock shows: the one context row, the sheet above
 * the input row, whether the follow-up pills show, the sheet's height cap
 * and whether the send arrow is quiet. Pure, from the chat state and the
 * shell's sheet choice, so the rules run under `node --test`.
 *
 * The newest question decides. A card change (a prompt marked `edit`) is a
 * silent turn: while it runs the dock shows the status row, when it ends
 * well the dock shows what the question before it showed, and when it fails
 * its failure, or its refusal, shows as the folded row. A refused question
 * stays the dock's question, with its refusal as the reply.
 */
import { WORKING } from './chatLine.ts';
import { type ComposerMode, type ComposerPlan, composerMode } from './composer.ts';
import { firstSentence, promptsOf, type Question } from './questions.ts';
import { isPrompt } from './transcript.ts';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { ActivityEntry } from '@/lib/studio/activity';
import type { EditTarget } from '@/lib/studio/composer';
import type { ApprovedPlan } from '@/lib/studio/plan';
import type { Sheet } from '@/lib/studio/promptShell';

/** The context row above the input row. */
export type DockRow =
    | { kind: 'status'; stepOf: { step: number; of: number } | null }
    | { kind: 'plan' }
    | { kind: 'set_aside' }
    | { kind: 'about'; title: string }
    /** `openable` is false for a refused card change, which has no sheet. */
    | { kind: 'folded'; text: string; openable: boolean };

export type DockSheet = 'none' | 'reply' | 'thread' | 'plan' | 'clarify';

/** `words`: a held answer in words, `plan`: the plan sheet's own cap. */
export type DockCap = 'normal' | 'words' | 'plan';

export type DockInput = {
    messages: readonly ChatMessage[];
    activity: readonly ActivityEntry[];
    /** The conversation's cards, each with the turn that drew it. */
    widgets: readonly { turn: number }[];
    /** The cards on the canvas now. */
    canvasCards: number;
    thinking: boolean;
    /** The waiting or read-only plan, null with none. */
    plan: (NonNullable<ComposerPlan> & { version: number }) | null;
    clarify: boolean;
    walled: boolean;
    editTarget: EditTarget | null;
    draft: string;
    /** The reader's sheet choice, and the turn it was made on. A choice
     *  made on another question does not hold. */
    sheet: Sheet;
    sheetTurn: number | null;
    focus: boolean;
    /** Words have streamed into the newest question's reply since the
     *  transcript's last commit (replyStream.ts). */
    streamed: boolean;
    /** The turn whose plan the reader cancelled, null with none. */
    setAside: number | null;
    /** The plan sheet the reader folded (planKey), null with none. */
    planFolded: string | null;
};

export type DockView = {
    /** What takes the input row's place: the guest wall, a clarifying
     *  question, or the field (composerMode). */
    mode: ComposerMode;
    /** The question the dock speaks for, null before the first. */
    question: Question | null;
    /** The running card change, shown in place of `question` in the head. */
    running: Question | null;
    row: DockRow | null;
    sheet: DockSheet;
    /** The plan sheet shows open (false: folded to its one row). */
    planOpen: boolean;
    pills: boolean;
    cap: DockCap;
    /** An answer in words on an empty canvas: the reply stays open, and
     *  only its chevron or Escape folds it. */
    held: boolean;
    quietSend: boolean;
    /** The questions the conversation sheet lists. */
    questions: Question[];
    /** The question the conversation sheet opens on, scrolled to the top
     *  with focus on it: an older question the reader asked to read. Null
     *  opens it at its foot. */
    threadTurn: number | null;
    /** While a clarifying question waits, the ones the turn already asked,
     *  each with the reader's answer, oldest first. */
    clarified: Clarified[];
};

export type Clarified = { asked: string; answer: string };

/** The clarifying questions the latest prompt's turn asked and the reader
 *  answered: the answers after that prompt that name the question. A plan
 *  answer names none. */
export const clarifiedOf = (messages: readonly ChatMessage[]): Clarified[] =>
    messages
        .slice(messages.findLastIndex(isPrompt) + 1)
        .flatMap((message) =>
            message.role === 'user' && message.answer && message.asked
                ? [{ asked: message.asked, answer: message.text }]
                : [],
        );

/** The key a plan sheet's fold is kept under: one per question and version,
 *  so a new version opens again. */
export const planKey = (turn: number, version: number): string => `${turn}:${version}`;

/** The running label without trailing dots or an ellipsis. */
export const runningLabel = (status: string | null): string =>
    status?.replace(/(\.|…)+\s*$/, '').trim() || WORKING;

// The position (from 1) among the approved steps of the step the turn's
// newest running line runs, else of the newest line's step, reading only
// lines that name a step of the plan. Null when no line names one, or the
// approved steps carry no ids (a save or a harness from before them).
const namedStep = (steps: ApprovedPlan['steps'], lines: ActivityEntry['tools']) => {
    const ids = steps.map((step) => step.id);
    const named = lines.filter((tool) => tool.planStepId && ids.includes(tool.planStepId));
    const line =
        named.findLast((tool) => tool.state === 'running' || tool.state === 'pending') ??
        named.at(-1);

    return line?.planStepId ? ids.indexOf(line.planStepId) + 1 : null;
};

/**
 * `Step n of m` while an approved plan of two or more steps runs. n is the
 * place among the approved steps of the step the newest running line runs,
 * when the lines name their plan steps (namedStep). Otherwise it counts the
 * steps the turn started after the approval: the step running, else the
 * next one, capped at m. Null for a question without such a plan.
 */
export const planStep = (
    plan: ApprovedPlan | null,
    entry: ActivityEntry | undefined,
): { step: number; of: number } | null => {
    const of = plan?.steps.length ?? 0;

    if (of < 2) {
        return null;
    }

    const after = (entry?.tools ?? []).filter((tool) =>
        entry?.approvedOrder !== undefined && tool.startOrder !== undefined
            ? tool.startOrder > entry.approvedOrder
            : tool.startedAt >= (entry?.approvedAt ?? Infinity),
    );
    const named = namedStep(plan?.steps ?? [], after);
    const running = after.some((tool) => tool.state === 'running' || tool.state === 'pending');
    const step = named ?? (running ? after.length : after.length + 1);

    return { step: Math.min(Math.max(step, 1), of), of };
};

/**
 * The dock's view. One context row shows at a time, the first that applies
 * in this order: status, plan, set aside, about, folded.
 */
export const dockView = (input: DockInput): DockView => {
    const all = promptsOf(input.messages, input.activity);
    const questions = all.filter((question) => !question.edit);
    const newest = all.at(-1);
    const view = questionView(input, questions.at(-1) ?? null, questions);

    if (input.plan || input.clarify) {
        return view;
    }

    const editLast = newest?.edit ? newest : null;
    const failure = editLast && !input.thinking ? editLast.reply.trim() : '';

    // A card change running: the status row alone.
    if (editLast && input.thinking && !editLast.refused) {
        return {
            ...view,
            running: editLast,
            row: { kind: 'status', stepOf: null },
            sheet: 'none',
            planOpen: false,
            pills: false,
            cap: 'normal',
            held: false,
        };
    }

    // A card change refused or failed: the refusal is the folded row, in
    // place of the question's reply. The answer's pills stay.
    if (failure && view.row?.kind !== 'about') {
        const sheet = view.sheet === 'thread' ? 'thread' : 'none';

        return {
            ...view,
            row: { kind: 'folded', text: firstSentence(failure), openable: false },
            sheet,
            pills: view.pills && sheet === 'none',
            cap: 'normal',
            held: false,
        };
    }

    return view;
};

const questionView = (
    input: DockInput,
    question: Question | null,
    questions: Question[],
): DockView => {
    const { plan, clarify, thinking } = input;
    // The guest wall, then a waiting plan, then a clarifying question, then
    // the field: a plan holds the sheet while a question also waits, and
    // the wall takes the question's place.
    const mode = composerMode({ walled: input.walled, plan, clarify });
    const quietSend = !!plan?.live && !input.draft.trim();
    // The conversation sheet belongs to no one question, so its choice holds
    // whatever turn it was made on; every other choice holds only on the
    // newest question.
    const choice: Sheet =
        input.sheet === 'thread' || (question && input.sheetTurn === question.turn)
            ? input.sheet
            : 'auto';
    const placed = !!question && input.widgets.some((widget) => widget.turn === question.turn);
    const hasText = !!question && (!!question.reply.trim() || input.streamed);
    const running = !!question && thinking && !plan && !clarify;
    const answered = !!question && !thinking && (hasText || placed || !!question.plan);
    // An answer in words on an empty canvas stays open until the reader
    // folds it.
    const held = answered && hasText && input.canvasCards === 0;

    let sheet: DockSheet = 'none';

    if (mode === 'clarify') {
        sheet = 'clarify';
    } else if (plan) {
        sheet = 'plan';
    } else if (choice === 'thread' && questions.length > 0) {
        sheet = 'thread';
    } else if (hasText) {
        // The reader's choice wins; else a question that placed a card shows
        // its reply folded, and one that placed none shows it open. While it
        // streams that folds the reply the moment its first card lands.
        const open = held
            ? choice !== 'folded'
            : choice === 'open' || (choice === 'auto' && !placed);

        sheet = open ? 'reply' : 'none';
    }

    const setAside =
        !!question && input.setAside === question.turn && !thinking && !plan && !hasText && !placed;

    let row: DockRow | null = null;

    if (running) {
        const entry = input.activity.findLast((candidate) => candidate.turn === question.turn);

        row = { kind: 'status', stepOf: planStep(question.plan, entry) };
    } else if (plan?.live) {
        row = { kind: 'plan' };
    } else if (setAside) {
        row = { kind: 'set_aside' };
    } else if (input.editTarget && mode !== 'clarify') {
        row = { kind: 'about', title: input.editTarget.title };
    } else if (answered && hasText && sheet === 'none') {
        row = { kind: 'folded', text: firstSentence(question.reply), openable: true };
    }

    const suggestions = (question?.followups.length ?? 0) + (question?.chips.length ?? 0);
    const pills =
        !input.focus &&
        !input.walled &&
        answered &&
        !clarify &&
        suggestions > 0 &&
        (row === null || row.kind === 'folded') &&
        sheet === 'none';

    return {
        mode,
        question,
        running: null,
        row,
        sheet,
        planOpen:
            sheet === 'plan' &&
            !!question &&
            !!plan &&
            input.planFolded !== planKey(question.turn, plan.version),
        pills,
        cap: sheet === 'plan' ? 'plan' : held && sheet === 'reply' ? 'words' : 'normal',
        held: held && sheet === 'reply',
        quietSend,
        questions,
        threadTurn:
            sheet === 'thread' &&
            input.sheetTurn !== question?.turn &&
            questions.some((candidate) => candidate.turn === input.sheetTurn)
                ? input.sheetTurn
                : null,
        clarified: sheet === 'clarify' ? clarifiedOf(input.messages) : [],
    };
};

/** The field's placeholder and accessible name (the placeholder without its
 *  trailing dots). A card's kind names it: chart, number, table or note. */
export const dockField = ({
    asked,
    planLive,
    target,
}: {
    asked: boolean;
    planLive: boolean;
    target: 'chart' | 'number' | 'table' | 'note' | null;
}): { placeholder: string; label: string } => {
    const placeholder = planLive
        ? 'Or say what to change...'
        : target
          ? `Ask about this ${target}...`
          : asked
            ? 'Ask a follow up...'
            : 'Ask a question...';

    return { placeholder, label: placeholder.replace(/\.+$/, '') };
};

/**
 * Streaming text cut into Markdown blocks at blank lines outside code
 * fences, so finished blocks keep their rendering while the last one grows.
 */
export const streamBlocks = (text: string): string[] => {
    const blocks: string[] = [];
    let current: string[] = [];
    let fenced = false;

    for (const line of text.split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) {
            fenced = !fenced;
        }

        if (!fenced && !line.trim()) {
            if (current.length > 0) {
                blocks.push(current.join('\n'));
                current = [];
            }

            continue;
        }

        current.push(line);
    }

    if (current.length > 0) {
        blocks.push(current.join('\n'));
    }

    return blocks;
};

/** The pending item that ends focus mode once: a waiting plan's or a
 *  clarifying question's interrupt id. */
export const pendingItem = (
    plan: { live: boolean; interruptId: string } | null,
    clarify: { interruptId: string } | null,
): string | null => {
    if (plan?.live) {
        return `plan:${plan.interruptId}`;
    }

    return clarify ? `clarify:${clarify.interruptId}` : null;
};

/** An element as `fieldShown` reads it. Browsers before Safari 17.4 lack
 *  `checkVisibility`. */
type Shown = Pick<Element, 'getClientRects'> & {
    checkVisibility?: (options?: { visibilityProperty?: boolean }) => boolean;
};

/**
 * Whether `field` is drawn and visible, so it can take focus. Without
 * `checkVisibility`, a field with a layout box whose computed `visibility`
 * (read through `visibilityOf`) is `visible` counts as shown.
 */
export const fieldShown = (field: Shown, visibilityOf: (field: Shown) => string): boolean =>
    typeof field.checkVisibility === 'function'
        ? field.checkVisibility({ visibilityProperty: true })
        : field.getClientRects().length > 0 && visibilityOf(field) === 'visible';
