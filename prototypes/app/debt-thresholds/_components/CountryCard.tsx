'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
    GROUP_LABELS,
    debtRatio,
    effectiveCapacity,
    FDL_YEAR,
    isStaleRating,
    sentence,
    serviceRatios,
    shownGroup,
    toCsv,
} from '../_lib/thresholds.ts';

import { CardFoot } from './CardFoot';
import styles from './CountryCard.module.scss';
import { DebtBar } from './DebtBar';
import { countryLink } from './selection';
import { CREDITORS, ServiceBars } from './ServiceBars';

import type { BaseYear, Country, Vintage } from '../_data/types.ts';
import type { CapacityOverride, Group } from '../_lib/thresholds.ts';

/** FDL's 2023 note, whose appendix sets out the projection method. */
const FDL_METHOD_URL =
    'https://findevlab.org/wp-content/uploads/2023/12/FDL_Debt-distress-update_final20231204.pdf';

/** The source line under the scatter and the card: data releases, then who projects. */
export const SourceLine = ({ ids, weo }: { ids: string; weo: string }) => (
    <>
        Source: World Bank IDS ({ids}) and IMF WEO ({weo}), via the DFO. Projections: the DFO, using{' '}
        <a href={FDL_METHOD_URL}>FDL&apos;s 2023 method</a>.
    </>
);

/** Group colours from the house palette, shared with the scatter's dots. */
const GROUP_COLOURS: Record<Group, string> = {
    debt: '#662d6e',
    service: '#f46f58',
    below: '#8285e7',
    nodata: '#d2d2c5',
};

/** The fade for a new country's content: opacity only, so heights and baselines hold. */
const SWAP_FADE: KeyframeAnimationOptions = {
    duration: 200,
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
};

/**
 * Fades the card's content in when the country changes. The card's first appearance
 * fades through CSS (`@starting-style`); after that the card stays mounted, so the bars
 * keep their measured width, and the Web Animations API fades its children instead.
 */
const useSwapFade = (iso3: string) => {
    const ref = useRef<HTMLElement>(null);
    const shown = useRef(iso3);

    useEffect(() => {
        const card = ref.current;

        if (card === null || shown.current === iso3) {
            return;
        }

        shown.current = iso3;
        for (const child of card.children) {
            // The search box stays put: the reader is still using it.
            if (!(child instanceof HTMLElement && 'keep' in child.dataset)) {
                child.animate([{ opacity: 0 }, { opacity: 1 }], SWAP_FADE);
            }
        }
    }, [iso3]);

    return ref;
};

/** Content-box width of the referenced element in whole pixels, re-measured on resize. */
const useWidth = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const element = ref.current;

        if (element === null) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => {
            if (entry !== undefined) {
                setWidth(Math.floor(entry.contentRect.width));
            }
        });
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return [ref, width] as const;
};

const monthYear = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const capacityNote = (
    base: BaseYear | undefined,
    override: CapacityOverride,
    asOf: string | undefined,
): string => {
    if (override !== 'assessed') {
        return `Capacity set to ${override}.`;
    }

    if (base === undefined || base.capacity === null) {
        return 'No IMF–World Bank capacity rating.';
    }

    if (base.capacitySource === 'assumed') {
        return "No LIC DSA, so treated as strong, as in FDL's 2023 note.";
    }

    const risk = base.riskRating === null ? '' : `. Risk of debt distress ${base.riskRating}`;
    const dsa = base.dsaDate === null ? '' : `, DSA of ${monthYear(base.dsaDate)}`;
    const stale =
        asOf !== undefined && isStaleRating(base.dsaDate, asOf)
            ? ' The rating is more than two years old.'
            : '';

    return `Capacity ${base.capacity}${dsa}${risk}.${stale}`;
};

/**
 * One country's group, the sentence that explains it with its capacity under it, its
 * debt against the solvency thresholds and its debt service by creditor against the
 * liquidity threshold. In FDL's view the group is FDL's published one. `search`, a
 * country search box, sits at the top so a reader can jump to another country.
 */
