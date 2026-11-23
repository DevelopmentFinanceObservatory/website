'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useAidFigures } from './AidProse';
import { CountrySearch } from './CountrySearch';
import { CountryTable } from './CountryTable';
import styles from './HivFinancing.module.scss';
import { PerPersonStrip } from './PerPersonStrip';
import { ProviderBars } from './ProviderBars';
import { Reserved } from './Reserved';

import type { HivData } from '../_data/types.ts';
import {
    aidSections,
    allSentence,
    countrySentence,
    flagLegend,
    stripCaption,
    tableRule,
    unallocatedCaption,
} from '../_lib/copy.ts';
import { lastYear, scopeMulti, scopeSeries } from '../_lib/summary.ts';
import { joinUnaids } from '../_lib/unaids.ts';

import { useStoredCheckState } from '#lib/useStoredCheck.ts';

const ALL_COUNTRIES = 'All countries';

const chartTitle = (name: string, data: HivData) =>
    `${name}, ${data.years[0]} to ${data.years.at(-1)}, constant ${data.priceBase} US dollars`;

/** An in-page scroll's behaviour: instant under reduced motion, otherwise smooth. `auto`
 *  would defer to the site's `scroll-behavior: smooth` on the root and so scroll smoothly
 *  under reduced motion. */
const scrollBehaviour = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

/**
 * The interactive part of the page: the scope row, the summary sentence, the bars and the
 * per-person strip, and the country table. Choosing the selected country again from a dot
 * or a row returns to all countries; choosing it in the search keeps it.
 *
 * The aid and UNAIDS figures are the ones the build read from DFO, held by AidProvider for the
 * island and the prose around it, or a read again when DFO stored newer data, which the root's
 * `data-stored-check` says (lib/storedCheck.ts).
 */
export const HivFinancing = () => {
    const [selected, setSelected] = useState<string | null>(null);
    const islandRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLElement>(null);
    const { data, unaids } = useAidFigures();
    const storedCheck = useStoredCheckState();
    const countries = useMemo(() => joinUnaids(data.countries, unaids, data.years), [data, unaids]);
    const chosen =
        selected === null ? undefined : countries.find((country) => country.iso3 === selected);
    // The country the page shows, or null for all: a selection the figures read again no longer
    // hold counts as none.
    const scope = chosen?.iso3 ?? null;
    const [chartSection, tableSection] = aidSections(data);
    const year = lastYear(data);

    const sentence = chosen === undefined ? allSentence(data) : countrySentence(chosen, data.years);
    const title = chartTitle(chosen?.name ?? ALL_COUNTRIES, data);
    // Every text a scope can show, so the sentence and the chart title take the room of
    // their longest at any width and a change of scope never moves the page below.
    const variants = useMemo(
        () => ({
            sentences: [
                allSentence(data),
                ...countries.map((country) => countrySentence(country, data.years)),
            ],
            titles: [ALL_COUNTRIES, ...countries.map((country) => country.name)].map((name) =>
                chartTitle(name, data),
            ),
        }),
        [data, countries],
    );

    // Text fades in on each change of scope after first paint (_motion.scss).
    useEffect(() => {
        islandRef.current?.setAttribute('data-ready', '');
    }, []);

    const toggle = (iso3: string) => setSelected(scope === iso3 ? null : iso3);

    const onRow = (iso3: string) => {
        const opening = scope !== iso3;

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
        <div
            ref={islandRef}
            className={styles.island}
            data-read-tier="built"
            data-read-live="built"
            data-stored-check={storedCheck ?? undefined}
        >
            <div ref={topRef} className={styles.top}>
                <div className={styles.controls}>
                    <button
                        type="button"
                        className={styles.all}
                        aria-pressed={scope === null}
                        onClick={() => setSelected(null)}
                    >
                        {ALL_COUNTRIES}
                    </button>
                    <CountrySearch
                        countries={countries}
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
                    series={scopeSeries(data, scope)}
                    multi={scopeMulti(data, scope)}
                    years={data.years}
                    scope={scope ?? ALL_COUNTRIES}
                />
                <p className={styles.note}>{unallocatedCaption(data)}</p>
                <div className={styles.below}>
                    <PerPersonStrip
                        countries={countries}
                        year={year}
                        caption={stripCaption(countries, year)}
                        selected={scope}
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
                    countries={countries}
                    year={year}
                    legend={flagLegend(data)}
                    selected={scope}
                    onSelect={onRow}
                    onCollapse={onCollapse}
                />
            </section>
        </div>
    );
};
