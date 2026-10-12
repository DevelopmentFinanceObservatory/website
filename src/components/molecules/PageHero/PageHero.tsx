import classNames from 'classnames';
import type { ReactNode } from 'react';

import styles from './PageHero.module.scss';

import WorldMap from '@/components/atoms/WorldMap/WorldMap';

export type PageHeroProps = {
    // Dark: the charcoal ground with a stone box (Sources, Roadmap). Light:
    // the page ground with a pale box and a hairline under (Docs, Status).
    tone: 'dark' | 'light';
    // The box's content — the page's own title, lead, filters, tabs.
    children: ReactNode;
    // Something outside the box, bottom-right (Visit Source, "last checked").
    aside?: ReactNode;
    // 'desktop': the aside is a desktop-only placement — below desktop the
    // page puts it inside the box itself (it isn't rendered here).
    asideOn?: 'all' | 'desktop';
    // The box's minimum height and whether its bottom padding is dropped
    // (tabs with a tongue sit flush on the box's bottom edge).
    boxMinHeight?: number;
    boxFlush?: boolean;
    className?: string;
};

/**
 * The content pages' hero: the world-map lines behind, the title box on the
 * left (rem(740) wide, rem(452) tall at least, under the fixed nav). The
 * page owns what's inside the box; this owns the ground.
 */
const PageHero = ({
    tone,
    children,
    aside,
    asideOn = 'all',
    boxMinHeight,
    boxFlush,
    className,
}: PageHeroProps) => (
    <div
        className={classNames(styles.hero, tone === 'dark' ? styles.dark : styles.light, className)}
        data-nav-dark={tone === 'dark' ? 'true' : undefined}
    >
        <WorldMap className={styles.mapBg} />
        {/* One reveal trigger for everything in the box: it sits at the foot
            of a screen-tall hero on phones, where its lowest rows would never
            enter the reveal band on their own. */}
        <div
            className={classNames(styles.box, boxFlush && styles.boxFlush)}
            style={boxMinHeight ? { minHeight: `${boxMinHeight / 16}rem` } : undefined}
            data-reveal-group="trigger"
        >
            {children}
        </div>
        {aside && (
            <div className={classNames(styles.aside, asideOn === 'desktop' && styles.asideDesktop)}>
                {aside}
            </div>
        )}
    </div>
);

export default PageHero;
