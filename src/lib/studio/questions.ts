/**
 * The questions of a Studio transcript, as the Prompt layout's dock and
 * session panel both read them. Pure, so the rules run under `node --test`.
 *
 * A prompt (a user message that opens a turn) starts a question, numbered by
 * the page turn it opened (messageTurns). An answer to a paused turn belongs
 * to the question it answers. A refunded prompt is one the harness refused
 * before its turn ran: it is marked `refused`, and its reply is the refusal.
 * The question's reply is the text of the last bot message before the next
 * prompt.
 */
import { messageTurns } from './activityView.ts';
import { plainTextFromNote } from './note.ts';
import { isPrompt } from './transcript.ts';

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { ActivityEntry } from '@/lib/studio/activity';
import type { ApprovedPlan } from '@/lib/studio/plan';
import type { ApplyChoiceSuggestion } from '@/lib/studio/wire';

type UserMessage = Extract<ChatMessage, { role: 'user' }>;

/** The mark on the prompt of a card change. */
export type CardEdit = NonNullable<UserMessage['edit']>;

/** One prompt of the transcript with the reply it opened. */
export type Question = {
    /** The page turn the prompt opened. */
    turn: number;
    text: string;
    /** The card the question was asked about. */
    about: string | null;
    /** Set on a card change, which asks nothing new of the conversation. */
    edit: CardEdit | null;
    /** The harness refused the prompt before its turn ran (the prompt is
     *  refunded); its reply is the refusal. */
    refused: boolean;
    /** The reply's text, empty while none has arrived. */
    reply: string;
    /** The plan the reader approved for this answer: the last one a bot
     *  message of the question carries. */
    plan: ApprovedPlan | null;
    /** The last bot message's follow-up prompts and scope chips. */
    followups: string[];
    chips: ApplyChoiceSuggestion[];
};

/** Every question of the transcript, card changes and refused prompts
 *  included, oldest first. */
export const promptsOf = (
    messages: readonly ChatMessage[],
    activity: readonly ActivityEntry[],
): Question[] => {
    const turns = messageTurns(messages, activity);
    const questions: Question[] = [];
    let open: Question | null = null;

    messages.forEach((message, at) => {
        if (message.role === 'user') {
            if (!isPrompt(message)) return;

            open = {
                turn: turns[at] ?? 0,
                text: message.text,
                about: message.card?.title ?? null,
                edit: message.edit ?? null,
                refused: !!message.refunded,
                reply: '',
                plan: null,
                followups: [],
                chips: [],
            };
            questions.push(open);

            return;
        }

        if (!open) return;

        open.reply = message.text;
        open.followups = message.followups ?? [];
        open.chips = message.chips ?? [];

        if (message.plan) open.plan = message.plan;
    });

    return questions;
};

/** The questions the reader asked, oldest first: card changes left out,
 *  refused prompts kept with their mark. */
export const questionsOf = (
    messages: readonly ChatMessage[],
    activity: readonly ActivityEntry[],
): Question[] => promptsOf(messages, activity).filter((question) => !question.edit);

/**
 * A reply's first sentence as plain text: its first non-empty line without
 * the underscores that wrap a note, a heading or list marker, emphasis, code
 * ticks or link targets, cut after the first `.`, `!` or `?` that ends a
 * sentence.
 */
export const firstSentence = (text: string): string => {
    const line =
        plainTextFromNote(text.trim())
            .split('\n')
            .find((candidate) => candidate.trim()) ?? '';
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

/** A run of a reply excerpt's text, bold where the reply set it in `**`. */
export type ReplyPart = { text: string; strong: boolean };

// A reply excerpt's length, about two lines of the dock at its widest.
const PREVIEW_CAP = 320;

// Stands for `**` while emphasis is dropped, so a bold span's stars are
// not read as emphasis.
const BOLD = '\u0000';

// A line that opens a list item, a table row or a code fence.
const STRUCTURED_LINE = /^\s*([-*+]\s|\d+[.)]\s|\||```|~~~)/;

/**
 * The opening of a reply as prose, for the folded row. Its lines run on
 * across paragraphs, with heading and quote markers, link targets, code
 * ticks and emphasis dropped and its `**` spans kept as strong parts. The
 * first list item, table row or code fence ends it, and it is cut at a word
 * boundary near PREVIEW_CAP characters. `more` is true when the reply holds
 * anything beyond the excerpt.
 */
export const replyPreview = (text: string): { parts: ReplyPart[]; more: boolean } => {
    const lines = plainTextFromNote(text.trim()).split('\n');
    const stop = lines.findIndex((line) => STRUCTURED_LINE.test(line));
    const prose = (stop === -1 ? lines : lines.slice(0, stop))
        .map((line) => line.trim().replace(/^(#{1,6}\s+|>\s*)/, ''))
        .join(' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`/g, '')
        .replaceAll('**', BOLD)
        .replace(/(^|\W)[_*]([^_*]+)[_*](?=\W|$)/g, '$1$2')
        .replace(/\s+/g, ' ')
        .trim();
    const cut = prose.length > PREVIEW_CAP;
    const space = prose.lastIndexOf(' ', PREVIEW_CAP);
    const kept = cut ? prose.slice(0, space > 0 ? space : PREVIEW_CAP).trimEnd() : prose;
    const parts = kept
        .split(BOLD)
        .map((run, at) => ({ text: run, strong: at % 2 === 1 }))
        .filter((part) => part.text);

    return { parts, more: cut || stop !== -1 };
};
