'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { CountrySearch } from './CountrySearch';
import { CountryTable } from './CountryTable';
import styles from './HivFinancing.module.scss';
import { PerPersonStrip } from './PerPersonStrip';
import { ProviderBars } from './ProviderBars';
import { Reserved } from './Reserved';
import { CitedText } from './SourceLink';

import type { HivData } from '../_data/types.ts';
import {
    allSentence,
    countrySentence,
    flagLegend,
    stripCaption,
    tableRule,
    unallocatedNote,
} from '../_lib/copy.ts';
import { findCountry, lastYear, scopeMulti, scopeSeries } from '../_lib/summary.ts';

export type Section = { id: string; title: string };

const ALL_COUNTRIES = 'All countries';

const chartTitle = (name: string, data: HivData) =>
    `${name}, ${data.years[0]} to ${data.years.at(-1)}, constant ${data.priceBase} US dollars`;

/** An in-page scroll's behaviour: instant under reduced motion. `auto` would defer to the
 *  site's `scroll-behavior: smooth` on the root, so it is not used. */
const scrollBehaviour = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

/**
 * The interactive part of the page: the scope row, the summary sentence, the bars and the
 * per-person strip, and the country table. Choosing the selected country again from a dot
 * or a row returns to all countries; choosing it in the search keeps it.
 */
export const HivFinancing = ({
    data,
    sections,
}: {
    data: HivData;
    /** The rail's entries for the chart section and the table section, in that order. */
    sections: readonly [Section, Section];
}) => {
    const [selected, setSelected] = useState<string | null>(null);
    const islandRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLElement>(null);
    const chosen = selected === null ? undefined : findCountry(data, selected);
    const [chartSection, tableSection] = sections;
    const year = lastYear(data);

    const sentence = chosen === undefined ? allSentence(data) : countrySentence(chosen, data.years);
    const title = chartTitle(chosen?.name ?? ALL_COUNTRIES, data);
    // Every text a scope can show, so the sentence and the chart title take the room of
    // their longest at any width and a change of scope never moves the page below.
    const variants = useMemo(
        () => ({
            sentences: [
                allSentence(data),
                ...data.countries.map((country) => countrySentence(country, data.years)),
            ],
            titles: [ALL_COUNTRIES, ...data.countries.map((country) => country.name)].map((name) =>
                chartTitle(name, data),
            ),
        }),
        [data],
    );

    // Text fades in on a change of scope, not on first paint (_motion.scss).
    useEffect(() => {
        islandRef.current?.setAttribute('data-ready', '');
    }, []);

    const toggle = (iso3: string) => setSelected((current) => (current === iso3 ? null : iso3));

    const onRow = (iso3: string) => {
        const opening = selected !== iso3;

        toggle(iso3);

        if (opening) {
            topRef.current?.scrollIntoView({ block: 'start', behavior: scrollBehaviour() });
        }
    };

    // Collapsing the table from the foot of its full length brings its heading back into view.
    const onCollapse = () => {
        const table = tableRef.current;

        if (table !== null && table.getBoundingClientRect().top < 0) {
            table.scrollIntoView({ block: 'start', behavior: scrollBehaviour() });
        }
    };

    return (
        <div ref={islandRef} className={styles.island}>
            <div ref={topRef} className={styles.top}>
                <div className={styles.controls}>
                    <button
                        type="button"
                        className={styles.all}
                        aria-pressed={selected === null}
                        onClick={() => setSelected(null)}
                    >
                        {ALL_COUNTRIES}
                    </button>
                    <CountrySearch
                        countries={data.countries}
                        chosen={chosen}
                        year={year}
                        onChoose={setSelected}
                        onClear={() => setSelected(null)}
                    />
                </div>
                <p className={styles.sentence} aria-live="polite">
                    <Reserved text={sentence} variants={variants.sentences} block />
                </p>
            </div>

            <section className={styles.section} aria-labelledby={chartSection.id}>
                <h2 id={chartSection.id} className={styles.heading}>
                    {chartSection.title}
                </h2>
                <h3 className={styles.chartTitle}>
                    <Reserved text={title} variants={variants.titles} block />
                </h3>
                <ProviderBars
                    series={scopeSeries(data, selected)}
                    multi={scopeMulti(data, selected)}
                    years={data.years}
                    scope={selected ?? ALL_COUNTRIES}
                />
                <p className={styles.note}>
                    <CitedText parts={unallocatedNote(data)} />
                </p>
                <div className={styles.below}>
                    <PerPersonStrip
                        countries={data.countries}
                        year={year}
                        caption={stripCaption(data)}
                        selected={selected}
                        onSelect={toggle}
                    />
                </div>
            </section>

            <section
                ref={tableRef}
                className={`${styles.section} ${styles.tableSection}`}
                aria-labelledby={tableSection.id}
            >
                <h2 id={tableSection.id} className={styles.heading}>
                    {tableSection.title}
                </h2>
                <p className={styles.rule}>{tableRule(data)}</p>
                <CountryTable
                    countries={data.countries}
                    year={year}
                    legend={flagLegend(data)}
                    selected={selected}
                    onSelect={onRow}
                    onCollapse={onCollapse}
                />
            </section>
        </div>
    );
};
