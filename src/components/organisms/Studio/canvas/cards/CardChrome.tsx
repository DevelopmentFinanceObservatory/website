'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import { useState } from 'react';

import styles from './CardChrome.module.scss';

import Logo from '@/assets/svg/logo.svg';
import Icon from '@/components/atoms/Icon/Icon';
import { type CardInfo, sourceLine } from '@/lib/chat/widgets';
import { leftOutOf } from '@/lib/studio/liveCards';

// A chrome-bar tag ("Source Name") with its content in a hover popup — the
// house popup pattern (Radix dropdown on hover), no shadow, opens beneath.
// Without content it's a plain label.
const InfoTag = ({ label, content }: { label: string; content?: string }) => {
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
                    <Icon name="info" className={styles.sourceIcon} />
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

// The attribution line: the source name, or every source's joined on a card
// citing several, with the indicator count on its own line under it. A click
// opens the More Info panel, which the card menu also offers. Without the
// frame's info (a text card, an older save) it stays the plain tag.
const SourceLine = ({ info, onInfo }: { info: CardInfo; onInfo: () => void }) => (
    <button
        type="button"
        className={classNames(styles.source, styles.sourceAction)}
        aria-label="More Info about this card"
        onClick={onInfo}
    >
        <Icon name="info" className={styles.sourceIcon} />
        <span className={styles.sourceLabel}>
            <span className={styles.sourceName}>{sourceLine(info)}</span>
            {info.indicatorCount > 0 && (
                <span className={styles.sourceCount}>
                    {`${info.indicatorCount} indicator${info.indicatorCount === 1 ? '' : 's'}`}
                </span>
            )}
        </span>
    </button>
);

// What the card's data leaves out, on one line above the source. It shows
// the first gap in the platform's words, clipped to the card's width, and
// how many more there are. A click opens More Info, which lists every one in
// full.
const LeftOutLine = ({ leftOut, onInfo }: { leftOut: string[]; onInfo?: (() => void) | null }) => {
    const line = (
        <>
            <span className={styles.leftOutLabel}>{leftOut[0]}</span>
            {leftOut.length > 1 && (
                <span className={styles.leftOutMore}>+{leftOut.length - 1} more</span>
            )}
        </>
    );

    return onInfo ? (
        <button type="button" className={styles.leftOut} data-left-out="" onClick={onInfo}>
            {line}
        </button>
    ) : (
        <p className={styles.leftOut} data-left-out="">
            {line}
        </p>
    );
};

type CardChromeProps = {
    source?: string;
    info?: CardInfo;
    onInfo?: (() => void) | null;
};

// The card's foot holds what its data leaves out (`info.leftOut`), then the bar.
const CardChrome = (bar: CardChromeProps) => {
    const leftOut = leftOutOf(bar.info);

    return leftOut.length > 0 ? (
        <div className={styles.foot}>
            <LeftOutLine leftOut={leftOut} onInfo={bar.onInfo} />
            <ChromeBar {...bar} />
        </div>
    ) : (
        <ChromeBar {...bar} />
    );
};

// The source tag, and Built with on the right. A user's note used to sit
// here too, as a "User Note" tag; it is now the mark beside the pin (see
// CardActions) with the words themselves on hovering the card (CardNote).
const ChromeBar = ({ source, info, onInfo }: CardChromeProps) => (
    <div className={styles.chrome}>
        <span className={styles.chromeTags}>
            {info && onInfo ? (
                <SourceLine info={info} onInfo={onInfo} />
            ) : (
                <InfoTag label="Source Name" content={source} />
            )}
        </span>
        <span className={styles.builtWith}>
            Built with
            <Logo />
        </span>
    </div>
);

export default CardChrome;
