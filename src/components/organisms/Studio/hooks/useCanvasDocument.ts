'use client';

import { useCallback, useState } from 'react';

import type { CardView } from '../canvas/layout';
import type { TurnWidget } from './useChat';

import { canvasWidgetsOf } from '@/lib/chat/canvas';
import type { SavedConversation, ShareMark } from '@/lib/chat/history';
import type { TextWidget, Widget } from '@/lib/chat/widgets';
import type { CanvasBaseline } from '@/lib/studio/composition';
import { DEFAULT_THEME, type StudioTheme } from '@/lib/studio/theme';
import { uuid } from '@/lib/uuid';

/**
 * Everything on the canvas that ISN'T the chat: which cards are pinned or
 * removed, per-card views / titles / notes, the user's text cards, the
 * theme, the conversation's title and its share points. Saved with the
 * conversation; reset for a new one; loaded from a saved one. Which harness
 * cards the canvas shows is the harness manifest's (canvasWidgetsOf).
 */
export const useCanvasDocument = (initial?: SavedConversation) => {
    // Pinned cards: the harness keeps them when the model clears the canvas.
    const [pinnedIds, setPinnedIds] = useState<string[]>(initial?.pinnedIds ?? []);
    // The cards the harness never held (text cards, `localIds`) that the
    // user took off the canvas. The harness's manifest decides for its own.
    const [removedIds, setRemovedIds] = useState<string[]>(initial?.removedIds ?? []);
    // A fork's inherited cards, which its harness session never held.
    const [localIds, setLocalIds] = useState<string[]>(initial?.localIds ?? []);
    // A save from before the manifest decided the canvas: the grace set its
    // canvas was drawn with, kept as loaded (legacyCanvasWidgetsOf).
    const [grace, setGrace] = useState<{ ids: string[]; turn: number }>({
        ids: initial?.graceIds ?? [],
        turn: initial?.graceTurn ?? 0,
    });
    // Per-card visualisation from the kebab switcher (chart↔table↔line) —
    // drives the filters/tabs and is saved with the conversation.
    const [views, setViews] = useState<Record<string, CardView>>(initial?.views ?? {});
    // The plot ratio a card's dragged height set (ChartCard), by widget id —
    // saved with the conversation, like the view.
    const [ratios, setRatios] = useState<Record<string, number>>(initial?.ratios ?? {});
    // User-authored text cards (Add Text Card) — local, turn-independent,
    // they stay on the canvas until removed.
    const [textCards, setTextCards] = useState<TextWidget[]>(initial?.textCards ?? []);
    // Renamed card titles (menu → Edit Title) and user notes (menu → Add
    // Note), by widget id.
    const [titles, setTitles] = useState<Record<string, string>>(initial?.titles ?? {});
    const [notes, setNotes] = useState<Record<string, string>>(initial?.notes ?? {});
    // Canvas theme (Customize drawer) — per conversation.
    const [theme, setTheme] = useState<StudioTheme>(initial?.theme ?? DEFAULT_THEME);
    // The conversation's title (header): the first prompt by default, or a
    // user rename (header pencil → Edit Title).
    const [conversationTitle, setConversationTitle] = useState<string | null>(
        initial?.title ?? null,
    );
    // Chat + Canvas share points (see ShareMark).
    const [shareMarks, setShareMarks] = useState<ShareMark[]>([]);

    // A fresh canvas (a new prompt from the landing).
    const reset = useCallback(() => {
        setPinnedIds([]);
        setRemovedIds([]);
        setLocalIds([]);
        setGrace({ ids: [], turn: 0 });
        setViews({});
        setRatios({});
        setTextCards([]);
        setTitles({});
        setNotes({});
        setTheme(DEFAULT_THEME);
        setConversationTitle(null);
        setShareMarks([]);
    }, []);

    // A saved conversation, exactly as it was left.
    const load = useCallback((saved: SavedConversation) => {
        setPinnedIds(saved.pinnedIds);
        setRemovedIds(saved.removedIds);
        setLocalIds(saved.localIds ?? []);
        setGrace({ ids: saved.graceIds ?? [], turn: saved.graceTurn ?? 0 });
        setViews(saved.views ?? {});
        setRatios(saved.ratios ?? {});
        setTextCards(saved.textCards ?? []);
        setTitles(saved.titles ?? {});
        setNotes(saved.notes ?? {});
        setTheme(saved.theme ?? DEFAULT_THEME);
        // The saved title IS the display title (a rename or the first prompt).
        setConversationTitle(saved.title);
        setShareMarks(saved.shareMarks ?? []);
    }, []);

    const togglePin = useCallback(
        (id: string) =>
            setPinnedIds((prev) =>
                prev.includes(id) ? prev.filter((other) => other !== id) : [...prev, id],
            ),
        [],
    );

    const unpin = useCallback(
        (id: string) => setPinnedIds((prev) => prev.filter((other) => other !== id)),
        [],
    );

    // A local card off the canvas (card menu → Remove).
    const removeWidget = useCallback(
        (id: string) => {
            setRemovedIds((prev) => [...prev, id]);
            unpin(id);
        },
        [unpin],
    );

    // Chat chip → Add: a removed local card is un-removed.
    const addWidget = useCallback((id: string) => {
        setRemovedIds((prev) => prev.filter((other) => other !== id));
    }, []);

    // Add or edit a text card (an empty title falls back to "Text Card").
    const upsertTextCard = useCallback((id: string | null, title: string, body: string) => {
        const safeTitle = title || 'Text Card';

        setTextCards((prev) =>
            id
                ? prev.map((card) => (card.id === id ? { ...card, title: safeTitle, body } : card))
                : [...prev, { kind: 'text', id: `text-${uuid()}`, title: safeTitle, body }],
        );
    }, []);

    const setView = useCallback(
        (id: string, view: CardView) => setViews((prev) => ({ ...prev, [id]: view })),
        [],
    );

    const setRatio = useCallback(
        (id: string, ratio: number) => setRatios((prev) => ({ ...prev, [id]: ratio })),
        [],
    );

    const setTitle = useCallback(
        (id: string, title: string) => setTitles((prev) => ({ ...prev, [id]: title })),
        [],
    );

    const setNote = useCallback(
        (id: string, note: string) => setNotes((prev) => ({ ...prev, [id]: note })),
        [],
    );

    const removeNote = useCallback(
        (id: string) =>
            setNotes((prev) => {
                const next = { ...prev };

                delete next[id];

                return next;
            }),
        [],
    );

    const addShareMark = useCallback(
        (mark: ShareMark) => setShareMarks((prev) => [...prev, mark]),
        [],
    );

    // What the canvas shows, through the same rule a share's live checks
    // use, from the harness canvas the chat last saw.
    const visibleWidgets = useCallback(
        (chatWidgets: TurnWidget[], canvas: CanvasBaseline | null): Widget[] =>
            canvasWidgetsOf({
                widgets: chatWidgets,
                canvas,
                localIds,
                pinnedIds,
                removedIds,
                graceIds: grace.ids,
                graceTurn: grace.turn,
                textCards,
            }),
        [localIds, pinnedIds, removedIds, grace, textCards],
    );

    return {
        pinnedIds,
        removedIds,
        localIds,
        graceIds: grace.ids,
        graceTurn: grace.turn,
        views,
        ratios,
        textCards,
        titles,
        notes,
        theme,
        conversationTitle,
        shareMarks,
        setTheme,
        setConversationTitle,
        reset,
        load,
        togglePin,
        unpin,
        removeWidget,
        addWidget,
        upsertTextCard,
        setView,
        setRatio,
        setTitle,
        setNote,
        removeNote,
        addShareMark,
        visibleWidgets,
    };
};

export type CanvasDocument = ReturnType<typeof useCanvasDocument>;
