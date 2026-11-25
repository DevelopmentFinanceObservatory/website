'use client';

import classNames from 'classnames';

import BuiltWithMark from './BuiltWithMark';
import styles from './CardChrome.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import HoverPopup from '@/components/molecules/HoverPopup/HoverPopup';
import { type CardInfo, sourceLine } from '@/lib/chat/widgets';
import { leftOutOf } from '@/lib/studio/liveCards';
import { noteParts } from '@/lib/studio/noteLinks';

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

// The attribution line: the info mark, the first source's full name dotted
// underlined as a link, and how many more the card cites. "Source:" is read
// out and not shown. A card DFO computed from sources it credits none of
// reads "Source: DFO calculation". A click anywhere on it opens the More Info
// panel, which lists every source in full; a card that names no source shows
// the mark alone. Without the frame's info (a text card, an older save) the
// bar keeps the plain tag.
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
            <Icon name="info" className={styles.sourceIcon} />
            {credit && (
                <span className={styles.creditText}>
                    <span className={credit.first ? styles.srOnly : undefined}>{credit.lead}</span>{' '}
                    {credit.first && <span className={styles.creditName}>{credit.first}</span>}
                    {credit.more > 0 && (
                        <span className={styles.creditMore}> +{credit.more} more</span>
                    )}
                </span>
            )}
        </button>
    );
};

// The user's note under the source, in the same indented form, with the
// links written into it (lib/studio/noteLinks).
const NoteLine = ({ note }: { note: string }) => (
    <p className={styles.note}>
        <Icon name="note" className={styles.noteIcon} />
        {/* Read out, so a listener hears where the source ends and the
            note begins. */}
        <span className={styles.srOnly}>Note: </span>
        <span className={styles.noteText}>
            {noteParts(note).map((part, index) =>
                part.href ? (
                    <a
                        key={index}
                        href={part.href}
                        className={styles.noteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {part.text}
                    </a>
                ) : (
                    part.text
                ),
            )}
        </span>
    </p>
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
    note?: string;
};

// The card's foot holds what its data leaves out (`info.leftOut`), then the
// bar, then the user's note.
const CardChrome = ({ note, ...bar }: CardChromeProps) => {
    const leftOut = leftOutOf(bar.info);

    return leftOut.length > 0 || note ? (
        <div className={classNames(styles.foot, leftOut.length > 0 && styles.footLeftOut)}>
            {leftOut.length > 0 && <LeftOutLine leftOut={leftOut} onInfo={bar.onInfo} />}
            <ChromeBar {...bar} />
            {note && <NoteLine note={note} />}
        </div>
    ) : (
        <ChromeBar {...bar} />
    );
};

// The source tag, and Built with on the right.
const ChromeBar = ({ source, info, onInfo }: Omit<CardChromeProps, 'note'>) => (
    <div className={styles.chrome}>
        <span className={styles.chromeTags}>
            {info && onInfo ? (
                <SourceLine info={info} onInfo={onInfo} />
            ) : (
                <InfoTag label="Source Name" content={source} />
            )}
        </span>
        <BuiltWithMark />
    </div>
);

export default CardChrome;
