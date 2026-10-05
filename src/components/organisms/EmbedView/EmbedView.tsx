'use client';

import { useRef } from 'react';

import styles from './EmbedView.module.scss';

import Whiteboard from '@/components/organisms/Studio/canvas/Whiteboard';
import type { SavedConversation } from '@/lib/chat/history';
import { deriveTheme, DEFAULT_THEME, themeVars } from '@/lib/studio/theme';

/**
 * The embeddable sheet (/embed/<id>): the whiteboard alone, read-only, in
 * the theme it was shared with — every card of the snapshot, laid out as
 * saved. Panning and card tooltips work; nothing can be changed.
 */
const EmbedView = ({ saved }: { saved: SavedConversation }) => {
    const theme = deriveTheme(saved.theme ?? DEFAULT_THEME);
    const flyToCardRef = useRef<((id: string) => void) | null>(null);
    const noop = () => undefined;
    const widgets = [
        ...saved.widgets.filter((widget) => !saved.removedIds.includes(widget.id)),
        ...(saved.textCards ?? []).filter((card) => !saved.removedIds.includes(card.id)),
    ];

    return (
        <div className={styles.sheet} style={themeVars(theme) as React.CSSProperties}>
            <Whiteboard
                widgets={widgets}
                pinnedIds={saved.pinnedIds}
                onTogglePin={noop}
                onRemove={noop}
                onAskFollowUp={noop}
                onEditText={noop}
                onEditTitle={noop}
                titles={saved.titles ?? {}}
                notes={saved.notes ?? {}}
                onEditNote={noop}
                onRemoveNote={noop}
                initialLayout={saved.layout}
                flyToCardRef={flyToCardRef}
                theme={theme}
                views={saved.views ?? {}}
                onViewChange={noop}
                onCardInfo={() => {}}
                readOnly
            />
        </div>
    );
};

export default EmbedView;
