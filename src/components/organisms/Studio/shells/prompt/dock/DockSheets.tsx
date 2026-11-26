import classNames from 'classnames';
import { memo, useLayoutEffect, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './PromptDock.module.scss';
import type { CardView } from '../../../canvas/layout';
import type { TurnWidget } from '../../../hooks/useChat';
import ApprovedPlanPill from '../../../workspace/ApprovedPlanPill';
import MessageFeedback from '../../../workspace/MessageFeedback';
import WidgetChips from '../../../workspace/WidgetChips';

import Icon from '@/components/atoms/Icon/Icon';
import { type DockQuestion, streamBlocks } from '@/lib/studio/dockView';

/** What a reply's card chips do, as the chat's card rows do it. */
export type ChipActions = {
    titles: Record<string, string>;
    views: Record<string, CardView>;
    widgets: TurnWidget[];
    onCanvas: (id: string) => boolean;
    onGo: (id: string) => void;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
};

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

/** The reply's Markdown. While it streams, each finished block keeps its
 *  rendering and only the last one renders again. */
const ReplyText = ({ text, streaming }: { text: string; streaming: boolean }) => (
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

/** A reply as the chat draws one: Markdown, the feedback controls, the
 *  approved plan's pill and the question's card chips. */
const ReplyContent = ({
    question,
    streaming,
    feedback,
    chips,
}: {
    question: DockQuestion;
    streaming: boolean;
    feedback: boolean;
    chips: ChipActions;
}) => {
    const widgets = chips.widgets.filter((widget) => widget.turn === question.turn);

    return (
        <>
            {question.reply && <ReplyText text={question.reply} streaming={streaming} />}
            {feedback && question.reply && !streaming && (
                <MessageFeedback text={question.reply} id={String(question.turn)} />
            )}
            {question.plan && <ApprovedPlanPill plan={question.plan} />}
            <WidgetChips
                widgets={widgets}
                titles={chips.titles}
                views={chips.views}
                onCanvas={chips.onCanvas}
                onGo={chips.onGo}
                onAdd={chips.onAdd}
                onRemove={chips.onRemove}
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
    streaming,
    chips,
    onThread,
    onFold,
}: {
    question: DockQuestion;
    count: number;
    streaming: boolean;
    chips: ChipActions;
    onThread: () => void;
    onFold: () => void;
}) => (
    <section className={styles.sheet} aria-label="Reply">
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
            <ReplyContent question={question} streaming={streaming} feedback chips={chips} />
        </div>
    </section>
);

/** Every question with its reply, opened at its foot. */
export const ThreadSheet = ({
    questions,
    runningTurn,
    chips,
    onClose,
}: {
    questions: DockQuestion[];
    /** The turn still streaming, null when none is. */
    runningTurn: number | null;
    chips: ChipActions;
    onClose: () => void;
}) => {
    const body = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = body.current;

        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, []);

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
                    <div key={question.turn} className={styles.threadItem}>
                        {question.about && (
                            <p className={styles.aboutLine}>
                                About <span className={styles.aboutTitle}>{question.about}</span>
                            </p>
                        )}
                        <p className={styles.threadQuestion}>{question.text}</p>
                        <ReplyContent
                            question={question}
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
