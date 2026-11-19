'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';

import styles from './PerPersonStrip.module.scss';
import { useWidth } from './useWidth';

import type { Country } from '../_data/types.ts';
import { perPerson, people } from '../_lib/format.ts';
import { buildStrip, scalePosition, STRIP_MIN_PLHIV, type StripDot } from '../_lib/strip.ts';

const RADIUS = 4.5;
/** Lanes sit one dot and a hairline apart. */
const LANE = 2 * (RADIUS + 0.5);
const PAD = RADIUS + 3;
/** The row above the dots that holds the selected country's label. */
const LABEL_ROW = 18;
const TICK_ROW = 18;
/** How near, in pixels, a pointer must come to a dot to read it. */
const REACH = 14;

/** A dot's reading: "$134 per person". */
const dotValue = (dot: StripDot) => `${perPerson(dot.value)} per person`;

/** An axis tick in dollars, with no trailing zeros: "$0", "$50", "$2.5". */
const tickText = (tick: number) => `$${Number(tick.toFixed(1))}`;

/**
 * Last-year HIV aid per person living with HIV, one dot per country with 50,000 or more
 * people living with HIV and some aid, on a fixed axis with the median marked. Dots stay
 * put; the selected country's dot gets a ring and a label and the others sit back.
 * Hovering or the arrow keys read a dot's name and value; a click or Enter selects its
 * country.
 */
