'use client';

import { useState, type KeyboardEvent, type MouseEvent } from 'react';

import { Reserved } from './Reserved';
import styles from './Strip.module.scss';
import { useWidth } from './useWidth';

import type { Context } from '../_data/types.ts';
import { coverageText, dotLabel, LABELS, medianLabel, stripSummary } from '../_lib/copy.ts';
import { GROUP_KEYS, groupContexts, scopeGroup, type Scope } from '../_lib/scope.ts';
import {
    buildStrip,
    scalePosition,
    stripMedian,
    type StripDot,
    type StripKey,
} from '../_lib/strip.ts';

const RADIUS = 4.5;
/** Lanes sit one dot and a hairline apart. */
const LANE = 2 * (RADIUS + 0.5);
const PAD = RADIUS + 3;
/** The row above the dots that holds the chosen context's label. */
const LABEL_ROW = 18;
const TICK_ROW = 18;
/** How near, in pixels, a pointer must come to a dot to read it. */
const REACH = 14;

/**
 * One value per context on a fixed axis, the page's signature form. Dots sit where their
 * value puts them, whatever the scope; the scope's group sets the median tick and dims the
 * dots outside it, and a chosen context gets a ring and a label. Hovering or the arrow keys
 * read a dot's name and value; a click or Enter picks its context, and picking the chosen
 * one again returns to the group.
 */
export const Strip = ({
    contexts,
    stripKey,
    scope,
    colour,
    onSelect,
    showTicks = true,
}: {
    contexts: Context[];
    stripKey: StripKey;
    scope: Scope;
    colour: string;
    onSelect: (iso3: string) => void;
    /** Off for all but the last of strips that share one axis. */
    showTicks?: boolean;
}) => {
    const [wrapRef, width] = useWidth();
    const [active, setActive] = useState<string | null>(null);
    const plotWidth = Math.max(1, width - 2 * PAD);
    const strip = buildStrip(contexts, stripKey, (RADIUS + 0.5) / plotWidth);
    const { spec, dots } = strip;
    const group = scopeGroup(contexts, scope);
    const median = stripMedian(groupContexts(contexts, group), stripKey);
    const chosenIso3 = scope.kind === 'context' ? scope.iso3 : null;
    const chosenContext = contexts.find((context) => context.iso3 === chosenIso3);
    const chosen = dots.find((dot) => dot.iso3 === chosenIso3) ?? null;
    const shown = dots.find((dot) => dot.iso3 === active) ?? null;

    const up = Math.max(0, ...dots.map((dot) => dot.lane));
    const down = Math.max(0, ...dots.map((dot) => -dot.lane));
    const baseline = LABEL_ROW + up * LANE + RADIUS + 2;
    const dotsBottom = baseline + down * LANE + RADIUS + 2;
    const height = dotsBottom + (showTicks ? TICK_ROW : 2);
    const sx = (x: number) => PAD + x * plotWidth;
    const xOf = (value: number) => sx(scalePosition(spec.scale, value).x);
    const yOf = (dot: StripDot) => baseline - dot.lane * LANE;
    const inScope = (dot: StripDot) => group === 'all' || dot.tier === group;
    const order = dots.toSorted((a, b) => a.x - b.x || b.lane - a.lane);
    const tickText = (tick: number) => spec.format(tick).replace(/\.00$/, '');

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

    const summary = stripSummary({
        spec,
        count: dots.length,
        median: median.value,
        group,
        chosen: chosenContext === undefined ? null : { name: chosenContext.name, dot: chosen },
    });
    const medianText = median.value === null ? '' : medianLabel(spec, median.value, group);
    // The median label takes the room of the widest group's, so the head never rewraps.
    const medianVariants = GROUP_KEYS.flatMap((key) => {
        const { value } = stripMedian(groupContexts(contexts, key), stripKey);

        return value === null ? [] : [medianLabel(spec, value, key)];
    });
    // The label row names the chosen context's value, or says it has none.
    const chosenText =
        chosen !== null ? dotLabel(spec, chosen) : chosenContext === undefined ? '' : LABELS.noData;
    const chosenX = chosen === null ? null : sx(chosen.x);
    const chosenAnchor =
        chosenX === null || chosenX < width * 0.15
            ? 'start'
            : chosenX > width * 0.85
              ? 'end'
              : 'middle';

    return (
        <div className={styles.strip}>
            <p className={styles.head}>
                <span className={styles.label}>
                    {spec.label}
                    {dots.length < contexts.length && (
                        <span className={styles.count}>
                            {coverageText(dots.length, contexts.length)}
                        </span>
                    )}
                </span>
                <Reserved
                    text={medianText}
                    variants={medianVariants}
                    render={(text) => (
                        <span className={styles.medianText}>
                            <span className={styles.medianSwatch} aria-hidden="true" />
                            {text}
                        </span>
                    )}
                    className={styles.median}
                />
            </p>
            <div
                ref={wrapRef}
                className={styles.plot}
                role="group"
                aria-label={`${summary} Use the arrow keys to read each context and Enter to pick one.`}
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
                        {spec.scale.ticks.map((tick, index) => (
                            // Ticks are fixed per strip; keyed by place like every gridline.
                            <g
                                key={index}
                                className={styles.mark}
                                style={{ transform: `translateX(${xOf(tick)}px)` }}
                            >
                                <line
                                    y1={LABEL_ROW}
                                    y2={dotsBottom}
                                    className={
                                        tick === spec.reference ? styles.reference : styles.grid
                                    }
                                />
                                {showTicks && (
                                    <text
                                        y={dotsBottom + 13}
                                        textAnchor={
                                            index === 0
                                                ? 'start'
                                                : index === spec.scale.ticks.length - 1
                                                  ? 'end'
                                                  : 'middle'
                                        }
                                        className={
                                            tick === spec.reference
                                                ? styles.tickReference
                                                : styles.tick
                                        }
                                    >
                                        {tickText(tick)}
                                    </text>
                                )}
                            </g>
                        ))}
                        <line
                            y1={LABEL_ROW}
                            y2={dotsBottom}
                            className={`${styles.mark} ${styles.medianTick}`}
                            style={{
                                transform: `translateX(${median.value === null ? PAD : xOf(median.value)}px)`,
                                opacity: median.value === null ? 0 : 1,
                            }}
                        />
                        {dots.map((dot) => (
                            <circle
                                key={dot.iso3}
                                r={RADIUS}
                                fill={colour}
                                className={styles.dot}
                                data-dimmed={!inScope(dot)}
                                data-active={dot.iso3 === active}
                                style={{ transform: `translate(${sx(dot.x)}px, ${yOf(dot)}px)` }}
                            />
                        ))}
                        {chosen !== null && (
                            // Mounted while a context with a dot is chosen, so it fades in
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
                            key={`${chosenIso3 ?? 'none'}-${chosenText}`}
                            y={12}
                            textAnchor={chosenAnchor}
                            className={`${styles.mark} ${chosen === null ? styles.noData : styles.chosen}`}
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
                    {shown === null ? '' : `${shown.name} · ${dotLabel(spec, shown)}`}
                </p>
                <p className={styles.srOnly} aria-live="polite">
                    {shown === null ? '' : `${shown.name}, ${dotLabel(spec, shown)}`}
                </p>
            </div>
        </div>
    );
};
