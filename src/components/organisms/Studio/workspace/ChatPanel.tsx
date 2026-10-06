'use client';

import classNames from 'classnames';
import { Fragment, useEffect, useRef, useState } from 'react';

import ActivityLog from './ActivityLog';
import ChatMessage from './ChatMessage';
import styles from './ChatPanel.module.scss';
import ClarifyPicker from './ClarifyPicker';
import PlanCard from './PlanCard';
import StatusLine from './StatusLine';
import type { CardView } from '../canvas/layout';
import type { useChat } from '../hooks/useChat';
import PromptForm from '../prompt/PromptForm';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import type { ShareMark } from '@/lib/chat/history';

export type ChatTab = 'chat' | 'activity';

type ChatPanelProps = {
    chat: ReturnType<typeof useChat>;
    tab: ChatTab;
    // Collapsed: slid out beyond the left edge; gone: a canvas/card share
    // has no chat at all.
    collapsed: boolean;
    gone: boolean;
    // A shared (read-only) transcript: no input, no card actions, and the
    // share marks aren't shown (they're the owner's).
    readOnly: boolean;
    // A guest past the free prompts: shown in place of the follow-up input.
    wall?: React.ReactNode;
    // A gallery session: the one thing a reader can do here.
    onContinue?: (() => void) | null;
    continuing?: boolean;
    shareMarks: ShareMark[];
    titles: Record<string, string>;
    views: Record<string, CardView>;
    onCanvas: (id: string) => boolean;
    onGo: (id: string) => void;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
    // Set by a card's "Ask follow up": the next message carries the card's
    // component_ref, so the agent answers about (or reworks) that card.
    editTarget: { id: string; title: string } | null;
    onClearEditTarget: () => void;
};

/**
 * The chat compartment: Chat (transcript + follow-up input, or the clarify
 * picker) and Activity stacked in ONE grid cell, crossfaded by the tab —
 * no reflow, the input belongs to Chat only.
 */
