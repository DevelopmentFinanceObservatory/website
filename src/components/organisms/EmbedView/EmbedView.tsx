'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './EmbedView.module.scss';

import CardBody from '@/components/organisms/Studio/canvas/cards/CardBody';
import type { CardExtras } from '@/components/organisms/Studio/canvas/cards/types';
import { resolveCardView, widgetTitle } from '@/components/organisms/Studio/canvas/layout';
import LiveNote from '@/components/organisms/Studio/canvas/LiveNote';
import Whiteboard from '@/components/organisms/Studio/canvas/Whiteboard';
import { useLiveCards } from '@/components/organisms/Studio/hooks/useLiveCards';
import CardInfoPanel from '@/components/organisms/Studio/modals/CardInfoPanel';
import { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import { useGridCell } from '@/hooks/useGridCell';
import { canvasWidgetsOf } from '@/lib/chat/canvas';
import type { SavedConversation } from '@/lib/chat/history';
import type { Widget } from '@/lib/chat/widgets';
import { sharedCardAddress } from '@/lib/studio/cardDownload';
import { logRefusedDescriptions } from '@/lib/studio/infoPanel';
import { cardLiveOf, isLiveCanvas, type LiveCanvas, type SharedView } from '@/lib/studio/liveCards';
import { deriveTheme, DEFAULT_THEME, type ThemeDerived, themeVars } from '@/lib/studio/theme';

const noop = () => undefined;

// A one-card share: the card alone, filling the iframe. Read-only — no pin,
// no menu; the legend, tooltips and the source line still work.
const SingleCard = ({
    widget,
    saved,
    theme,
    onCardInfo,
    live,
}: {
    widget: Widget;
    saved: SavedConversation;
    theme: ThemeDerived;
    onCardInfo: (id: string) => void;
    live: LiveCanvas | undefined;
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
        onDownloadImage: null,
        onEdit: noop,
        editLabel: isText ? 'Edit Card' : 'Edit Title',
        note: isText ? undefined : saved.notes?.[widget.id],
        onNote: null,
        onRemoveNote: null,
        onView: noop,
        onShare: null,
        readOnly: true,
        live: cardLiveOf(live, widget.id),
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
 * is the whiteboard alone, read-only, with the cards its canvas shows
 * (`canvasWidgetsOf`, as on /s/<id>) laid out as saved (panning and card
 * tooltips work; nothing can be changed). Either way a card's
 * source line opens its More Info panel. A live share's data cards arrive
 * held and are filled here from the refresh route (see useLiveCards), and
 * the frame says once that its data is live and when its text was written,
 * on a strip under the sheet or the one card.
 */
const EmbedView = ({ shared }: { shared: SharedView }) => {
    const { kind, saved } = shared;

    useEffect(() => {
        logRefusedDescriptions(saved.widgets);
    }, [saved]);

    const theme = deriveTheme(saved.theme ?? DEFAULT_THEME);
    const flyToCardRef = useRef<((id: string) => void) | null>(null);
    const [infoCardId, setInfoCardId] = useState<string | null>(null);
    const { widgets, live } = useLiveCards(shared, canvasWidgetsOf(saved));
    const infoWidget = widgets.find((widget) => widget.id === infoCardId) ?? null;
    const single = kind === 'card' ? widgets[0] : undefined;
    const noted = isLiveCanvas(live);

    return (
        <div
            className={classNames(
                kind === 'card' ? styles.single : styles.sheet,
                kind === 'card' && single?.kind === 'text' && styles.singleText,
                noted && styles.live,
            )}
            style={themeVars(theme) as React.CSSProperties}
        >
            {kind === 'card' ? (
                single && (
                    <SingleCard
                        widget={single}
                        saved={saved}
                        theme={theme}
                        onCardInfo={setInfoCardId}
                        live={live}
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
                    live={live}
                />
            )}

            {noted && <LiveNote live={live} className={styles.noteStrip} />}

            <CardInfoPanel
                info={infoWidget?.info ?? null}
                widget={infoWidget}
                open={infoCardId !== null}
                onOpenChange={(next) => !next && setInfoCardId(null)}
                shared={infoWidget && sharedCardAddress(shared, infoWidget.id)}
                snapshot={
                    shared.live
                        ? undefined
                        : {
                              id: shared.id,
                              servedAt: infoWidget ? shared.servedAt[infoWidget.id] : undefined,
                          }
                }
            />
        </div>
    );
};

export default EmbedView;