export const PerPersonStrip = ({
    countries,
    year,
    selected,
    onSelect,
}: {
    countries: readonly Country[];
    /** The year the aid figures are for. */
    year: number;
    /** The selected country's iso3, or null for all countries. */
    selected: string | null;
    onSelect: (iso3: string) => void;
}) => {
    const [wrapRef, width] = useWidth();
    const [active, setActive] = useState<string | null>(null);
    const plotWidth = Math.max(1, width - 2 * PAD);
    const { scale, dots, median } = buildStrip(countries, (RADIUS + 0.5) / plotWidth);
    const selectedCountry = countries.find((country) => country.iso3 === selected);
    const chosen = dots.find((dot) => dot.iso3 === selected) ?? null;
    const shown = dots.find((dot) => dot.iso3 === active) ?? null;

    const up = Math.max(0, ...dots.map((dot) => dot.lane));
    const down = Math.max(0, ...dots.map((dot) => -dot.lane));
    const baseline = LABEL_ROW + up * LANE + RADIUS + 2;
    const dotsBottom = baseline + down * LANE + RADIUS + 2;
    const height = dotsBottom + TICK_ROW;
    const sx = (x: number) => PAD + x * plotWidth;
    const xOf = (value: number) => sx(scalePosition(scale, value).x);
    const yOf = (dot: StripDot) => baseline - dot.lane * LANE;
    const order = dots.toSorted((a, b) => a.x - b.x || b.lane - a.lane);

    const nearest = (event: MouseEvent<SVGSVGElement>): StripDot | null => {
        const box = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - box.left;
        const y = event.clientY - box.top;
        let best: StripDot | null = null;
        let bestDistance = REACH;

        for (const dot of dots) {
            const distance = Math.hypot(sx(dot.x) - x, yOf(dot) - y);

            if (distance < bestDistance) {
                best = dot;
                bestDistance = distance;
            }
        }

        return best;
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const at = order.findIndex((dot) => dot.iso3 === (active ?? chosen?.iso3));
        const move = (index: number) => {
            event.preventDefault();
            setActive(order[Math.max(0, Math.min(order.length - 1, index))]?.iso3 ?? null);
        };

        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            move(at === -1 ? 0 : at + 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            move(at === -1 ? order.length - 1 : at - 1);
        } else if (event.key === 'Home') {
            move(0);
        } else if (event.key === 'End') {
            move(order.length - 1);
        } else if ((event.key === 'Enter' || event.key === ' ') && active !== null) {
            event.preventDefault();
            onSelect(active);
        } else if (event.key === 'Escape') {
            setActive(null);
        }
    };

    const medianText = median === null ? '' : `Median ${perPerson(median)}`;
    // The label row names the selected country's value, or says it is not on the strip.
    const chosenText =
        chosen !== null
            ? `${chosen.name} ${dotValue(chosen)}`
            : selectedCountry === undefined
              ? ''
              : `${selectedCountry.name} is not on the strip`;
    const chosenX = chosen === null ? null : sx(chosen.x);
    const chosenAnchor =
        chosenX === null || chosenX < width * 0.15
            ? 'start'
            : chosenX > width * 0.85
              ? 'end'
              : 'middle';
    const summary =
        `Dot strip of ${year} HIV aid per person living with HIV in ${dots.length} ` +
        `countries.${median === null ? '' : ` The median is ${perPerson(median)}.`}` +
        (chosenText === '' ? '' : ` ${chosenText}.`) +
        ' Use the arrow keys to read each country and Enter to select one.';

    return (
        <div className={styles.strip}>
            <p className={styles.head}>
                <span className={styles.label}>
                    HIV aid per person living with HIV, {year}
                    <span className={styles.count}>
                        {dots.length} countries with {people(STRIP_MIN_PLHIV)} or more people living
                        with HIV
                    </span>
                </span>
                {medianText !== '' && (
                    <span className={styles.median}>
                        <span className={styles.medianSwatch} aria-hidden="true" />
                        {medianText}
                    </span>
                )}
            </p>
            <div
                ref={wrapRef}
                className={styles.plot}
                role="group"
                aria-label={summary}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onBlur={() => setActive(null)}
            >
                {width > 0 && (
                    <svg
                        className={styles.svg}
                        width={width}
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        aria-hidden="true"
                        onPointerMove={(event) => setActive(nearest(event)?.iso3 ?? null)}
                        onPointerLeave={(event) => {
                            if (event.pointerType === 'mouse') {
                                setActive(null);
                            }
                        }}
                        onClick={(event) => {
                            const dot = nearest(event);

                            if (dot !== null) {
                                onSelect(dot.iso3);
                            }
                        }}
                        data-pointing={shown !== null}
                    >
                        {scale.ticks.map((tick, index) => (
                            // Keyed by place, like every gridline.
                            <g
                                key={index}
                                className={styles.mark}
                                style={{ transform: `translateX(${xOf(tick)}px)` }}
                            >
                                <line y1={LABEL_ROW} y2={dotsBottom} className={styles.grid} />
                                <text
                                    y={dotsBottom + 13}
                                    textAnchor={
                                        index === 0
                                            ? 'start'
                                            : index === scale.ticks.length - 1
                                              ? 'end'
                                              : 'middle'
                                    }
                                    className={styles.tick}
                                >
                                    {tickText(tick)}
                                </text>
                            </g>
                        ))}
                        {median !== null && (
                            <line
                                y1={LABEL_ROW}
                                y2={dotsBottom}
                                className={`${styles.mark} ${styles.medianTick}`}
                                style={{ transform: `translateX(${xOf(median)}px)` }}
                            />
                        )}
                        {dots.map((dot) => (
                            <circle
                                key={dot.iso3}
                                r={RADIUS}
                                className={styles.dot}
                                data-dimmed={selected !== null && dot.iso3 !== selected}
                                data-selected={dot.iso3 === selected}
                                data-active={dot.iso3 === active}
                                style={{ transform: `translate(${sx(dot.x)}px, ${yOf(dot)}px)` }}
                            />
                        ))}
                        {chosen !== null && (
                            // Mounted while a country with a dot is selected, so it fades in
                            // where it first appears and glides from one dot to the next.
                            <circle
                                r={RADIUS + 3}
                                className={styles.ring}
                                style={{
                                    transform: `translate(${sx(chosen.x)}px, ${yOf(chosen)}px)`,
                                }}
                            />
                        )}
                        <text
                            key={`${selected ?? 'none'}-${chosenText}`}
                            y={12}
                            textAnchor={chosenAnchor}
                            className={`${styles.mark} ${chosen === null ? styles.offStrip : styles.chosen}`}
                            style={{ transform: `translateX(${chosenX ?? PAD}px)` }}
                        >
                            {chosenText}
                        </text>
                    </svg>
                )}
                <p
                    className={styles.tip}
                    hidden={shown === null}
                    aria-hidden="true"
                    style={
                        shown === null
                            ? undefined
                            : {
                                  left: Math.min(Math.max(sx(shown.x), 60), width - 60),
                                  top: yOf(shown) - RADIUS - 6,
                              }
                    }
                >
                    {shown === null ? '' : `${shown.name} · ${dotValue(shown)}`}
                </p>
                <p className={styles.srOnly} aria-live="polite">
                    {shown === null ? '' : `${shown.name}, ${dotValue(shown)}`}
                </p>
            </div>
        </div>
    );
};
