import type { ReactNode } from 'react';

import { CardFoot } from './CardFoot';
import { SourceNames } from './Linked';
import styles from './Panel.module.scss';
import { Reserved } from './Reserved';

import type { Source } from '../_lib/copy.ts';

/** One of the island's sections: an h2 the section rail links to, a lede, then its card. */
export const Panel = ({
    id,
    title,
    lede,
    children,
}: {
    id: string;
    title: string;
    lede?: string;
    children: ReactNode;
}) => (
    <section className={styles.section} aria-labelledby={id}>
        <h2 id={id} className={styles.heading}>
            {title}
        </h2>
        {lede !== undefined && <p className={styles.lede}>{lede}</p>}
        {children}
    </section>
);

/**
 * A white card with an optional title, its content and a foot naming its sources. The title
 * takes the room of the longest of `titles`, so a new scope's title never moves the card.
 */
export const Card = ({
    title,
    titles = [],
    sources,
    note,
    children,
}: {
    title?: string;
    /** Every title the card can show. */
    titles?: readonly string[];
    sources: readonly Source[];
    /** One short sentence after the sources. */
    note?: string;
    children: ReactNode;
}) => (
    <figure className={styles.card}>
        {title !== undefined && (
            <figcaption className={styles.title}>
                <Reserved text={title} variants={titles} block />
            </figcaption>
        )}
        {children}
        <CardFoot>
            {sources.length > 1 ? 'Sources: ' : 'Source: '}
            <SourceNames sources={sources} />.{note !== undefined && ` ${note}`}
        </CardFoot>
    </figure>
);

/** A chart with its key on the right, stacked under it in a card narrower than 720px. */
export const WithSide = ({ children, side }: { children: ReactNode; side: ReactNode }) => (
    <div className={styles.frame}>
        <div className={styles.layout}>
            <div className={styles.main}>{children}</div>
            <div className={styles.side}>{side}</div>
        </div>
    </div>
);
