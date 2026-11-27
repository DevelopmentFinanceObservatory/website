'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { type ReplyStream, streamedText } from '@/lib/studio/replyStream';

const noSubscription = () => () => {};

const useSubscribe = (stream: ReplyStream | undefined) => {
    const store = stream?.store;

    return useCallback(
        (listener: () => void) => store?.subscribe(listener) ?? noSubscription(),
        [store],
    );
};

/**
 * Page turn `turn`'s reply as drawn, `committed` followed by what has
 * streamed in since its transcript's commit (streamedText). The component
 * that calls it re-renders on each delta of that reply; one passed no
 * stream draws `committed`.
 */
export const useStreamedText = (
    stream: ReplyStream | undefined,
    turn: number,
    committed: string,
): string =>
    useSyncExternalStore(
        useSubscribe(stream),
        () => streamedText(stream, turn, committed),
        () => committed,
    );

/**
 * Whether words have streamed into page turn `turn`'s reply since the
 * transcript's last commit. The component that calls it re-renders when the
 * first words arrive, and on no later delta.
 */
export const useStreamedWords = (stream: ReplyStream, turn: number | null): boolean =>
    useSyncExternalStore(
        useSubscribe(stream),
        () => turn !== null && stream.store.since(turn, stream.at).trim() !== '',
        () => false,
    );
