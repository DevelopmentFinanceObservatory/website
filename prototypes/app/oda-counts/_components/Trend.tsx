'use client';

import { useState, type KeyboardEvent, type PointerEvent } from 'react';

import { CardFoot, SourceLine } from './CardFoot';
import { COUNT_COLOURS } from './colours';
import { SideDetails, WithSide } from './SideColumn';
import styles from './Trend.module.scss';
import { useWidth } from './useWidth';

import type { CountKey, CountsData, Donor, Prices } from '../_data/types.ts';
import {
    COUNT_LABELS,
    donorTicks,
    formatCompact,
    formatTick,
    GRANT_EQUIVALENT_FROM,
    headlineBasis,
    headlineSegments,
    missingText,
    possessive,
    trendLines,
    valueAt,
    TREND_COUNTS,
} from '../_lib/counts.ts';

import { PLOT_RATIO } from '@/lib/studio/chartFit';

const MARGIN = { left: 44, right: 12, top: 36, bottom: 24 };
/** Below this gap between years, the axis labels every other year. */
const MIN_YEAR_PITCH = 40;
/** The OECD headline's band under the line it follows. */
const HEADLINE_WIDTH = 9;
const HEADLINE_OPACITY = 0.22;
/** The key's order: the four lines, then the headline band. */
const KEY_ORDER: readonly CountKey[] = [
    'gross',
    'grantEquivalent',
    'net',
    'commitments',
    'headline',
];

/**
 * A donor's counts over time, one line per count, with the OECD headline as a band
 * under the line it follows in each year and the 2018 switch as a labelled reference
 * line. The selected year is shaded; hovering, tapping or the arrow keys read another
 * year in the key. A year with no figure is a gap in its line.
 */
