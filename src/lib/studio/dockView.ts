/**
 * What the Prompt layout's dock shows: the one context row, the sheet above
 * the input row, whether the follow-up pills show, the sheet's height cap
 * and whether the send arrow is quiet. Pure, from the chat state and the
 * shell's sheet choice, so the rules run under `node --test`.
 *
 * The newest question decides. A card change (a prompt marked `edit`) is a
 * silent turn: while it runs the dock shows the status row, when it ends
 * well the dock shows what the question before it showed, and when it is
 * refused its refusal shows as the folded row.
 */
import { messageTurns } from './activityView.ts';
import { isPrompt } from './transcript.ts';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { ActivityEntry } from '@/lib/studio/activity';
import type { EditTarget } from '@/lib/studio/composer';
import type { ApprovedPlan } from '@/lib/studio/plan';
import type { Sheet } from '@/lib/studio/promptShell';
import type { ApplyChoiceSuggestion } from '@/lib/studio/wire';

/** One question of the conversation with its reply, as the dock shows it. */
export type DockQuestion = {
    /** The page turn the prompt opened. */
    turn: number;
    text: string;
    /** The card the question was asked about. */
    about: string | null;
    /** The reply's text, empty while none has arrived. */
    reply: string;
    /** The plan the reader approved for this answer. */
    plan: ApprovedPlan | null;
    followups: string[];
    chips: ApplyChoiceSuggestion[];
    /** A card change, which adds no question to the conversation. */
    edit: boolean;
};

/** Each prompt of the transcript with the reply it opened, oldest first,
 *  numbered by page turn as its cards and its Activity entry are
 *  (messageTurns). */
export const dockQuestions = (
    messages: readonly ChatMessage[],
    activity: readonly ActivityEntry[],
): DockQuestion[] => {
    const questions: DockQuestion[] = [];
    const turns = messageTurns(messages, activity);

    messages.forEach((message, at) => {
        if (message.role === 'user') {
            if (!isPrompt(message)) {
                return;
            }

            questions.push({
                turn: turns[at] ?? 0,
                text: message.text,
                about: message.card?.title ?? null,
                reply: '',
                plan: null,
                followups: [],
                chips: [],
                edit: !!message.edit,
            });

            return;
        }

        const question = questions.at(-1);

        if (!question) {
            return;
        }

        // The last bot message before the next prompt is the reply.
        question.reply = message.text;
        question.plan = message.plan ?? null;
        question.followups = message.followups ?? [];
        question.chips = message.chips ?? [];
    });

    return questions;
};

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
    plan: { live: boolean; version: number } | null;
    clarify: boolean;
    walled: boolean;
    editTarget: EditTarget | null;
    draft: string;
    /** The reader's sheet choice, and the turn it was made on. A choice
     *  made on another question does not hold. */
    sheet: Sheet;
    sheetTurn: number | null;
    focus: boolean;
    /** The turn whose plan the reader cancelled, null with none. */
    setAside: number | null;
    /** The plan sheet the reader folded (planKey), null with none. */
    planFolded: string | null;
};

export type DockView = {
    /** The question the dock speaks for, null before the first. */
    question: DockQuestion | null;
    /** The running card change, shown in place of `question` in the head. */
    running: DockQuestion | null;
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
    questions: DockQuestion[];
};

/** The key a plan sheet's fold is kept under: one per question and version,
 *  so a new version opens again. */
export const planKey = (turn: number, version: number): string => `${turn}:${version}`;

/**
 * A reply's first sentence as plain text: its first non-empty line without a
 * heading or list marker, emphasis, code ticks or link targets, cut after
 * the first `.`, `!` or `?` that ends a sentence.
 */
export const firstSentence = (text: string): string => {
    const line = text.split('\n').find((candidate) => candidate.trim()) ?? '';
    const plain = line
        .trim()
        .replace(/^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*|`/g, '')
        .replace(/(^|\W)[_*]([^_*]+)[_*](?=\W|$)/g, '$1$2')
        .trim();
    const end = plain.search(/[.!?](\s|$)/);

    return end === -1 ? plain : plain.slice(0, end + 1);
};

/** The running label without trailing dots or an ellipsis. */
export const runningLabel = (status: string | null): string =>
    status?.replace(/(\.|…)+\s*$/, '').trim() || 'Working';

/**
 * `Step n of m` while an approved plan of two or more steps runs, from the
 * steps the turn started after the approval: n is the step running, else
 * the next one, never past m. Null for a question without such a plan.
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
    const running = after.some((tool) => tool.state === 'running' || tool.state === 'pending');
    const step = running ? after.length : after.length + 1;

    return { step: Math.min(Math.max(step, 1), of), of };
};

/**
 * The dock's view. See the file comment and the rules inline; the spec's
 * "Context rows" table sets the row order: status, plan, set aside, about,
 * folded.
 */
export const dockView = (input: DockInput): DockView => {
    const all = dockQuestions(input.messages, input.activity);
    const questions = all.filter((question) => !question.edit);
    const newest = all.at(-1);
    const editLast = newest?.edit ? newest : null;
    const view = questionView(input, questions.at(-1) ?? null, questions);

    if (!editLast || input.plan || input.clarify) {
        return view;
    }

    // A card change running: the status row alone.
    if (input.thinking) {
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

    // A refused card change: its refusal is the folded row, in place of the
    // question's reply.
    if (editLast.reply.trim() && view.row?.kind !== 'about') {
        return {
            ...view,
            row: { kind: 'folded', text: firstSentence(editLast.reply), openable: false },
            sheet: view.sheet === 'thread' ? 'thread' : 'none',
            pills: false,
            cap: 'normal',
            held: false,
        };
    }

    return view;
};

const questionView = (
    input: DockInput,
    question: DockQuestion | null,
    questions: DockQuestion[],
): DockView => {
    const { plan, clarify, thinking } = input;
    const quietSend = !!plan?.live && !input.draft.trim();
    const choice: Sheet = question && input.sheetTurn === question.turn ? input.sheet : 'auto';
    const placed = !!question && input.widgets.some((widget) => widget.turn === question.turn);
    const hasText = !!question?.reply.trim();
    const running = !!question && thinking && !plan && !clarify;
    const answered = !!question && !thinking && (hasText || placed || !!question.plan);
    // Approved change 1: an answer in words on an empty canvas stays open.
    const held = answered && hasText && input.canvasCards === 0;

    let sheet: DockSheet = 'none';

    if (clarify) {
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
    } else if (input.editTarget && !clarify) {
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
