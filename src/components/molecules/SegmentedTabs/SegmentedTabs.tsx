'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './SegmentedTabs.module.scss';

export type SegmentedTab = {
    id: string;
    label: string;
    // Optional trailing count ("All 7") — rendered quieter than the label.
    count?: number;
};

type SegmentedTabsProps = {
    tabs: readonly SegmentedTab[];
    value: string;
    onChange: (id: string) => void;
};

/**
 * Segmented pill with ONE measured indicator gliding from tab to tab (the
 * download menu's format picker, extracted). A ResizeObserver re-measures on
 * late mounts and size changes — popover content mounts on open, where a
 * value-effect alone would fire before layout and leave the indicator hidden.
 */
const SegmentedTabs = ({ tabs, value, onChange }: SegmentedTabsProps) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

    useEffect(() => {
        const track = trackRef.current;

        if (!track) {
            return;
        }

        const measure = () => {
            const active = track.querySelector<HTMLElement>('button[data-active="true"]');

            if (active) {
                setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
            }
        };

        const frame = requestAnimationFrame(measure);
        const observer = new ResizeObserver(measure);

        observer.observe(track);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [value]);

    return (
        <div ref={trackRef} className={styles.pill}>
            {indicator && (
                <span className={styles.indicator} style={indicator} aria-hidden="true" />
            )}
            {tabs.map((tab, index) => {
                const previous = tabs[index - 1];

                return (
                    <span key={tab.id} className={styles.cell}>
                        {/* Always in the layout — separators next to the active
                            tab only FADE, so nothing reflows on switch. */}
                        {index > 0 && (
                            <span
                                className={styles.sep}
                                data-hidden={previous!.id === value || tab.id === value}
                                aria-hidden="true"
                            >
                                |
                            </span>
                        )}
                        <button
                            type="button"
                            className={styles.choice}
                            data-active={tab.id === value}
                            onClick={() => onChange(tab.id)}
                        >
                            {tab.label}
                            {tab.count != null && (
                                <span className={styles.count}>{tab.count}</span>
                            )}
                        </button>
                    </span>
                );
            })}
        </div>
    );
};

export default SegmentedTabs;