const ChatPanel = ({
    chat,
    tab,
    collapsed,
    gone,
    readOnly,
    wall,
    onContinue,
    continuing = false,
    shareMarks,
    titles,
    views,
    onCanvas,
    onGo,
    onAdd,
    onRemove,
    editTarget,
    onClearEditTarget,
}: ChatPanelProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [follow, setFollow] = useState('');

    // Keep the transcript pinned to the latest turn as it streams.
    useEffect(() => {
        const el = scrollRef.current;

        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [chat.messages, chat.queued, chat.status, chat.statusDetail]);

    const sendFollow = () => {
        if (!follow.trim()) {
            return;
        }

        // While a plan awaits review, the input is the "Propose changes"
        // channel — the text travels as an amendment, not a new turn.
        if (chat.plan) {
            chat.respondPlan('amend', follow.trim());
        } else if (editTarget) {
            chat.send(follow, { componentId: editTarget.id, intent: 'follow_up' });
            onClearEditTarget();
        } else {
            chat.send(follow);
        }

        setFollow('');
    };

    // A Chat + Canvas share point sits after message `index`?
    const sharedAfter = (index: number) =>
        !readOnly && shareMarks.some((mark) => mark.messageIndex === index + 1);

    return (
        <div
            className={classNames(
                styles.chatPanel,
                collapsed && styles.chatHidden,
                gone && styles.chatGone,
            )}
        >
            <div className={styles.views}>
                <div
                    className={classNames(styles.view, tab !== 'activity' && styles.viewActive)}
                    aria-hidden={tab === 'activity'}
                >
                    <div ref={scrollRef} className={styles.chatScroll}>
                        {chat.messages.map((message, index) => {
                            // The turn this bot message answers = the number
                            // of user messages before it (send() numbers
                            // turns the same way).
                            const turn = chat.messages
                                .slice(0, index)
                                .filter((other) => other.role === 'user').length;

                            return (
                                <Fragment key={index}>
                                    <ChatMessage
                                        message={message}
                                        isLast={index === chat.messages.length - 1}
                                        turnWidgets={chat.widgets.filter(
                                            (widget) => widget.turn === turn,
                                        )}
                                        turn={turn}
                                        titles={titles}
                                        views={views}
                                        onCanvas={onCanvas}
                                        onGo={onGo}
                                        onAdd={onAdd}
                                        onRemove={onRemove}
                                        onFollowup={chat.send}
                                        readOnly={readOnly}
                                    />
                                    {sharedAfter(index) && (
                                        <p className={styles.shareMark}>
                                            <Icon name="lock" className={styles.shareMarkIcon} />
                                            Messages beyond this point are only visible to you
                                        </p>
                                    )}
                                </Fragment>
                            );
                        })}
                        {/* One mount for the whole turn, so the line keeps its
                            counter and live region when the answer starts. */}
                        {chat.thinking && (
                            <StatusLine
                                status={chat.status}
                                detail={chat.statusDetail}
                                since={chat.statusSince}
                                stalled={chat.stalled}
                                onStop={chat.stop}
                            />
                        )}
                        {chat.queued.map((item) => (
                            <div key={item.id} className={styles.queued}>
                                <p className={classNames(styles.chatBubble, styles.queuedBubble)}>
                                    {item.text}
                                </p>
                                <button
                                    type="button"
                                    className={styles.queuedRemove}
                                    aria-label="Remove this queued message"
                                    onClick={() => chat.unqueue(item.id)}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                    {readOnly && onContinue && (
                        <div className={styles.chatFoot}>
                            <Button full onClick={onContinue} disabled={continuing}>
                                {continuing ? 'Opening…' : 'Continue this session'}
                            </Button>
                            <p className={styles.chatNote}>
                                Opens a copy in your own Studio — ask follow-ups, change the cards,
                                keep the canvas.
                            </p>
                        </div>
                    )}
                    {!readOnly && (
                        <div className={styles.chatFoot}>
                            {chat.plan && (
                                <PlanCard
                                    plan={chat.plan}
                                    onApprove={() => chat.respondPlan('approve')}
                                    onCancel={() => chat.respondPlan('reject')}
                                />
                            )}
                            {wall ? (
                                wall
                            ) : !chat.plan && chat.clarify ? (
                                <ClarifyPicker
                                    clarify={chat.clarify}
                                    onChoose={chat.chooseOption}
                                    onAnswer={chat.answerText}
                                    onSkip={chat.skipClarify}
                                />
                            ) : (
                                <>
                                    {editTarget && (
                                        <div className={styles.editTarget}>
                                            <span className={styles.editTargetLabel}>
                                                About “{editTarget.title}”
                                            </span>
                                            <button
                                                type="button"
                                                className={styles.editTargetClear}
                                                aria-label="Stop asking about this card"
                                                onClick={onClearEditTarget}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}
                                    <PromptForm
                                        variant="chat"
                                        value={follow}
                                        onChange={setFollow}
                                        onSubmit={sendFollow}
                                        placeholder={
                                            chat.plan
                                                ? 'Propose changes or ask a follow up...'
                                                : editTarget
                                                  ? 'Ask about this card...'
                                                  : 'Ask a follow up...'
                                        }
                                        label={
                                            chat.plan
                                                ? 'Propose changes'
                                                : editTarget
                                                  ? 'Ask about this card'
                                                  : 'Ask a follow up'
                                        }
                                        submitLabel="Send"
                                    />
                                </>
                            )}
                            <p className={styles.chatNote}>
                                AI tools can make mistakes, always verify results.
                            </p>
                        </div>
                    )}
                </div>
                <div
                    className={classNames(styles.view, tab === 'activity' && styles.viewActive)}
                    aria-hidden={tab !== 'activity'}
                >
                    <div className={styles.chatScroll}>
                        <ActivityLog activity={chat.activity} onViewCard={onGo} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;
