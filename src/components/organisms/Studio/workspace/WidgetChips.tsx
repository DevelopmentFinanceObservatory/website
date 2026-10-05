'use client';

import classNames from 'classnames';
import { useState } from 'react';

import styles from './WidgetChips.module.scss';
import type { CardView } from '../canvas/layout';
import type { TurnWidget } from '../hooks/useChat';

import Icon from '@/components/atoms/Icon/Icon';
import type { Widget } from '@/lib/chat/widgets';

/**
 * The cards a bot turn produced, listed under its text as chips (the demo
 * does the same, one line per card). Each chip names the card and says
 * whether it's on the whiteboard: "Remove" (takes it off the sheet; the
 * title click scrolls to it) or, once removed / dropped by a newer turn,
 * "Add" (puts it back, unpinned). The chevron opens the card's meta (type,
 * source, size).
 */
type WidgetChipsProps = {
    widgets: TurnWidget[];
    // Renamed titles and switched visualisations, by widget id.
    titles: Record<string, string>;
    views: Record<string, CardView>;
    onCanvas: (id: string) => boolean;
    onGo: (id: string) => void;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
    // A shared (read-only) transcript: the chips stay — title, meta, jump to
    // the card — but there's no Add / Remove.
    readOnly?: boolean;
};

const KIND_LABEL: Record<Widget['kind'], string> = {
    key_number: 'Key number',
    chart: 'Chart',
    table: 'Table',
    text: 'Text card',
};

// The chip's icon follows the card's CURRENT visualisation, not its wire type.
const iconOf = (widget: Widget, view?: CardView): 'chart-bar' | 'chart-line' | 'chart-table' => {
    if (view) {
        return view;
    }

    if (widget.kind === 'table') {
        return 'chart-table';
    }

    if (widget.kind === 'chart' && widget.chartType === 'line') {
        return 'chart-line';
    }

    return 'chart-bar';
};

const titleOf = (widget: Widget): string =>
    widget.kind === 'key_number' ? widget.label : widget.title;

// "12 rows · 3 columns", "24 points × 2 series" — the card's shape at a glance.
const sizeOf = (widget: Widget): string | null => {
    if (widget.kind === 'chart') {
        const points = widget.categories.length;
        const series = widget.series.length;

        return `${points} point${points === 1 ? '' : 's'}${
            series > 1 ? ` × ${series} series` : ''
        }`;
    }

    if (widget.kind === 'table') {
        return `${widget.rows.length} row${widget.rows.length === 1 ? '' : 's'} · ${
            widget.columns.length
        } column${widget.columns.length === 1 ? '' : 's'}`;
    }

    return null;
};

const WidgetChip = ({
    widget,
    title,
    view,
    added,
    onGo,
    onAdd,
    onRemove,
    readOnly,
}: {
    widget: TurnWidget;
    title: string;
    view?: CardView;
    added: boolean;
    onGo: () => void;
    onAdd: () => void;
    onRemove: () => void;
    readOnly?: boolean;
}) => {
    const [open, setOpen] = useState(false);
    const kind = view === 'chart-table' ? 'table' : view ? 'chart' : widget.kind;
    const size = sizeOf(widget);

    return (
        <div className={classNames(styles.chip, open && styles.chipOpen)}>
            <div className={styles.row}>
                <Icon name={iconOf(widget, view)} className={styles.kindIcon} />
                {/* The title is the way to the card (as in the demo's chip). */}
                <button
                    type="button"
                    className={styles.title}
                    onClick={onGo}
                    disabled={!added}
                    title={added ? 'Show on the whiteboard' : undefined}
                >
                    {title}
                </button>
                <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setOpen((prev) => !prev)}
                    aria-expanded={open}
                    aria-label={open ? 'Hide details' : 'Show details'}
                >
                    <Icon name="chevron-down" className={styles.chevron} />
                </button>
                {readOnly ? null : added ? (
                    <button type="button" className={styles.remove} onClick={onRemove}>
                        <Icon name="remove" className={styles.stateIcon} />
                        Remove
                    </button>
                ) : (
                    <button type="button" className={styles.add} onClick={onAdd}>
                        <span className={styles.plus} aria-hidden>
                            +
                        </span>
                        Add
                    </button>
                )}
            </div>
            <div className={styles.details}>
                <div className={styles.detailsInner}>
                    <dl className={styles.meta}>
                        <dt>Type</dt>
                        <dd>{KIND_LABEL[kind]}</dd>
                        {size && (
                            <>
                                <dt>Size</dt>
                                <dd>{size}</dd>
                            </>
                        )}
                        {widget.source && (
                            <>
                                <dt>Source</dt>
                                <dd>{widget.source}</dd>
                            </>
                        )}
                        {widget.kind === 'key_number' && (
                            <>
                                <dt>Value</dt>
                                <dd>{[widget.value, widget.unit].filter(Boolean).join(' ')}</dd>
                            </>
                        )}
                    </dl>
                </div>
            </div>
        </div>
    );
};

const WidgetChips = ({
    widgets,
    titles,
    views,
    onCanvas,
    onGo,
    onAdd,
    onRemove,
    readOnly,
}: WidgetChipsProps) => {
    if (widgets.length === 0) {
        return null;
    }

    return (
        <div className={styles.chips}>
            {widgets.map((widget) => (
                <WidgetChip
                    key={widget.id}
                    widget={widget}
                    title={titles[widget.id] ?? titleOf(widget)}
                    view={views[widget.id]}
                    added={onCanvas(widget.id)}
                    onGo={() => onGo(widget.id)}
                    onAdd={() => onAdd(widget.id)}
                    onRemove={() => onRemove(widget.id)}
                    readOnly={readOnly}
                />
            ))}
        </div>
    );
};

export default WidgetChips;
