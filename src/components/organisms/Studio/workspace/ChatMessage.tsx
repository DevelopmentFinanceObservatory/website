'use client';

import classNames from 'classnames';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import ApprovedPlanPill from './ApprovedPlanPill';
import styles from './ChatPanel.module.scss';
import MessageFeedback from './MessageFeedback';
import WidgetChips from './WidgetChips';
import type { ChatMessage as ChatMessageData, TurnWidget } from '../hooks/useChat';
import type { CardView } from '../canvas/layout';
import { chipKey } from '@/lib/studio/chips';
import type { ApplyChoiceSuggestion } from '@/lib/studio/wire';

type ChatMessageProps = {
    message: ChatMessageData;
    // Is this the transcript's last entry (follow-ups show there only).
    isLast: boolean;
    // The bot turn's cards (already filtered to this turn).
    turnWidgets: TurnWidget[];
    // Which turn this answer is — the feedback box keys its vote on it.
    turn: number;
    titles: Record<string, string>;
    views: Record<string, CardView>;
    onCanvas: (id: string) => boolean;
    onGo: (id: string) => void;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
    onFollowup: (text: string) => void;
    onApplyChoice: (chip: ApplyChoiceSuggestion) => void;
    // A shared (read-only) transcript: chips without actions, no follow-ups.
    readOnly: boolean;
};

/**
 * One transcript entry: a user bubble, or a bot turn — markdown, the cards
 * it put on the whiteboard as chips, the plan the user approved for it, and
 * (on the latest turn) the suggested
 * follow-ups and the chips that switch a scope choice of the answer.
 */
const ChatMessage = ({
    message,
    isLast,
    turnWidgets,
    turn,
    titles,
    views,
    onCanvas,
    onGo,
    onAdd,
    onRemove,
    onFollowup,
    onApplyChoice,
    readOnly,
}: ChatMessageProps) => {
    if (message.role === 'user') {
        return (
            <p className={styles.chatBubble}>
                {message.card && (
                    <span className={styles.chatBubbleCard}>About “{message.card.title}”</span>
                )}
                {message.text}
            </p>
        );
    }

    // An empty bot turn shows nothing. The live line renders below the
    // transcript, and a turn that ended on a clarify leaves an empty bot
    // message behind.
    const followups = message.followups ?? [];
    const chips = message.chips ?? [];

    if (!message.text && followups.length === 0 && chips.length === 0 && !message.plan) {
        return null;
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
            {message.text && !readOnly && <MessageFeedback text={message.text} id={String(turn)} />}
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
            {/* The plan the user approved for this answer, to read again. */}
            {message.plan && <ApprovedPlanPill plan={message.plan} />}
            {/* Follow-ups belong to the CURRENT turn only — once a newer turn
                exists they're stale, so drop them. */}
            {isLast && !readOnly && (followups.length > 0 || chips.length > 0) && (
                <div className={styles.followups}>
                    {followups.map((followup) => (
                        <button
                            key={followup}
                            type="button"
                            className={styles.followupChip}
                            onClick={() => onFollowup(followup)}
                        >
                            {followup}
                        </button>
                    ))}
                    {chips.map((chip) => (
                        <button
                            key={chipKey(chip)}
                            type="button"
                            className={classNames(styles.followupChip, styles.choiceChip)}
                            onClick={() => onApplyChoice(chip)}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChatMessage;
