'use client';

import { useState } from 'react';

import styles from './SeriesChart.module.scss';

import type { DataFile } from '#lib/dataFile.mts';

import type { Point } from '../_data/types.ts';

const WINDOWS = [10, 20, Infinity] as const;

const formatValue = new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

/** A bar chart of the series, with a choice of how many recent years to show. */
const SeriesChart = ({ file }: { file: DataFile<Point[]> }) => {
    const [years, setYears] = useState<(typeof WINDOWS)[number]>(20);
    const points = file.data.slice(-years);
    const max = Math.max(...points.map((point) => point.value), 1);

    return (
        <figure className={styles.chart}>
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
                {String(file.provenance.sentence ?? file.provenance.query)}
            </figcaption>
        </figure>
    );
};

export default SeriesChart;
