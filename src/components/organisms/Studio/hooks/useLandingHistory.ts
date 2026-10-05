'use client';

import { useEffect, useRef, useState } from 'react';

import type { SavedConversation } from '@/lib/chat/history';
import { type ConversationMeta, fetchConversation, fetchHistory } from '@/lib/chat/historyClient';

type UseLandingHistoryArgs = {
    // The landing is showing (the list is fetched every time it is).
    onLanding: boolean;
    // /studio/<id>: the conversation to open on arrival.
    openId?: string;
    // A share never opens anything from history.
    disabled: boolean;
    onOpen: (saved: SavedConversation) => void;
};

/**
 * The account's conversations for the landing (My History) and the ways
 * into one: a history row, or /studio/<id> on arrival.
 */
export const useLandingHistory = ({
    onLanding,
    openId,
    disabled,
    onOpen,
}: UseLandingHistoryArgs) => {
    const [history, setHistory] = useState<ConversationMeta[]>([]);
    // The history row being fetched (click → open), to ignore double-clicks.
    const [openingId, setOpeningId] = useState<string | null>(null);
    // Latest opener, so the one-shot arrival effect never goes stale.
    const onOpenRef = useRef(onOpen);

    useEffect(() => {
        onOpenRef.current = onOpen;
    }, [onOpen]);

    useEffect(() => {
        if (!onLanding) {
            return;
        }

        let active = true;

        fetchHistory().then((list) => {
            if (active) {
                setHistory(list);
            }
        });

        return () => {
            active = false;
        };
    }, [onLanding]);

    // /studio/<id>: open it as soon as the landing mounts (once).
    const openedRef = useRef(false);

    useEffect(() => {
        if (!openId || disabled || openedRef.current) {
            return;
        }

        openedRef.current = true;
        fetchConversation(openId).then((found) => {
            if (found) {
                onOpenRef.current(found);
            } else {
                // Gone (deleted, or not this account's) — stay on the landing.
                window.history.replaceState(null, '', '/studio');
            }
        });
    }, [openId, disabled]);

    // History row → the full document from the account → open.
    const openHistory = async (item: ConversationMeta) => {
        if (openingId) {
            return;
        }

        setOpeningId(item.id);

        const saved = await fetchConversation(item.id);

        if (saved) {
            setOpeningId(null);
            onOpenRef.current(saved);
        } else {
            setOpeningId(null);
        }
    };

    return { history, openingId, openHistory };
};
