import { useMemo } from 'react';

import { useStudioModel } from '../../../hooks/studioContext';
import { widgetTitle } from '../../../canvas/layout';

import type { Widget } from '@/lib/chat/widgets';
import { overviewOf, type SessionInput } from '@/lib/studio/sessionView';

/**
 * The session panel's inputs from the Studio model. A streaming reply's
 * words stay out of the model (replyStream.ts), so the overview rebuilds on
 * new steps, cards and turns and not on each word of a reply.
 */
export const useSession = () => {
    const model = useStudioModel();
    const { chat, doc, canvas } = model;
    const { messages } = chat;

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
