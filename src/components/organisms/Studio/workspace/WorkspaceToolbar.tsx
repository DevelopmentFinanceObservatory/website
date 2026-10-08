'use client';

import classNames from 'classnames';

import type { ChatTab } from './ChatPanel';
import MoreMenu, { type MoreMenuItem } from './MoreMenu';
import styles from './WorkspaceToolbar.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import SegmentedTabs, {
    type SegmentedTab,
} from '@/components/molecules/SegmentedTabs/SegmentedTabs';

// The title shows at most this many characters, then an ellipsis — however
// long it really is ("Kenya Debt Service Lorem ipsum dolor sit amed" = 45).
const TITLE_MAX_CHARS = 45;

const clipTitle = (title: string) =>
    title.length > TITLE_MAX_CHARS ? `${title.slice(0, TITLE_MAX_CHARS).trimEnd()}…` : title;

const CHAT_TABS = [
    { id: 'chat', label: 'Chat' },
    { id: 'activity', label: 'Activity' },
] as const;

// The phone's one pill: the chat views and the canvas as siblings.
const PHONE_TABS = [
    { id: 'chat', label: 'Chat' },
    { id: 'activity', label: 'Activity' },
    { id: 'canvas', label: 'Canvas' },
] as const;

type WorkspaceToolbarProps = {
    chatTab: ChatTab;
    onChatTab: (tab: ChatTab) => void;
    chatCollapsed: boolean;
    onChatCollapsed: (collapsed: boolean) => void;
    // The card-type filter pills (only when there's something to filter).
    cardTabs: readonly SegmentedTab[] | null;
    cardsTab: string;
    onCardsTab: (id: string) => void;
    // A canvas/card share: no chat behind the toggle — the whole control
    // goes; a read-only sheet can't rename either.
    solo: boolean;
    readOnly: boolean;
    // The conversation's title, over the canvas (desktop/tablet); the pencil
    // opens the rename dialog.
    title: string;
    onEditTitle: () => void;
    // Phone: one Chat / Activity / Canvas pill and the header's actions
    // (New Chat, Customize, Share) tucked behind a ⋮ menu.
    phone: boolean;
    onNewChat: () => void;
    onCustomize: () => void;
    // Absent for a guest (a share needs an account).
    onShare?: () => void;
    // A live share's caption (see LiveNote), placed after the title or alone
    // in the phone's tools row, which a canvas or card share leaves empty.
    note?: React.ReactNode;
};

/**
 * The tools row over the workspace: the Chat/Activity pill and the collapse
 * toggle spanning the chat column, the conversation's title riding the
 * canvas' left edge, the card-type filters at the far right. On a phone the
 * row turns into a Chat / Activity / Canvas switch plus a ⋮ menu, with the
 * filters on a strip over the sheet (the title stays in the bar there).
 */
const WorkspaceToolbar = ({
    chatTab,
    onChatTab,
    chatCollapsed,
    onChatCollapsed,
    cardTabs,
    cardsTab,
    onCardsTab,
    solo,
    readOnly,
    title,
    onEditTitle,
    phone,
    onNewChat,
    onCustomize,
    onShare,
    note,
}: WorkspaceToolbarProps) => {
    if (phone) {
        const view = chatCollapsed ? 'canvas' : chatTab;
        const items: MoreMenuItem[] = [
            { label: 'New Chat', icon: 'ask', onSelect: onNewChat },
            { label: 'Customize', icon: 'edit', onSelect: onCustomize },
            ...(onShare ? [{ label: 'Share', icon: 'share' as const, onSelect: onShare }] : []),
        ];

        return (
            <>
                <div className={classNames(styles.wsTools, styles.wsToolsPhone)}>
                    {!solo && (
                        <SegmentedTabs
                            tabs={PHONE_TABS}
                            value={view}
                            onChange={(id) => {
                                if (id === 'canvas') {
                                    onChatCollapsed(true);
                                } else {
                                    onChatCollapsed(false);
                                    onChatTab(id as ChatTab);
                                }
                            }}
                        />
                    )}
                    {note}
                    {!readOnly && <MoreMenu items={items} />}
                </div>
                {/* The filters ride a strip over the sheet's top edge — only
                    while the sheet is what's on screen. */}
                {cardTabs && (solo || chatCollapsed) && (
                    <div className={styles.cardTabsPhone}>
                        <SegmentedTabs tabs={cardTabs} value={cardsTab} onChange={onCardsTab} />
                    </div>
                )}
            </>
        );
    }

    return (
        <div className={classNames(styles.wsTools, solo && styles.wsToolsSolo)}>
            <div
                className={classNames(
                    styles.wsToolsLeft,
                    chatCollapsed && styles.wsToolsLeftCollapsed,
                    solo && styles.wsToolsLeftGone,
                )}
            >
                <div
                    className={classNames(styles.chatTabs, chatCollapsed && styles.chatTabsHidden)}
                >
                    <SegmentedTabs
                        tabs={CHAT_TABS}
                        value={chatTab}
                        onChange={(id) => onChatTab(id as ChatTab)}
                    />
                </div>
                <button
                    type="button"
                    className={styles.chatCollapse}
                    data-collapsed={chatCollapsed}
                    aria-label={chatCollapsed ? 'Expand chat' : 'Collapse chat'}
                    onClick={() => onChatCollapsed(!chatCollapsed)}
                >
                    <Icon name="collapse" />
                </button>
            </div>
            <p
                className={classNames(
                    styles.title,
                    chatCollapsed && styles.titleShifted,
                    solo && styles.titleSolo,
                )}
                title={title}
            >
                <span className={styles.titleText}>{clipTitle(title)}</span>
                {!readOnly && (
                    <button
                        type="button"
                        className={styles.editTitle}
                        aria-label="Rename"
                        onClick={onEditTitle}
                    >
                        <Icon name="edit-title" />
                    </button>
                )}
                {note && <span className={styles.titleNote}>{note}</span>}
            </p>
            {cardTabs && (
                <div className={styles.cardTabs}>
                    <SegmentedTabs tabs={cardTabs} value={cardsTab} onChange={onCardsTab} />
                </div>
            )}
        </div>
    );
};

export default WorkspaceToolbar;
