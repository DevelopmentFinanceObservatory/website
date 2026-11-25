'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import classNames from 'classnames';
import {
    type RefObject,
    type SyntheticEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import styles from './CardActions.module.scss';
import type { CardExtras } from './types';
import chatStyles from '../../workspace/ChatPanel.module.scss';
import UnitChoice from '../../workspace/UnitChoice';

import Icon, { type IconProps } from '@/components/atoms/Icon/Icon';
import { useIsPhone } from '@/hooks/useMediaQuery';
import type { UnitChoice as Unit, UnitOffer } from '@/lib/studio/wire';

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

// The download control, on the card itself beside the pin. It used to be two
// rows of the ⋮ menu, and readers reported not finding it there. Its press
// opens a menu of the two things a card can give: its data (the rows behind
// it, via the Download Data dialog) and its image (the card as a PNG). A
// card that offers neither — a text card already gone from the sheet — has
// no button.
const DownloadMenu = ({
    onDownload,
    onDownloadImage,
}: Pick<CardExtras, 'onDownload' | 'onDownloadImage'>) =>
    !onDownload && !onDownloadImage ? null : (
        <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
                <button type="button" className={styles.menuBtn} aria-label="Download">
                    <Icon name="download" className={styles.actionIcon} />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.cardMenu}
                    side="bottom"
                    align="end"
                    sideOffset={4}
                    collisionPadding={16}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    <div className={styles.cardMenuSection}>
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
                    </div>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );

// The ⋮ card menu, riding the house Radix popup like the search slot menus.
// Every row is wired: More Info, pin/unpin, share (link/embed of this card),
// a prefilled chat follow-up, the unit panel (UnitPanel) on a card whose
// frame offers other units, title edit, live view switching and remove.
// Downloads are the button beside the pin (DownloadMenu). (Reorder from the
// mock has no API behind it — not shown.)
//
// Change unit opens its panel once the menu has gone. Opened from the row's
// select, the panel mounts while the menu still holds focus, and at phone
// width it mounts under the pointer: the pointer leaving the row hands focus
// back to the menu, which the panel reads as focus outside and closes on.
// The menu's close-focus event comes after its content has unmounted.
const CardMenu = ({
    onOpenUnit,
    pinned,
    view,
    viewChoices,
    onPin,
    onRemove,
    onAsk,
    onInfo,
    onShare,
    onEdit,
    editLabel,
    note,
    onNote,
    onRemoveNote,
    onView,
}: CardExtras & { onOpenUnit: (() => void) | null }) => {
    const unitAfterClose = useRef(false);

    return (
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
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();

                        if (unitAfterClose.current) {
                            unitAfterClose.current = false;
                            onOpenUnit?.();
                        }
                    }}
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
                        {onShare && (
                            <MenuRow icon="share" onSelect={onShare}>
                                Share
                            </MenuRow>
                        )}
                        <MenuRow icon="ask" onSelect={onAsk}>
                            Ask follow up
                        </MenuRow>
                        {onOpenUnit && (
                            <MenuRow
                                icon="unit"
                                onSelect={() => {
                                    unitAfterClose.current = true;
                                }}
                            >
                                Change unit
                            </MenuRow>
                        )}
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
};

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

// The press events a portalled panel would otherwise hand up the React tree
// to the card (its drag) and the board (its pan and its click ripple).
const keepPress = (event: SyntheticEvent) => event.stopPropagation();

