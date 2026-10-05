'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import { useState } from 'react';

import styles from './CardChrome.module.scss';

import Logo from '@/assets/svg/logo.svg';
import Icon from '@/components/atoms/Icon/Icon';
import type { CardInfo } from '@/lib/chat/widgets';

// A chrome-bar tag ("Source Name", "User Note") with its content in a hover
// popup — the house popup pattern (Radix dropdown on hover), no shadow,
// opens beneath. Without content it's a plain label.
const InfoTag = ({
    label,
    content,
    icon = 'info',
}: {
    label: string;
    content?: string;
    icon?: 'info' | 'note';
}) => {
    const [open, setOpen] = useState(false);

    if (!content) {
        return <span className={styles.source}>{label}</span>;
    }

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className={styles.source}
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                >
                    <Icon
                        name={icon}
                        className={classNames(
                            styles.sourceIcon,
                            icon === 'note' && styles.noteIcon,
                        )}
                    />
                    {label}
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.sourceMenu}
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    collisionPadding={16}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    {content}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};

// The attribution line ("World Development Indicators · 1 indicator"),
// clipped to the card's width; a click opens the More Info panel. Without
// the frame's info (a text card, an older save) it stays the plain tag.
const SourceLine = ({ info, onInfo }: { info: CardInfo; onInfo: () => void }) => (
    <button type="button" className={styles.source} onClick={onInfo}>
        <Icon name="info" className={styles.sourceIcon} />
        <span className={styles.sourceLabel}>
            {info.sourceName ?? info.label}
            {info.indicatorCount > 0 &&
                ` · ${info.indicatorCount} indicator${info.indicatorCount === 1 ? '' : 's'}`}
        </span>
    </button>
);

// Source tag + (when the user added one) a "User Note" tag beside it, and
// Built with on the right.
const CardChrome = ({
    source,
    note,
    info,
    onInfo,
}: {
    source?: string;
    note?: string;
    info?: CardInfo;
    onInfo?: (() => void) | null;
}) => (
    <div className={styles.chrome}>
        <span className={styles.chromeTags}>
            {info && onInfo ? (
                <SourceLine info={info} onInfo={onInfo} />
            ) : (
                <InfoTag label="Source Name" content={source} />
            )}
            {note && (
                <>
                    <span className={styles.chromeDot} aria-hidden="true">
                        ·
                    </span>
                    <InfoTag label="User Note" content={note} icon="note" />
                </>
            )}
        </span>
        <span className={styles.builtWith}>
            Built with
            <Logo />
        </span>
    </div>
);

export default CardChrome;
