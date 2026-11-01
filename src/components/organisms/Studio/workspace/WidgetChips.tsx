'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import { useId, useState } from 'react';

import styles from './WidgetChips.module.scss';
import { widgetTitle, type CardView } from '../canvas/layout';
import type { TurnWidget } from '../hooks/useChat';

import Icon from '@/components/atoms/Icon/Icon';
import type { Widget } from '@/lib/chat/widgets';
import { cardsSummary, removableIds, type TurnCardRow } from '@/lib/studio/turnCards';

/**
 * The cards a bot turn produced, under its text. One card is one slim row.
 * Several collapse to one row ("6 cards") that opens into a one-line row per
 * card. A row's title flies the canvas to the card. Remove comes up on
 * hovering or focusing the row, and a removed card's row offers Add (puts it
 * back, unpinned). The collapsed row's menu removes them all.
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
    // A shared (read-only) transcript: the rows name the cards and fly to
    // them, with no Add / Remove.
    readOnly?: boolean;
};

// The row's icon shows the card's current visualisation.
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

type GroupIcon = ReturnType<typeof iconOf> | 'menu';

type RowActions = Pick<WidgetChipsProps, 'onGo' | 'onAdd' | 'onRemove' | 'readOnly'>;

// A card's title (the way to the card) and its state action.
const CardRow = ({ row, onGo, onAdd, onRemove, readOnly }: { row: TurnCardRow } & RowActions) => (
    <>
        <button
            type="button"
            className={styles.title}
            onClick={() => onGo(row.id)}
            disabled={!row.added}
            title={row.title}
        >
            {row.title}
        </button>
        {readOnly ? null : row.added ? (
            <button
                type="button"
                className={classNames(styles.iconBtn, styles.remove, styles.onHover)}
                onClick={() => onRemove(row.id)}
                aria-label={`Remove “${row.title}” from the canvas`}
                title="Remove from the canvas"
            >
                <Icon name="remove" className={styles.removeIcon} />
            </button>
        ) : (
            <button
                type="button"
                className={styles.add}
                onClick={() => onAdd(row.id)}
                aria-label={`Add “${row.title}” back to the canvas`}
            >
                <span className={styles.plus} aria-hidden>
                    +
                </span>
                Add
            </button>
        )}
    </>
);

const GroupMenu = ({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) => (
    <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
            <button
                type="button"
                className={classNames(styles.iconBtn, styles.onHover)}
                aria-label="Card actions"
            >
                <Icon name="kebab" className={styles.kebabIcon} />
            </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
            <DropdownMenu.Content
                className={styles.menu}
                side="bottom"
                align="end"
                sideOffset={4}
                collisionPadding={10}
                onCloseAutoFocus={(event) => event.preventDefault()}
            >
                <DropdownMenu.Item asChild onSelect={() => ids.forEach(onRemove)}>
                    <button type="button" className={styles.menuRow}>
                        <Icon name="remove" className={styles.menuIcon} />
                        <span className={styles.menuLabel}>
                            Remove all {ids.length} from the canvas
                        </span>
                    </button>
                </DropdownMenu.Item>
            </DropdownMenu.Content>
        </DropdownMenu.Portal>
    </DropdownMenu.Root>
);

const CardGroup = ({
    rows,
    icon,
    ...actions
}: { rows: TurnCardRow[]; icon: GroupIcon } & RowActions) => {
    const [open, setOpen] = useState(false);
    const listId = useId();
    const removable = removableIds(rows);

    return (
        <div className={classNames(styles.chips, open && styles.chipOpen)}>
            <div className={styles.head}>
                <Icon name={icon} className={styles.kindIcon} />
                <button
                    type="button"
                    className={styles.summary}
                    onClick={() => setOpen((prev) => !prev)}
                    aria-expanded={open}
                    aria-controls={listId}
                >
                    {cardsSummary(rows)}
                </button>
                {!actions.readOnly && removable.length > 0 && (
                    <GroupMenu ids={removable} onRemove={actions.onRemove} />
                )}
                {/* The summary is the keyboard's way in, and the chevron is
                    its picture for the mouse. */}
                <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setOpen((prev) => !prev)}
                    tabIndex={-1}
                    aria-hidden
                >
                    <Icon name="chevron-down" className={styles.chevron} />
                </button>
            </div>
            <div className={styles.list} id={listId} inert={!open}>
                <ul>
                    {rows.map((row) => (
                        <li
                            key={row.id}
                            className={classNames(styles.item, !row.added && styles.off)}
                        >
                            <CardRow row={row} {...actions} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const WidgetChips = ({ widgets, titles, views, onCanvas, ...actions }: WidgetChipsProps) => {
    const rows = widgets.map((widget) => ({
        id: widget.id,
        title: titles[widget.id] ?? widgetTitle(widget),
        added: onCanvas(widget.id),
    }));
    const [first] = widgets;
    const [single, ...rest] = rows;

    if (!first || !single) {
        return null;
    }

    // Cards of one kind show its icon, and a mix shows a plain list.
    const kinds = new Set(widgets.map((widget) => iconOf(widget, views[widget.id])));
    const icon: GroupIcon = kinds.size > 1 ? 'menu' : iconOf(first, views[first.id]);

    if (rest.length > 0) {
        return <CardGroup rows={rows} icon={icon} {...actions} />;
    }

    return (
        <div className={classNames(styles.chips, styles.single, !single.added && styles.off)}>
            <Icon name={icon} className={styles.kindIcon} />
            <CardRow row={single} {...actions} />
        </div>
    );
};

export default WidgetChips;
