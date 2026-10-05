'use client';

import classNames from 'classnames';

import styles from './HeroTabs.module.scss';

export type HeroTab<Id extends string> = { id: Id; label: string };

type HeroTabsProps<Id extends string> = {
    tabs: readonly HeroTab<Id>[];
    value: Id;
    onChange: (id: Id) => void;
    // The geometry the design gives each page: the air after a label (the
    // next tab starts there), the active tab's tongue (width × height) and
    // the gap between the label and the tongue. rem-less numbers (px @16).
    air: number;
    tongue: { width: number; height: number };
    gap: number;
    className?: string;
};

/**
 * The hero box's tabs: a text row along the box's bottom edge; the active
 * one carries a light "tongue" that continues into the page ground below.
 */
const HeroTabs = <Id extends string>({
    tabs,
    value,
    onChange,
    air,
    tongue,
    gap,
    className,
}: HeroTabsProps<Id>) => (
    <div
        className={classNames(styles.tabs, className)}
        role="tablist"
        style={
            {
                '--tab-air': `${air / 16}rem`,
                '--tongue-w': `${tongue.width / 16}rem`,
                '--tongue-h': `${tongue.height / 16}rem`,
                '--tab-gap': `${gap / 16}rem`,
            } as React.CSSProperties
        }
    >
        {tabs.map((t) => (
            <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={value === t.id}
                className={classNames(styles.tab, value === t.id && styles.tabActive)}
                onClick={() => onChange(t.id)}
            >
                {t.label}
            </button>
        ))}
    </div>
);

export default HeroTabs;