export const CountryCard = ({
    country,
    year,
    override,
    vintage,
    search,
}: {
    country: Country;
    year: number;
    override: CapacityOverride;
    vintage: Vintage | undefined;
    search?: ReactNode;
}) => {
    const [debtRef, debtWidth] = useWidth();
    const [barsRef, barsWidth] = useWidth();
    const cardRef = useSwapFade(country.iso3);
    const [copied, setCopied] = useState<{ iso3: string; message: string } | null>(null);

    const base = country.bases[String(year)];
    const capacity = effectiveCapacity(country, year, override);
    const group = shownGroup(country, year, override);
    const debt = base === undefined ? null : debtRatio(base);
    const rows = base === undefined ? [] : serviceRatios(base);
    const note = capacityNote(base, override, vintage?.capacityAsOf);
    const copyStatus = copied?.iso3 === country.iso3 ? copied.message : '';
    const onCurrentData = year === FDL_YEAR && vintage?.archived === false;

    const copyLink = async () => {
        const url = countryLink(country.iso3);

        try {
            await navigator.clipboard.writeText(url);
            setCopied({ iso3: country.iso3, message: 'Link copied.' });
        } catch {
            setCopied({ iso3: country.iso3, message: url });
        }
    };

    return (
        <article ref={cardRef} className={styles.card} aria-live="polite">
            {search !== undefined && (
                <div className={styles.search} data-keep="">
                    {search}
                </div>
            )}
            <div className={styles.main}>
                <div>
                    <h2 className={styles.name}>{country.name}</h2>
                    <div className={styles.group}>
                        <span
                            className={styles.swatch}
                            style={{ background: GROUP_COLOURS[group] }}
                        />
                        {GROUP_LABELS[group]}
                    </div>
                </div>
                <div className={styles.text}>
                    <p className={styles.sentence}>{sentence(country, year, override)}</p>
                    <p className={styles.note}>{note}</p>
                </div>
                <div className={styles.row}>
                    <button type="button" className={styles.button} onClick={copyLink}>
                        Copy link
                    </button>
                    <span className={styles.status} role="status">
                        {copyStatus}
                    </span>
                </div>
                <div ref={debtRef}>
                    <h3 className={styles.heading}>
                        External public debt at present value, % of GDP, {year}
                    </h3>
                    <DebtBar value={debt} capacity={capacity} width={debtWidth} />
                </div>
            </div>
            <div ref={barsRef} className={styles.bars}>
                <h3 className={styles.heading}>Debt service, % of government revenue</h3>
                <div className={styles.legend}>
                    {CREDITORS.map(({ key, label, colour }) => (
                        <span key={key} className={styles.legendItem}>
                            <span className={styles.swatch} style={{ background: colour }} />
                            {label}
                        </span>
                    ))}
                </div>
                <ServiceBars rows={rows} capacity={capacity} width={barsWidth} />
            </div>
            <div className={styles.foot}>
                <CardFoot>
                    Paler bars after {year} are projected, including new borrowing.{' '}
                    {onCurrentData &&
                        'Positions use current data because the releases FDL used are unavailable. '}
                    {vintage !== undefined && <SourceLine ids={vintage.ids} weo={vintage.weo} />}
                </CardFoot>
            </div>
        </article>
    );
};

/**
 * The card's place before a country is chosen: a prompt on the page pointing at the
 * chart, with the country search box under it.
 */
export const EmptyCountryCard = ({ search }: { search: ReactNode }) => (
    <article className={styles.empty}>
        <div className={styles.emptyInner}>
            <p className={styles.prompt}>
                <span className={styles.arrow} aria-hidden="true">
                    ↑
                </span>
                Choose a country on the chart or search for one.
            </p>
            <div className={styles.emptySearch}>{search}</div>
        </div>
    </article>
);

/** A button that downloads every country's row for the base year and capacity on screen. */
export const DownloadCsv = ({
    countries,
    year,
    override,
}: {
    countries: Country[];
    year: number;
    override: CapacityOverride;
}) => {
    const download = () => {
        const blob = new Blob([toCsv(countries, year, override)], {
            type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `debt-thresholds-${year}${override === 'assessed' ? '' : `-${override}`}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    };

    return (
        <button type="button" className={styles.button} onClick={download}>
            Download all countries (CSV)
        </button>
    );
};