export const Trend = ({
    data,
    donor,
    year,
    prices,
}: {
    data: CountsData;
    donor: Donor;
    year: number;
    prices: Prices;
}) => {
    const [wrapRef, width] = useWidth();
    const [index, setIndex] = useState<number | null>(null);
    const [focus, setFocus] = useState<CountKey | null>(null);

    const { years } = data;
    const lastIndex = years.length - 1;
    const selected = years.indexOf(year);
    const shown = index ?? (selected === -1 ? lastIndex : selected);
    const shownYear = years[shown] ?? year;

    const lines = trendLines(data, donor, prices);
    const headline = headlineSegments(data, donor, prices);
    // Every year at both price bases, so switching prices never rescales the chart.
    const ticks = donorTicks(data, donor, [...TREND_COUNTS, 'headline']);
    const yMin = ticks[0] ?? 0;
    const yMax = ticks.at(-1) ?? 1;

    const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
    const height = Math.round(plotWidth / PLOT_RATIO) + MARGIN.top + MARGIN.bottom;
    const plot = {
        left: MARGIN.left,
        right: width - MARGIN.right,
        top: MARGIN.top,
        bottom: height - MARGIN.bottom,
    };
    const pitch = years.length > 1 ? plotWidth / (years.length - 1) : 0;
    const sx = (i: number): number => plot.left + i * pitch;
    const sy = (value: number): number =>
        plot.bottom - ((value - yMin) / (yMax - yMin)) * (plot.bottom - plot.top);
    const yearStep = pitch < MIN_YEAR_PITCH ? 2 : 1;
    const lastYear = years[lastIndex] ?? 0;
    const switchIndex = years.indexOf(GRANT_EQUIVALENT_FROM);

    const pathOf = (values: (number | null)[]): string => {
        let path = '';
        let open = false;

        values.forEach((value, i) => {
            if (value === null) {
                open = false;

                return;
            }

            path += `${open ? 'L' : 'M'}${sx(i)},${sy(value)}`;
            open = true;
        });

        return path;
    };

    const read = (event: PointerEvent<SVGRectElement>) => {
        const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();

        if (box === undefined || pitch === 0) {
            return;
        }

        const x = event.clientX - box.left;

        setIndex(Math.max(0, Math.min(lastIndex, Math.round((x - plot.left) / pitch))));
    };

    const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const move = event.key === 'ArrowLeft' ? -1 : 1;

            setIndex((current) => Math.max(0, Math.min(lastIndex, (current ?? shown) + move)));
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setIndex(event.key === 'Home' ? 0 : lastIndex);
        } else if (event.key === 'Escape') {
            setIndex(null);
        }
    };

    const valueText = (key: CountKey, at: number): string => {
        const value = valueAt(data, donor, key, at, prices);

        return value === null ? missingText(data, donor, key, at, prices) : formatCompact(value);
    };
    const reading = KEY_ORDER.map(
        (key) => `${COUNT_LABELS[key]} ${valueText(key, shownYear)}`,
    ).join('; ');
    const unit =
        prices === 'current' ? 'current US dollars' : `constant ${data.baseYear} US dollars`;
    const summary =
        `Line chart of ${possessive(donor.name)} ODA by count, ${years[0]} to ${lastYear}, in ` +
        `${unit}. The OECD headline follows net disbursements to ${GRANT_EQUIVALENT_FROM - 1} ` +
        `and grant equivalents from ${GRANT_EQUIVALENT_FROM}. In ${shownYear}: ${reading}. ` +
        'Use the left and right arrow keys to read each year.';
    const dim = (key: CountKey) => (focus !== null && focus !== key ? 0.25 : 1);
    const keyPanel = (
        <div className={styles.key}>
            <p className={styles.keyYear} aria-hidden="true">
                {shownYear}
            </p>
            <ul className={styles.keyList}>
                {KEY_ORDER.map((key) => (
                    <li
                        key={key}
                        className={styles.keyItem}
                        data-dimmed={focus !== null && focus !== key}
                        onMouseEnter={() => setFocus(key)}
                        onMouseLeave={() => setFocus(null)}
                    >
                        <span
                            className={key === 'headline' ? styles.swatchBand : styles.swatch}
                            style={{ background: COUNT_COLOURS[key] }}
                        />
                        <span className={styles.keyName}>
                            {COUNT_LABELS[key]}
                            {key === 'headline' && (
                                <span className={styles.keyBasis}>
                                    {' '}
                                    ({COUNT_LABELS[headlineBasis(shownYear)].toLowerCase()})
                                </span>
                            )}
                        </span>
                        <span className={styles.keyValue}>{valueText(key, shownYear)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );

    return (
        <section className={styles.section} aria-labelledby="over-time">
            <h2 id="over-time" className={styles.heading}>
                Over time
            </h2>
            <p className={styles.lede}>
                Gaps between the counts widen and narrow from year to year. In{' '}
                {GRANT_EQUIVALENT_FROM} the OECD headline switched from net disbursements to grant
                equivalents, jumping from one line to the other.
            </p>

            <figure className={styles.card}>
                <figcaption className={styles.title}>
                    {possessive(donor.name)} ODA by count, {years[0]} to {lastYear}, {unit}
                </figcaption>

                <WithSide
                    side={
                        <>
                            {keyPanel}
                            <SideDetails title="How to read this">
                                <p>
                                    Each line is one count. The pale band is the OECD headline,
                                    under the line it follows: net disbursements to{' '}
                                    {GRANT_EQUIVALENT_FROM - 1} and grant equivalents from{' '}
                                    {GRANT_EQUIVALENT_FROM}. A gap in a line is a year with no
                                    figure.
                                </p>
                                <p>
                                    The shaded year is the one chosen above. Hover over or tap the
                                    chart to read other years in the key, or focus the chart and use
                                    the arrow keys.
                                </p>
                            </SideDetails>
                        </>
                    }
                >
                    <div ref={wrapRef} className={styles.wrap}>
                        {width > 0 && (
                            <svg
                                className={styles.svg}
                                width={width}
                                height={height}
                                viewBox={`0 0 ${width} ${height}`}
                                role="img"
                                aria-label={summary}
                                tabIndex={0}
                                onKeyDown={onKeyDown}
                                onBlur={() => setIndex(null)}
                            >
                                <g aria-hidden="true">
                                    {selected !== -1 && (
                                        <rect
                                            x={Math.max(plot.left, sx(selected) - pitch / 2)}
                                            width={
                                                Math.min(plot.right, sx(selected) + pitch / 2) -
                                                Math.max(plot.left, sx(selected) - pitch / 2)
                                            }
                                            y={plot.top}
                                            height={plot.bottom - plot.top}
                                            className={styles.selected}
                                        />
                                    )}
                                    {ticks.map((tick) => (
                                        <g key={tick}>
                                            <line
                                                x1={plot.left}
                                                x2={plot.right}
                                                y1={sy(tick)}
                                                y2={sy(tick)}
                                                className={tick === 0 ? styles.zero : styles.grid}
                                            />
                                            <text
                                                x={plot.left - 6}
                                                y={sy(tick) + 4}
                                                textAnchor="end"
                                                className={styles.tick}
                                            >
                                                {formatTick(tick)}
                                            </text>
                                        </g>
                                    ))}
                                    {years.map((y, i) =>
                                        (lastIndex - i) % yearStep === 0 ? (
                                            <text
                                                key={y}
                                                x={sx(i)}
                                                y={plot.bottom + 16}
                                                textAnchor="middle"
                                                className={
                                                    i === selected
                                                        ? styles.tickSelected
                                                        : styles.tick
                                                }
                                            >
                                                {y}
                                            </text>
                                        ) : null,
                                    )}

                                    {switchIndex !== -1 && (
                                        <g>
                                            <line
                                                x1={sx(switchIndex)}
                                                x2={sx(switchIndex)}
                                                y1={plot.top - 30}
                                                y2={plot.bottom}
                                                className={styles.switch}
                                            />
                                            <text
                                                x={sx(switchIndex) + 5}
                                                y={plot.top - 21}
                                                className={styles.switchLabel}
                                            >
                                                <tspan>
                                                    {GRANT_EQUIVALENT_FROM}: OECD headline
                                                </tspan>
                                                <tspan x={sx(switchIndex) + 5} dy={13}>
                                                    switches to grant equivalents
                                                </tspan>
                                            </text>
                                        </g>
                                    )}

                                    {headline.map((segment) => (
                                        <path
                                            key={segment.basis}
                                            d={pathOf(segment.values)}
                                            stroke={COUNT_COLOURS.headline}
                                            strokeOpacity={HEADLINE_OPACITY * dim('headline')}
                                            className={styles.band}
                                            style={{
                                                strokeWidth: HEADLINE_WIDTH,
                                                d: `path("${pathOf(segment.values)}")`,
                                            }}
                                        />
                                    ))}

                                    {index !== null && (
                                        <line
                                            x1={sx(index)}
                                            x2={sx(index)}
                                            y1={plot.top}
                                            y2={plot.bottom}
                                            className={styles.guide}
                                        />
                                    )}

                                    {lines.map((line) => (
                                        <g
                                            key={line.key}
                                            className={styles.series}
                                            style={{ opacity: dim(line.key) }}
                                        >
                                            <path
                                                d={pathOf(line.values)}
                                                style={{ d: `path("${pathOf(line.values)}")` }}
                                                stroke={COUNT_COLOURS[line.key]}
                                                className={styles.line}
                                            />
                                            {line.values.map((value, i) =>
                                                value === null ? null : (
                                                    <circle
                                                        key={years[i]}
                                                        r={i === shown ? 4 : 2.5}
                                                        style={{
                                                            transform: `translate(${sx(i)}px, ${sy(value)}px)`,
                                                        }}
                                                        fill={COUNT_COLOURS[line.key]}
                                                        className={styles.point}
                                                    />
                                                ),
                                            )}
                                        </g>
                                    ))}
                                </g>

                                <rect
                                    x={plot.left - pitch / 2}
                                    y={0}
                                    width={plotWidth + pitch}
                                    height={height}
                                    className={styles.hit}
                                    onPointerMove={read}
                                    onPointerDown={read}
                                    onPointerLeave={(event) => {
                                        // On touch the reading stays until the next tap.
                                        if (event.pointerType === 'mouse') {
                                            setIndex(null);
                                        }
                                    }}
                                />
                            </svg>
                        )}
                    </div>
                </WithSide>

                <p className={styles.srOnly} aria-live="polite">
                    {index === null ? '' : `${shownYear}: ${reading}`}
                </p>

                <CardFoot>
                    <SourceLine />
                </CardFoot>
            </figure>
        </section>
    );
};
