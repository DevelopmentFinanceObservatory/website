import classNames from 'classnames';
import { memo, useLayoutEffect, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './PromptDock.module.scss';
import { type CardView, widgetTitle } from '../../../canvas/layout';
import type { TurnWidget } from '../../../hooks/useChat';
import { useStreamedText } from '../../../hooks/useStreamedText';
import ApprovedPlanPill from '../../../workspace/ApprovedPlanPill';
import MessageFeedback from '../../../workspace/MessageFeedback';
import WidgetChips from '../../../workspace/WidgetChips';

import Icon from '@/components/atoms/Icon/Icon';
import { changeNote } from '@/lib/studio/changeNote';
import { streamBlocks } from '@/lib/studio/dockView';
import type { Question } from '@/lib/studio/questions';
import type { ReplyStream } from '@/lib/studio/replyStream';

/** What a reply's card chips need: the cards, their names and the way to
 *  each on the canvas. */
export type ChipActions = {
    titles: Record<string, string>;
    views: Record<string, CardView>;
    widgets: TurnWidget[];
    onCanvas: (id: string) => boolean;
    onGo: (id: string) => void;
};

const ignore = () => {};

// Tables and code blocks scroll sideways inside the reply.
const markdownComponents: Components = {
    table: ({ children }) => (
        <div className={styles.wide}>
            <table>{children}</table>
        </div>
    ),
};

const Markdown = memo(function Markdown({ text }: { text: string }) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
        </ReactMarkdown>
    );
});

/** Page turn `turn`'s reply as Markdown, with the words streamed in since
 *  the transcript's last commit (useStreamedText), and nothing before the first.
 *  While it streams, each finished block keeps its rendering and only the
 *  last one renders again. */
const ReplyText = ({
    text: committed,
    turn,
    stream,
    streaming,
}: {
    text: string;
    turn: number;
    stream: ReplyStream;
    streaming: boolean;
}) => {
    const text = useStreamedText(stream, turn, committed);

    if (!text) {
        return null;
    }

    return (
        <div className={styles.replyText}>
            {streaming ? (
                streamBlocks(text).map((block, index) => (
                    // Blocks only ever append, so a block keeps its index.
                    <Markdown key={index} text={block} />
                ))
            ) : (
                <Markdown text={text} />
            )}
        </div>
    );
};

/** A reply as the chat draws one: Markdown, the feedback controls, the
 *  approved plan's pill and the question's card chips. `named` is a card
 *  the dock names already, just below the reply (the selected card's chip
 *  in the input row), which the reply leaves out of its own chips. */
const ReplyContent = ({
    question,
    stream,
    streaming,
    feedback,
    chips,
    named = null,
}: {
    question: Question;
    stream: ReplyStream;
    streaming: boolean;
    feedback: boolean;
    chips: ChipActions;
    named?: string | null;
}) => {
    const widgets = chips.widgets.filter((widget) => widget.turn === question.turn);
    // What the reply's cards show since a card change redrew them.
    const note = changeNote(widgets, (card) => chips.titles[card.id] ?? widgetTitle(card));

    return (
        <>
            <ReplyText
                text={question.reply}
                turn={question.turn}
                stream={stream}
                streaming={streaming}
            />
            {note && <p className={styles.changeNote}>{note}</p>}
            {feedback && question.reply && !streaming && (
                <MessageFeedback text={question.reply} id={String(question.turn)} />
            )}
            {question.plan && <ApprovedPlanPill plan={question.plan} />}
            <WidgetChips
                widgets={widgets.filter((widget) => widget.id !== named)}
                titles={chips.titles}
                views={chips.views}
                onCanvas={chips.onCanvas}
                onGo={chips.onGo}
                // A chip in the reply names its card and flies to it; the
                // card's own head and the panel add and remove cards.
                readOnly
                onAdd={ignore}
                onRemove={ignore}
            />
        </>
    );
};

/** The open reply: the question's head with `All N questions` and the fold
 *  chevron, then the scrolling body. The body remounts, at its top, when
 *  the question it shows changes. */
