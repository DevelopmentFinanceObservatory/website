import { CardFoot } from './CardFoot';
import styles from './CountBars.module.scss';
import { COUNT_COLOURS } from './colours';

import type { CountsData, Definition, Donor, Prices } from '../_data/types.ts';
import {
    COUNT_LABELS,
    countDefinition,
    countsFor,
    DAC1_SOURCE_URL,
    formatCompact,
    headlineBasis,
    missingText,
    possessive,
    priceDefinition,
} from '../_lib/counts.ts';

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** A definition's parts in one run of text, each led by its term. */
const DefinitionText = ({ parts }: { parts: Definition[] }) => (
    <p className={styles.definition}>
        {parts.map((part) => (
            <span key={part.id}>
                <dfn>{sentenceCase(part.label)}</dfn>: {part.description}{' '}
            </span>
        ))}
    </p>
);

/** The source line every chart card on the page ends with. */
export const SourceLine = () => (
    <>
        Source: <a href={DAC1_SOURCE_URL}>OECD DAC1</a>, via the DFO. Definitions: the DFO graph,
        and the page for the OECD headline and constant prices.
    </>
);

/**
 * Every count of a donor's ODA in a year as one horizontal bar each, on one scale, with
 * the value and what the count counts under it. A count with no figure says why.
 */
export const CountBars = ({
    data,
    definitions,
    donor,
    year,
    prices,
}: {
    data: CountsData;
    definitions: Definition[];
    donor: Donor;
    year: number;
    prices: Prices;
}) => {
    const counts = countsFor(data, donor, year, prices);
    const max = Math.max(0, ...counts.map(({ value }) => value ?? 0));
    const unit =
        prices === 'current' ? 'current US dollars' : `constant ${data.baseYear} US dollars`;
    const price = priceDefinition(prices, definitions);

    return (
        <section id="counts" className={styles.card} aria-labelledby="counts-title">
            <h2 id="counts-title" className={styles.title}>
                {possessive(donor.name)} ODA in {year} by count, {unit}
            </h2>
            <ul className={styles.rows}>
                {counts.map(({ key, value }) => (
                    <li key={key} className={styles.row}>
                        <div className={styles.head}>
                            <span className={styles.label}>
                                {COUNT_LABELS[key]}
                                {key === 'headline' && (
                                    <span className={styles.basis}>
                                        {' '}
                                        ({COUNT_LABELS[headlineBasis(year)].toLowerCase()} in {year}
                                        )
                                    </span>
                                )}
                            </span>
                            <span className={value === null ? styles.missing : styles.value}>
                                {value === null
                                    ? missingText(data, donor, key, year, prices)
                                    : formatCompact(value)}
                            </span>
                        </div>
                        <div className={styles.track}>
                            {value !== null && max > 0 && (
                                <span
                                    className={styles.bar}
                                    style={{
                                        width: `${(Math.max(value, 0) / max) * 100}%`,
                                        background: COUNT_COLOURS[key],
                                    }}
                                />
                            )}
                        </div>
                        <DefinitionText parts={countDefinition(key, definitions)} />
                    </li>
                ))}
            </ul>
            <p className={styles.prices}>
                <dfn>{sentenceCase(price.label)}</dfn>: {price.description}
            </p>
            <CardFoot>
                <SourceLine />
            </CardFoot>
        </section>
    );
};
