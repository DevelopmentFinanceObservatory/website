'use client';

import styles from './CardChrome.module.scss';

import Logo from '@/assets/svg/logo.svg';
import Icon from '@/components/atoms/Icon/Icon';
import HoverPopup from '@/components/molecules/HoverPopup/HoverPopup';
import { type CardInfo, sourceLine } from '@/lib/chat/widgets';
import { leftOutOf } from '@/lib/studio/liveCards';

// A chrome-bar tag ("Source Name") with its content in the house popup.
// Without content it's a plain label.
const InfoTag = ({ label, content }: { label: string; content?: string }) =>
    content ? (
        <HoverPopup
            label={label}
            triggerClassName={styles.source}
            contentClassName={styles.sourceMenu}
            trigger={
                <>
                    <Icon name="info" className={styles.sourceIcon} />
                    {label}
                </>
            }
        >
            {content}
        </HoverPopup>
    ) : (
        <span className={styles.source}>{label}</span>
    );

// The attribution line: "Source:" and the first source's name, how many more
// the card cites, and an info mark at its end. A card DFO computed from
// sources it credits none of reads "Source: DFO calculation". A click
// anywhere on it opens the More Info panel, which lists
// every source in full; a card that names no source shows the mark alone.
// Without the frame's info (a text card, an older save) the bar keeps the
// plain tag.
const SourceLine = ({ info, onInfo }: { info: CardInfo; onInfo: () => void }) => {
    const credit = sourceLine(info);

    return (
        <button
            type="button"
            className={styles.sourceLine}
            aria-label={credit ? undefined : 'More Info about this card'}
            title="More Info"
            onClick={onInfo}
        >
            {credit && <span className={styles.creditLead}>{credit.lead}</span>}
            {/* Spaces the line's accessible name; a flex row drops it. */}{' '}
            <span className={styles.creditTail}>
                {credit?.first && <span className={styles.creditName}>{credit.first}</span>}{' '}
                {credit && credit.more > 0 && (
                    <span className={styles.creditMore}>+{credit.more} more</span>
                )}
                <Icon name="info" className={styles.sourceIcon} />
            </span>
        </button>
    );
};

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