export const ReplySheet = ({
    question,
    count,
    stream,
    failed,
    streaming,
    chips,
    named,
    onThread,
    onFold,
}: {
    question: Question;
    count: number;
    /** The streaming reply's text since the transcript's last commit. */
    stream: ReplyStream;
    /** The turn ended in an error: its text shows without the feedback
     *  actions. */
    failed: boolean;
    streaming: boolean;
    chips: ChipActions;
    /** The selected card, when the input row shows its chip. */
    named: string | null;
    onThread: () => void;
    onFold: () => void;
}) => (
    // The scrolling body is the `Reply` region; a second landmark of that
    // name around it would repeat it.
    <section className={styles.sheet}>
        <div className={styles.sheetHead}>
            {question.about && (
                <p className={styles.aboutLine}>
                    About <span className={styles.aboutTitle}>{question.about}</span>
                </p>
            )}
            <div className={styles.headRow}>
                <p className={styles.headQuestion} title={question.text}>
                    {question.text}
                </p>
                {count > 1 && (
                    <button type="button" className={styles.link} onClick={onThread}>
                        All {count} questions
                    </button>
                )}
                <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Fold the reply"
                    aria-expanded="true"
                    data-dock="fold"
                    onClick={onFold}
                >
                    <Icon name="chevron-down" />
                </button>
            </div>
        </div>
        <div
            key={question.turn}
            className={styles.scroll}
            role="region"
            aria-label="Reply"
            // The body scrolls, and a keyboard reader scrolls it from here.
            tabIndex={0}
        >
            <ReplyContent
                question={question}
                stream={stream}
                streaming={streaming}
                feedback={!failed}
                chips={chips}
                named={named}
            />
        </div>
    </section>
);

/** Every question with its reply, opened at its foot. */
export const ThreadSheet = ({
    questions,
    stream,
    runningTurn,
    focusTurn,
    chips,
    onClose,
}: {
    questions: Question[];
    /** The streaming reply's text since the transcript's last commit. */
    stream: ReplyStream;
    /** The turn still streaming, null when none is. */
    runningTurn: number | null;
    /** The question to open on, at the top with focus; null opens at the
     *  foot. */
    focusTurn: number | null;
    chips: ChipActions;
    onClose: () => void;
}) => {
    const body = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = body.current;
        const item =
            focusTurn === null
                ? null
                : el?.querySelector<HTMLElement>(`[data-turn="${focusTurn}"]`);

        if (!el) {
            return;
        }

        if (!item) {
            el.scrollTop = el.scrollHeight;

            return;
        }

        el.scrollTop += item.getBoundingClientRect().top - el.getBoundingClientRect().top;

        // A frame later, so the focus lands after any the press that asked
        // for this question queued for the field.
        const frame = requestAnimationFrame(() => item.focus({ preventScroll: true }));

        return () => cancelAnimationFrame(frame);
    }, [focusTurn]);

    return (
        <section className={styles.sheet} aria-label="Conversation">
            <div className={classNames(styles.sheetHead, styles.headRow)}>
                <p className={styles.headLabel}>Conversation</p>
                <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label="Close the conversation"
                    aria-expanded="true"
                    data-dock="fold"
                    onClick={onClose}
                >
                    <Icon name="chevron-down" />
                </button>
            </div>
            <div
                ref={body}
                className={classNames(styles.scroll, styles.thread)}
                role="log"
                // Replies stream into the log; the shell's one live region
                // says when an answer starts and when it is ready.
                aria-live="off"
                tabIndex={0}
            >
                {questions.map((question) => (
                    <div
                        key={question.turn}
                        className={styles.threadItem}
                        data-turn={question.turn}
                        // Focus lands here when the reader asks to read
                        // this question at the prompt.
                        tabIndex={-1}
                    >
                        {question.about && (
                            <p className={styles.aboutLine}>
                                About <span className={styles.aboutTitle}>{question.about}</span>
                            </p>
                        )}
                        <p className={styles.threadQuestion}>{question.text}</p>
                        <ReplyContent
                            question={question}
                            stream={stream}
                            streaming={question.turn === runningTurn}
                            feedback={false}
                            chips={chips}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
};