// The card's Change unit panel: the unit chips, starting on the card's unit,
// with Send dimmed until a chip moves and no Skip. It hangs beside the card,
// or, on a phone, drops from the card's head over the card. Send, Escape, a
// press outside (a card drag and a board pan start with one) and any scroll
// of the board close it.
const UnitPanel = ({
    actionsRef,
    offer,
    onSend,
    onClose,
}: {
    actionsRef: RefObject<HTMLDivElement | null>;
    offer: UnitOffer;
    onSend: (unit: Unit) => void;
    onClose: () => void;
}) => {
    const isPhone = useIsPhone();
    // Radix measures the anchor when it places the panel: the whole card on
    // a wide screen, the head's buttons on a phone.
    const anchor = useMemo(
        () => ({
            current: {
                getBoundingClientRect: () => {
                    const actions = actionsRef.current;
                    const card = actions?.closest('[data-card-box]');

                    return (
                        (isPhone ? actions : (card ?? actions))?.getBoundingClientRect() ??
                        new DOMRect()
                    );
                },
            },
        }),
        [actionsRef, isPhone],
    );

    // A scroll of anything holding the card (the board's pan, the page)
    // moves the card from under the panel. Scroll events do not bubble, so
    // they are heard at capture; the chat's own scrolling leaves it open.
    useEffect(() => {
        const close = (event: Event) => {
            const actions = actionsRef.current;

            if (
                event.target === document ||
                (event.target instanceof Node && actions && event.target.contains(actions))
            ) {
                onClose();
            }
        };

        document.addEventListener('scroll', close, { capture: true, passive: true });

        return () => document.removeEventListener('scroll', close, { capture: true });
    }, [actionsRef, onClose]);

    return (
        <>
            <Popover.Anchor virtualRef={anchor} />
            <Popover.Portal>
                <Popover.Content
                    className={classNames(chatStyles.picker, styles.unitPanel)}
                    side={isPhone ? 'bottom' : 'right'}
                    align={isPhone ? 'end' : 'start'}
                    sideOffset={isPhone ? 4 : -4}
                    alignOffset={isPhone ? 0 : 14}
                    collisionPadding={16}
                    aria-label="Change unit"
                    onCloseAutoFocus={(event) => {
                        // Focus goes back to the card menu that opened the panel.
                        event.preventDefault();
                        actionsRef.current
                            ?.querySelector<HTMLElement>('[aria-label="Card menu"]')
                            ?.focus({ preventScroll: true });
                    }}
                    onPointerDown={keepPress}
                    onPointerMove={keepPress}
                    onPointerUp={keepPress}
                    onClick={keepPress}
                >
                    <div className={chatStyles.pickerHead}>
                        <p className={chatStyles.pickerQuestion}>
                            Which unit should this card use?
                        </p>
                    </div>
                    <UnitChoice offer={offer} onSend={onSend} sendDisabledUntilChanged />
                </Popover.Content>
            </Popover.Portal>
        </>
    );
};

// Download + pin + kebab, 1px apart, top-right of every card (none on a
// read-only sheet). The card's unit panel opens from the menu and anchors
// here.
const CardActions = (extras: CardExtras) => {
    const [unitOpen, setUnitOpen] = useState(false);
    const actionsRef = useRef<HTMLDivElement>(null);
    const { unitOffer, onChangeUnit } = extras;
    const unit = unitOffer && onChangeUnit ? { offer: unitOffer, send: onChangeUnit } : null;
    const closeUnit = useCallback(() => setUnitOpen(false), []);

    if (extras.readOnly) {
        return null;
    }

    return (
        <Popover.Root open={unitOpen && !!unit} onOpenChange={setUnitOpen}>
            {/* Out of the card's own picture (lib/studio/cardImage): the
                download button, the pin and the menu belong to the canvas,
                not to the card's content. */}
            <div ref={actionsRef} className={styles.cardActions} data-no-export="">
                <DownloadMenu
                    onDownload={extras.onDownload}
                    onDownloadImage={extras.onDownloadImage}
                />
                <PinButton pinned={extras.pinned} onPin={extras.onPin} />
                <CardMenu {...extras} onOpenUnit={unit ? () => setUnitOpen(true) : null} />
            </div>
            {unit && unitOpen && (
                <UnitPanel
                    actionsRef={actionsRef}
                    offer={unit.offer}
                    onSend={(picked) => {
                        setUnitOpen(false);
                        unit.send(picked);
                    }}
                    onClose={closeUnit}
                />
            )}
        </Popover.Root>
    );
};

export default CardActions;
