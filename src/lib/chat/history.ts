import type { CardView } from '@/components/organisms/Studio/canvas/layout';
import type {
    ActivityEntry,
    ChatMessage,
    TurnWidget,
} from '@/components/organisms/Studio/hooks/useChat';
import type { TextWidget } from '@/lib/chat/widgets';
import type { StudioTheme } from '@/lib/studio/theme';

/**
 * A saved Studio conversation — the whole thing: transcript, canvas widgets
 * (with their turn tags), activity, pin/removal state and the exact card
 * layout, so "My History" can reopen a canvas as it was left. Stored per
 * account on the server (see historyClient.ts / conversationStore.ts).
 */

export type CardLayout = Record<string, { col: number; row: number; w: number; h: number }>;

export type SavedConversation = {
    id: string;
    // The agent's conversation id — restored so follow-ups keep the
    // server-side context while that conversation is still alive.
    sessionId: string | null;
    title: string;
    updatedAt: number;
    messages: ChatMessage[];
    widgets: TurnWidget[];
    // The Activity trace (steps per turn).
    activity?: ActivityEntry[];
    turnCount: number;
    pinnedIds: string[];
    removedIds: string[];
    // Unpinned cards from older turns that are still on the canvas (see
    // useCanvasDocument's grace): without them a reopened conversation — and
    // a share link, which is the same snapshot — drops cards the canvas was
    // showing. Optional: saves from before this didn't have it.
    graceIds?: string[];
    // The turn that grace set belongs to — a later turn makes it stale.
    graceTurn?: number;
    layout: CardLayout;
    // Canvas theme (Customize).
    theme?: StudioTheme;
    // Per-card visualisation picked in the kebab (chart↔table↔line).
    views?: Record<string, CardView>;
    // User-authored text cards (Add Text Card).
    textCards?: TextWidget[];
    // Renamed card titles (menu → Edit Title), by widget id.
    titles?: Record<string, string>;
    // User notes on data cards (menu → Add Note), by widget id.
    notes?: Record<string, string>;
    // Where the transcript was shared (Chat + Canvas): everything from
    // `messageIndex` on is only in the owner's copy — the chat shows a
    // "beyond this point" marker there. A share is a snapshot; nothing after
    // it ever reaches the link.
    shareMarks?: ShareMark[];
};

export type ShareMark = { messageIndex: number; shareId: string; at: number };
