'use client';

import { useCallback, useState } from 'react';

import type { ShareScope } from './ShareModal';

/**
 * Which Studio dialog is open, and for which card. `seq` is bumped on every
 * opening: it keys the modals so their fields remount from the prefill on
 * OPEN only — the modal stays mounted through its close animation (Radix
 * needs the node to play data-state="closed").
 */
export const useStudioModals = () => {
    const [seq, setSeq] = useState(0);
    const bump = () => setSeq((n) => n + 1);

    // Add / edit a text card: the id being edited, null while adding.
    const [textCardOpen, setTextCardOpen] = useState(false);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    // Rename a card (menu → Edit Title).
    const [cardTitleOpen, setCardTitleOpen] = useState(false);
    const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
    // A card's note (menu → Add Note).
    const [noteOpen, setNoteOpen] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    // The conversation's title (header pencil).
    const [titleOpen, setTitleOpen] = useState(false);
    // Share (the header's, or one card's).
    const [shareOpen, setShareOpen] = useState(false);
    const [shareScope, setShareScope] = useState<ShareScope>({ kind: 'whole' });
    // The Customize drawer.
    const [customizeOpen, setCustomizeOpen] = useState(false);

    const openTextCard = (id: string | null) => {
        setEditingTextId(id);
        bump();
        setTextCardOpen(true);
    };

    const openCardTitle = (id: string) => {
        setEditingTitleId(id);
        bump();
        setCardTitleOpen(true);
    };

    const openNote = (id: string) => {
        setEditingNoteId(id);
        bump();
        setNoteOpen(true);
    };

    const openTitle = () => {
        bump();
        setTitleOpen(true);
    };

    const openShare = (scope: ShareScope) => {
        setShareScope(scope);
        bump();
        setShareOpen(true);
    };

    // Everything shut (a new chat).
    const closeAll = useCallback(() => {
        setTitleOpen(false);
        setCustomizeOpen(false);
        setTextCardOpen(false);
        setEditingTitleId(null);
        setCardTitleOpen(false);
        setEditingNoteId(null);
        setNoteOpen(false);
    }, []);

    return {
        seq,
        textCard: {
            open: textCardOpen,
            setOpen: setTextCardOpen,
            editingId: editingTextId,
            show: openTextCard,
        },
        cardTitle: {
            open: cardTitleOpen,
            setOpen: setCardTitleOpen,
            editingId: editingTitleId,
            show: openCardTitle,
        },
        note: { open: noteOpen, setOpen: setNoteOpen, editingId: editingNoteId, show: openNote },
        title: { open: titleOpen, setOpen: setTitleOpen, show: openTitle },
        share: { open: shareOpen, setOpen: setShareOpen, scope: shareScope, show: openShare },
        customize: { open: customizeOpen, setOpen: setCustomizeOpen },
        closeAll,
    };
};

export type StudioModalsState = ReturnType<typeof useStudioModals>;
