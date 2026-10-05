'use client';

import classNames from 'classnames';
import { useRef, useState } from 'react';

import styles from './EmbedView.module.scss';

import CardBody from '@/components/organisms/Studio/canvas/cards/CardBody';
import type { CardExtras } from '@/components/organisms/Studio/canvas/cards/types';
import { resolveCardView, widgetTitle } from '@/components/organisms/Studio/canvas/layout';
import Whiteboard from '@/components/organisms/Studio/canvas/Whiteboard';
import CardInfoPanel from '@/components/organisms/Studio/modals/CardInfoPanel';
import { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import { useGridCell } from '@/hooks/useGridCell';
import type { SavedConversation } from '@/lib/chat/history';
import type { ShareKind } from '@/lib/chat/sharePrune';
import type { Widget } from '@/lib/chat/widgets';
import { deriveTheme, DEFAULT_THEME, type ThemeDerived, themeVars } from '@/lib/studio/theme';

export type EmbedKind = Exclude<ShareKind, 'search'>;

const noop = () => undefined;

// A one-card share: the card alone, filling the iframe. Read-only — no pin,
// no menu; the legend, tooltips and the source line still work.
const SingleCard = ({
    widget,
    saved,
    theme,
    onCardInfo,
}: {
    widget: Widget;
    saved: SavedConversation;
    theme: ThemeDerived;
    onCardInfo: (id: string) => void;
}) => {
    // Chart.js px ride the same fluid factor as on the whiteboard.
    const scale = useGridCell() / GRID_CELL;
    const isText = widget.kind === 'text';
    const { view, choices, chartSource } = resolveCardView(widget, saved.views?.[widget.id]);
    const extras: CardExtras = {
        pinned: saved.pinnedIds.includes(widget.id),
        title: saved.titles?.[widget.id] ?? widgetTitle(widget),
        view,
        viewChoices: choices,
        onPin: noop,
        onRemove: noop,
        onAsk: noop,
        onInfo: isText ? null : () => onCardInfo(widget.id),
        onDownload: null,
        onEdit: noop,
        editLabel: isText ? 'Edit Card' : 'Edit Title',
        note: isText ? undefined : saved.notes?.[widget.id],
        onNote: null,
        onRemoveNote: null,
        onView: noop,
        onShare: null,
        readOnly: true,
    };

    return (
        <CardBody
            widget={widget}
            view={view}
            chartSource={chartSource}
            scale={scale}
            theme={theme}
            // A text card's fit-to-content only sizes a whiteboard slot;
            // here the card grows by CSS and the frame scrolls (.singleText).
            widthCells={saved.layout?.[widget.id]?.w ?? 0}
            onFit={noop}
            extras={extras}
        />
    );
};

/**
 * The embeddable view (/embed/<id>), in the theme it was shared with. A card
 * share is that one card filling the frame; a canvas or conversation share
 * is the whiteboard alone, read-only, every card laid out as saved (panning
 * and card tooltips work; nothing can be changed). Either way a card's
 * source line opens its More Info panel.
 */
const EmbedView = ({ kind, saved }: { kind: EmbedKind; saved: SavedConversation }) => {
    const theme = deriveTheme(saved.theme ?? DEFAULT_THEME);
    const flyToCardRef = useRef<((id: string) => void) | null>(null);
    const [infoCardId, setInfoCardId] = useState<string | null>(null);
    const widgets = [
        ...saved.widgets.filter((widget) => !saved.removedIds.includes(widget.id)),
        ...(saved.textCards ?? []).filter((card) => !saved.removedIds.includes(card.id)),
    ];
    const infoWidget = widgets.find((widget) => widget.id === infoCardId) ?? null;
    const single = kind === 'card' ? widgets[0] : undefined;

    return (
        <div
            className={
                kind === 'card'
                    ? classNames(styles.single, single?.kind === 'text' && styles.singleText)
                    : styles.sheet
            }
            style={themeVars(theme) as React.CSSProperties}
        >
            {kind === 'card' ? (
                single && (
                    <SingleCard
                        widget={single}
                        saved={saved}
                        theme={theme}
                        onCardInfo={setInfoCardId}
                    />
                )
            ) : (
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
                    onCardInfo={setInfoCardId}
                    focusedId={infoCardId}
                    readOnly
                />
            )}

            <CardInfoPanel
                info={infoWidget?.info ?? null}
                widget={infoWidget}
                open={infoCardId !== null}
                onOpenChange={(next) => !next && setInfoCardId(null)}
            />
        </div>
    );
};

export default EmbedView;
