'use client';

import { useState } from 'react';

import styles from './SeriesChart.module.scss';

import type { Series } from '../_lib/build.ts';

const WINDOWS = [10, 20, Infinity] as const;

const formatValue = new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

/** A bar chart of the series the build read, with a choice of how many recent years to show.
 *  Its root carries `data-read-tier="built"`, which `pnpm check:live` reads. */
const SeriesChart = ({ series }: { series: Series }) => {
    const [years, setYears] = useState<(typeof WINDOWS)[number]>(20);
    const points = series.points.slice(-years);
    const max = Math.max(...points.map((point) => point.value), 1);

    return (
        <figure className={styles.chart} data-read-tier="built" data-read-live="built">
            <div className={styles.controls} role="group" aria-label="Years shown">
                {WINDOWS.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={styles.control}
                        aria-pressed={option === years}
                        onClick={() => setYears(option)}
                    >
                        {Number.isFinite(option) ? `Last ${option} years` : 'All years'}
                    </button>
                ))}
            </div>
            <ol className={styles.bars}>
                {points.map((point) => (
                    <li
                        key={point.year}
                        className={styles.bar}
                        style={{ blockSize: `${(Math.max(point.value, 0) / max) * 100}%` }}
                        title={`${point.year}: ${formatValue.format(point.value)}`}
                    />
                ))}
            </ol>
            <figcaption className={styles.caption}>
                {series.provider}: {series.sentence}
            </figcaption>
        </figure>
    );
};

export default SeriesChart;
