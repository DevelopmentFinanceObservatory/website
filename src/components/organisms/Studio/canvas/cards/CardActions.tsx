'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';

import styles from './CardActions.module.scss';
import type { CardExtras } from './types';

import Icon, { type IconProps } from '@/components/atoms/Icon/Icon';

// A card carrying a user's note says so here, beside the pin. It is a mark,
// not a control: the words come up on hovering the card (CardNote) and the
// menu below edits them.
const NoteMark = () => (
    <span className={styles.noteMark} aria-hidden="true">
        <Icon name="note" className={styles.noteMarkIcon} />
    </span>
);

const PinButton = ({ pinned, onPin }: Pick<CardExtras, 'pinned' | 'onPin'>) => (
    <button
        type="button"
        className={classNames(styles.pinBtn, pinned && styles.pinActive)}
        aria-label={pinned ? 'Unpin card' : 'Pin card'}
        aria-pressed={pinned}
        onClick={onPin}
    >
        <Icon name="pin" className={styles.actionIcon} />
    </button>
);

// The ⋮ card menu, riding the house Radix popup like the search slot menus.
// Every row is wired: More Info, pin/unpin, Download Data, share (link/embed
// of this card), a prefilled chat follow-up, title edit, live view switching
// and remove. (Reorder from the mock has no API behind it — not shown.)
const CardMenu = ({
    pinned,
    view,
    viewChoices,
    onPin,
    onRemove,
    onAsk,
    onInfo,
    onDownload,
    onDownloadImage,
    onShare,
    onEdit,
    editLabel,
    note,
    onNote,
    onRemoveNote,
    onView,
}: CardExtras) => (
    <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
            <button type="button" className={styles.menuBtn} aria-label="Card menu">
                <Icon name="kebab" className={styles.actionIcon} />
            </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
            <DropdownMenu.Content
                className={styles.cardMenu}
                side="right"
                align="start"
                sideOffset={4}
                collisionPadding={16}
                onCloseAutoFocus={(event) => event.preventDefault()}
            >
                <div className={styles.cardMenuSection}>
                    {/* First, and in the menu at all: the attribution line
                        was the only way in, and it reads as a caption rather
                        than a control (QA-21). */}
                    {onInfo && (
                        <MenuRow icon="info" onSelect={onInfo}>
                            More Info
                        </MenuRow>
                    )}
                    <MenuRow icon="pin" onSelect={onPin}>
                        {pinned ? 'Unpin from Canvas' : 'Pin to Canvas'}
                    </MenuRow>
                    {onDownload && (
                        <MenuRow icon="download" onSelect={onDownload}>
                            Download Data
                        </MenuRow>
                    )}
                    {onDownloadImage && (
                        <MenuRow icon="download" onSelect={onDownloadImage}>
                            Download Image
                        </MenuRow>
                    )}
                    {onShare && (
                        <MenuRow icon="share" onSelect={onShare}>
                            Share
                        </MenuRow>
                    )}
                    <MenuRow icon="ask" onSelect={onAsk}>
                        Ask follow up
                    </MenuRow>
                    <MenuRow icon="edit" onSelect={onEdit}>
                        {editLabel}
                    </MenuRow>
                    {onNote && (
                        <MenuRow icon="note" onSelect={onNote}>
                            {note ? 'Edit Note' : 'Add Note'}
                        </MenuRow>
                    )}
                    {note && onRemoveNote && (
                        <MenuRow icon="note-remove" onSelect={onRemoveNote}>
                            Remove Note
                        </MenuRow>
                    )}
                </div>
                {viewChoices.length > 0 && (
                    <div className={classNames(styles.cardMenuSection, styles.cardMenuTypes)}>
                        {viewChoices.map((type) => (
                            <DropdownMenu.Item key={type} asChild onSelect={() => onView(type)}>
                                <button
                                    type="button"
                                    aria-label={`View as ${type.replace('chart-', '')}`}
                                    className={classNames(
                                        styles.cardMenuType,
                                        type === view && styles.cardMenuTypeActive,
                                    )}
                                >
                                    <Icon name={type} className={styles.cardMenuIcon} />
                                </button>
                            </DropdownMenu.Item>
                        ))}
                    </div>
                )}
                <div className={styles.cardMenuSection}>
                    <MenuRow icon="remove" onSelect={onRemove} danger>
                        Remove
                    </MenuRow>
                </div>
            </DropdownMenu.Content>
        </DropdownMenu.Portal>
    </DropdownMenu.Root>
);

// One menu row: icon + label (red for the destructive one).
const MenuRow = ({
    icon,
    onSelect,
    danger,
    children,
}: {
    icon: IconProps['name'];
    onSelect: () => void;
    danger?: boolean;
    children: React.ReactNode;
}) => (
    <DropdownMenu.Item asChild onSelect={onSelect}>
        <button
            type="button"
            className={classNames(styles.cardMenuRow, danger && styles.cardMenuDanger)}
        >
            <Icon
                name={icon}
                className={classNames(
                    styles.cardMenuIcon,
                    icon === 'info' && styles.cardMenuIconTight,
                )}
            />
            <span className={styles.cardMenuLabel}>{children}</span>
        </button>
    </DropdownMenu.Item>
);

// Pin + kebab, 1px apart, top-right of every card (none on a read-only
// sheet), with the note mark ahead of them when there is a note to mark.
const CardActions = (extras: CardExtras) =>
    extras.readOnly ? null : (
        // Out of the card's own picture (lib/studio/cardImage): the pin and
        // the menu belong to the canvas, not to the card's content.
        <div className={styles.cardActions} data-no-export="">
            {extras.note && <NoteMark />}
            <PinButton pinned={extras.pinned} onPin={extras.onPin} />
            <CardMenu {...extras} />
        </div>
    );

export default CardActions;
