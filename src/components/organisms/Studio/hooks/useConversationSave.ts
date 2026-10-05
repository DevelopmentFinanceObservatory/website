'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { CanvasDocument } from './useCanvasDocument';
import type { useChat } from './useChat';

import type { CardLayout, SavedConversation } from '@/lib/chat/history';
import { pushConversation } from '@/lib/chat/historyClient';
import type { ShareKind } from '@/lib/chat/shareStore';

type UseConversationSaveArgs = {
    chat: ReturnType<typeof useChat>;
    doc: CanvasDocument;
    // A shared view is a frozen copy — nothing to save, nowhere to.
    readOnly: boolean;
    initialLayout?: CardLayout;
};

/**
 * The conversation as one saveable document (history save, share snapshot):
 * transcript, widgets, activity, the canvas document and the exact card
 * layout. Saves are debounced and keyed by a conversation id minted on the
 * first send; a Chat + Canvas share marks the transcript so everything
 * after stays private.
 */
export const useConversationSave = ({
    chat,
    doc,
    readOnly,
    initialLayout,
}: UseConversationSaveArgs) => {
    const conversationIdRef = useRef<string | null>(null);
    const layoutRef = useRef<CardLayout>(initialLayout ?? {});
    // The layout a (re)opened conversation mounts with — the sheet honours
    // it for newcomers it finds there.
    const [openedLayout, setOpenedLayout] = useState<CardLayout>(initialLayout ?? {});
    const saveTimer = useRef(0);
    const { snapshot: takeChatSnapshot } = chat;
    // The latest saveable state, refreshed by effect (the save fires from a
    // timer, so it can't read render-time values).
    const snapshotRef = useRef<{
        messages: typeof chat.messages;
        widgets: typeof chat.widgets;
        activity: typeof chat.activity;
        doc: Pick<
            CanvasDocument,
            | 'pinnedIds'
            | 'removedIds'
            | 'graceIds'
            | 'graceTurn'
            | 'theme'
            | 'views'
            | 'textCards'
            | 'titles'
            | 'notes'
            | 'conversationTitle'
            | 'shareMarks'
        >;
    } | null>(null);

    const buildSnapshot = useCallback((): SavedConversation | null => {
        const id = conversationIdRef.current;
        const snap = snapshotRef.current;
        const firstUser = snap?.messages.find((message) => message.role === 'user');

        if (!id || !snap || !firstUser) {
            return null;
        }

        return {
            id,
            ...takeChatSnapshot(),
            // Full text — the header clamps visually (two lines); only a
            // runaway prompt is cut, and well past what the header shows.
            title: (snap.doc.conversationTitle ?? firstUser.text).slice(0, 400),
            updatedAt: Date.now(),
            messages: snap.messages,
            widgets: snap.widgets,
            activity: snap.activity,
            pinnedIds: snap.doc.pinnedIds,
            removedIds: snap.doc.removedIds,
            graceIds: snap.doc.graceIds,
            graceTurn: snap.doc.graceTurn,
            layout: layoutRef.current,
            theme: snap.doc.theme,
            views: snap.doc.views,
            textCards: snap.doc.textCards,
            titles: snap.doc.titles,
            notes: snap.doc.notes,
            shareMarks: snap.doc.shareMarks,
        };
    }, [takeChatSnapshot]);

    const persistNow = useCallback(() => {
        const saved = buildSnapshot();

        if (saved) {
            void pushConversation(saved);
        }
    }, [buildSnapshot]);

    const scheduleSave = useCallback(() => {
        if (readOnly) {
            return;
        }

        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(persistNow, 600);
    }, [persistNow, readOnly]);

    // Flush the pending save (leaving the canvas must not lose it).
    const flush = useCallback(() => {
        window.clearTimeout(saveTimer.current);
        persistNow();
    }, [persistNow]);

    useEffect(() => () => window.clearTimeout(saveTimer.current), []);

    // Any change worth keeping (a message, a widget, a pin) refreshes the
    // snapshot and queues a save.
    useEffect(() => {
        snapshotRef.current = {
            messages: chat.messages,
            widgets: chat.widgets,
            activity: chat.activity,
            doc: {
                pinnedIds: doc.pinnedIds,
                removedIds: doc.removedIds,
                graceIds: doc.graceIds,
                graceTurn: doc.graceTurn,
                theme: doc.theme,
                views: doc.views,
                textCards: doc.textCards,
                titles: doc.titles,
                notes: doc.notes,
                conversationTitle: doc.conversationTitle,
                shareMarks: doc.shareMarks,
            },
        };
        scheduleSave();
    }, [
        chat.messages,
        chat.widgets,
        chat.activity,
        doc.pinnedIds,
        doc.removedIds,
        doc.graceIds,
        doc.graceTurn,
        doc.theme,
        doc.views,
        doc.textCards,
        doc.titles,
        doc.notes,
        doc.conversationTitle,
        doc.shareMarks,
        scheduleSave,
    ]);

    // Card moves/resizes come straight from the canvas.
    const handleLayoutChange = useCallback(
        (layout: CardLayout) => {
            layoutRef.current = layout;
            scheduleSave();
        },
        [scheduleSave],
    );

    // Share: mint a frozen public copy of what's on screen (the header's
    // Share for the whole thing, a card's menu for one card).
    const { addShareMark } = doc;
    const createShare = useCallback(
        async (kind: ShareKind, cardId?: string): Promise<string | null> => {
            const saved = buildSnapshot();

            if (!saved) {
                return null;
            }

            try {
                const res = await fetch('/api/share', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ kind, cardId, conversation: saved }),
                });

                if (!res.ok) {
                    return null;
                }

                const body = (await res.json()) as { id?: string };

                // A Chat + Canvas share marks the transcript: everything
                // after this point stays private (the link is a snapshot).
                if (body.id && kind === 'conversation') {
                    addShareMark({
                        messageIndex: saved.messages.length,
                        shareId: body.id,
                        at: Date.now(),
                    });
                }

                return body.id ?? null;
            } catch {
                return null;
            }
        },
        [buildSnapshot, addShareMark],
    );

    // Start tracking a conversation: a fresh id (new prompt) or a saved one.
    const track = useCallback((id: string | null, layout: CardLayout) => {
        conversationIdRef.current = id;
        layoutRef.current = layout;
        setOpenedLayout(layout);
    }, []);

    return {
        openedLayout,
        buildSnapshot,
        flush,
        handleLayoutChange,
        createShare,
        track,
        conversationId: () => conversationIdRef.current,
    };
};
