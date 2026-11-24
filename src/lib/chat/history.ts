import type { CardView } from '@/components/organisms/Studio/canvas/layout';
import type { ChatMessage, TurnWidget } from '@/components/organisms/Studio/hooks/useChat';
import type { CardRef, TextWidget } from '@/lib/chat/widgets';
import type { ActivityEntry } from '@/lib/studio/activity';
import type { CanvasBaseline } from '@/lib/studio/composition';
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
    // Refs known to this session; inherited cards in a shared copy are excluded.
    componentRefs?: CardRef[];
    title: string;
    updatedAt: number;
    messages: ChatMessage[];
    widgets: TurnWidget[];
    // The Activity trace (steps per turn).
    activity?: ActivityEntry[];
    turnCount: number;
    // The harness canvas the conversation last saw (useChat's canvasRef):
    // its ids are the harness cards the canvas shows (canvasWidgetsOf).
    // Optional: saves from before this didn't have it.
    canvas?: CanvasBaseline | null;
    // A fork's inherited cards, which the harness session never held and no
    // manifest of the fork names. Optional: only a fork has them.
    localIds?: string[];
    pinnedIds: string[];
    // The cards the harness never held (`localIds`, text cards) that the
    // user took off the canvas. A save from before `canvas`, or whose
    // `canvas` has no `pinned`, also lists harness cards here, and they stay
    // off its canvas (canvasWidgetsOf).
    removedIds: string[];
    // In a save from before `canvas`, the unpinned cards of older turns its
    // canvas still showed, and the turn that set belongs to (a later turn
    // made it stale). Only the legacy rule reads them (legacyCanvasWidgetsOf).
    graceIds?: string[];
    graceTurn?: number;
    layout: CardLayout;
    // Canvas theme (Customize).
    theme?: StudioTheme;
    // Per-card visualisation picked in the kebab (chart↔table↔line).
    views?: Record<string, CardView>;
    // The plot ratio (width over height) a card's dragged height set, by
    // widget id; a card without one holds the default (chartFit).
    ratios?: Record<string, number>;
    // User-authored text cards (Add Text Card).
    textCards?: TextWidget[];
    // Renamed card titles (menu → Edit Title), by widget id.
    titles?: Record<string, string>;
    // User notes on data cards (menu → Add Note), by widget id.
    notes?: Record<string, string>;
    // Where the transcript was shared (Chat + Canvas): what came after the
    // share is only in the owner's copy — the chat shows a "beyond this
    // point" marker there (see shareMarkAfter). A share is a snapshot;
    // nothing after it ever reaches the link.
    shareMarks?: ShareMark[];
    // The writer that built this snapshot (a random id minted once per
    // useConversationSave mount) and the snapshot's sequence number from it.
    // The server ignores a save whose stored row has the same writer and a
    // higher number, and always writes a document without both fields. A
    // copy into another conversation (forkOf, pruneForShare) drops both.
    saveWriter?: string;
    saveSeq?: number;
};

export type ShareMark = {
    messageIndex: number;
    shareId: string;
    at: number;
    // User messages (prompts and answers) the share held — where the marker
    // goes (see shareMarkAfter). Optional: marks from before this didn't
    // have it.
    userMessages?: number;
    // The page's turn count when shared: a turn stamped later sits beyond
    // the mark wherever a state read placed it (see shareMarkAfter).
    // Optional: marks from before this didn't have it.
    turnCount?: number;
};
