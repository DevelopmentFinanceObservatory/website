import classNames from 'classnames';
import type { ReactNode } from 'react';

import styles from './EntryCard.module.scss';

type EntryCardProps = {
    title: ReactNode;
    // Render the title as a heading of this level (a span by default). Not
    // for clickable cards: a button may hold only phrasing content.
    titleAs?: 'span' | 'h2' | 'h3' | 'h4';
    // Right of the title ("Expected: Q3 2026", a vote button, a status chip).
    meta?: ReactNode;
    children: ReactNode;
    // The air between the head row and the text, and the card's vertical
    // padding (rem-less px @16; rem(12) / rem(30) by default).
    headGap?: number;
    padY?: number;
    // Rounded corners (the source pages) or square (roadmap, status).
    rounded?: boolean;
    // A clickable card (opens a panel).
    onClick?: () => void;
    className?: string;
};

/**
 * A white entry card: bold title (with something on the right), then a
 * light paragraph — the transformation log, the version timeline, the
 * roadmap items and incident cards all wear it.
 */
const EntryCard = ({
    title,
    titleAs: Title = 'span',
    meta,
    children,
    headGap,
    padY,
    rounded,
    onClick,
    className,
}: EntryCardProps) => {
    // Inside a button only phrasing content is valid — plain cards may hold
    // blocks (a facts list), so their wrappers are divs.
    const Wrap = onClick ? 'span' : 'div';
    const body = (
        <>
            <Wrap
                className={styles.head}
                style={headGap ? { marginBottom: `${headGap / 16}rem` } : undefined}
            >
                <Title className={styles.title}>{title}</Title>
                {meta}
            </Wrap>
            <Wrap className={styles.text}>{children}</Wrap>
        </>
    );
    const cls = classNames(
        styles.card,
        rounded && styles.rounded,
        onClick && styles.clickable,
        className,
    );

    const style = padY ? { paddingBlock: `${padY / 16}rem` } : undefined;

    return onClick ? (
        <button type="button" className={cls} style={style} onClick={onClick}>
            {body}
        </button>
    ) : (
        <div className={cls} style={style}>
            {body}
        </div>
    );
};

export default EntryCard;
