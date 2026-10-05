'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './ChatPanel.module.scss';
import MessageFeedback from './MessageFeedback';
import WidgetChips from './WidgetChips';
import type { ChatMessage as ChatMessageData, TurnWidget } from '../hooks/useChat';
import type { CardView } from '../canvas/layout';

type ChatMessageProps = {
    message: ChatMessageData;
    // Is this the transcript's last entry (the live status shows there only).
    isLast: boolean;
    // The bot turn's cards (already filtered to this turn).
    turnWidgets: TurnWidget[];
    // Which turn this answer is — the feedback box keys its vote on it.
    turn: number;
    // The streaming status while a turn is in flight.
    thinking: boolean;
    status: string | null;
    titles: Record<string, string>;
    views: Record<string, CardView>;
    onCanvas: (id: string) => boolean;
    onGo: (id: string) => void;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
    onFollowup: (text: string) => void;
    // A shared (read-only) transcript: chips without actions, no follow-ups.
    readOnly: boolean;
};

/**
 * One transcript entry: a user bubble, the live status placeholder, or a
 * bot turn — markdown, the cards it put on the whiteboard as chips, and
 * (on the latest turn) the suggested follow-ups.
 */
const ChatMessage = ({
    message,
    isLast,
    turnWidgets,
    turn,
    thinking,
    status,
    titles,
    views,
    onCanvas,
    onGo,
    onAdd,
    onRemove,
    onFollowup,
    readOnly,
}: ChatMessageProps) => {
    if (message.role === 'user') {
        return <p className={styles.chatBubble}>{message.text}</p>;
    }

    // An empty bot turn is a placeholder: show the live status ONLY on the
    // last one (a turn that ended on a clarify leaves an empty bot behind —
    // it must not echo the status too).
    if (!message.text && (!message.followups || !message.followups.length)) {
        return isLast && thinking ? (
            <p className={styles.thinking}>
                <span className={styles.thinkingDot} />
                {status ?? 'Thinking'}…
            </p>
        ) : null;
    }

    return (
        <div className={styles.botTurn}>
            {message.text && (
                <div className={styles.botText}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                </div>
            )}
            {/* Rate the answer (and copy it): a shared sheet is somebody
                else's conversation, so it reads without the actions. */}
            {message.text && !readOnly && (
                <MessageFeedback text={message.text} id={String(turn)} />
            )}
            {/* The cards this turn put on the whiteboard, with their on-canvas
                state (a share lists them without the actions). */}
            <WidgetChips
                widgets={turnWidgets}
                titles={titles}
                views={views}
                onCanvas={onCanvas}
                onGo={onGo}
                onAdd={onAdd}
                onRemove={onRemove}
                readOnly={readOnly}
            />
            {/* Follow-ups belong to the CURRENT turn only — once a newer turn
                exists they're stale, so drop them. */}
            {isLast && !readOnly && message.followups && message.followups.length > 0 && (
                <div className={styles.followups}>
                    {message.followups.map((followup) => (
                        <button
                            key={followup}
                            type="button"
                            className={styles.followupChip}
                            onClick={() => onFollowup(followup)}
                        >
                            {followup}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChatMessage;
