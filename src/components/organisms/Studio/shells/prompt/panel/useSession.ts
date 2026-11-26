import { useMemo, useState } from 'react';

import { useStudioModel } from '../../../hooks/studioContext';
import { widgetTitle } from '../../../canvas/layout';
import type { ChatMessage } from '../../../hooks/useChat';

import type { Widget } from '@/lib/chat/widgets';
import { overviewOf, type SessionInput } from '@/lib/studio/sessionView';

// While a reply streams, its text changes on every delta. The panel reads
// only whether the reply has begun, so the streaming message stands in as
// an empty or a one-character reply.
const steadyOf = (messages: ChatMessage[], thinking: boolean): ChatMessage[] => {
    const last = messages.at(-1);

    if (!thinking || last?.role !== 'bot') return messages;

    return [...messages.slice(0, -1), { ...last, text: last.text ? '…' : '' }];
};

const sameSteady = (a: readonly ChatMessage[], b: readonly ChatMessage[]): boolean => {
    if (a.length !== b.length) return false;

    return a.every((message, at) => {
        const other = b[at];

        if (message === other) return true;

        return (
            at === a.length - 1 &&
            message.role === 'bot' &&
            other?.role === 'bot' &&
            message.text === other.text &&
            message.plan === other.plan
        );
    });
};

/**
 * The session panel's inputs from the Studio model, with a streaming
 * reply's text held out, so the overview rebuilds on new steps, cards and
 * turns and not on each word of a reply.
 */
export const useSession = () => {
    const model = useStudioModel();
    const { chat, doc, canvas } = model;
    const next = steadyOf(chat.messages, chat.thinking);
    const [messages, setMessages] = useState(next);

    if (!sameSteady(messages, next)) setMessages(next);

    const canvasKey = canvas.widgets.map((widget) => widget.id).join('\n');
    const canvasIds = useMemo(() => (canvasKey ? canvasKey.split('\n') : []), [canvasKey]);
    const { titles, views, textCards, replacedIds } = doc;

    const input = useMemo<SessionInput>(() => {
        const byId = new Map<string, Widget>([
            ...chat.widgets.map((widget): [string, Widget] => [widget.id, widget]),
            ...textCards.map((widget): [string, Widget] => [widget.id, widget]),
        ]);

        return {
            messages,
            widgets: chat.widgets,
            activity: chat.activity,
            plan: chat.plan,
            clarify: chat.clarify,
            thinking: chat.thinking,
            canvasIds,
            titleOf: (id) => {
                const widget = byId.get(id);

                return titles[id] ?? (widget ? widgetTitle(widget) : 'Card');
            },
            views,
            replaced: replacedIds,
        };
    }, [
        messages,
        chat.widgets,
        chat.activity,
        chat.plan,
        chat.clarify,
        chat.thinking,
        canvasIds,
        textCards,
        titles,
        views,
        replacedIds,
    ]);
    const overview = useMemo(() => overviewOf(input), [input]);

    return { input, overview };
};
