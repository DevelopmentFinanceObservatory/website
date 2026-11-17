import type { ReactNode } from 'react';

import styles from './Bridge.module.scss';
import { CardFoot } from './CardFoot';
import { COUNT_COLOURS, STEP_OPACITY } from './colours';
import { SourceLine } from './CountBars';

import type { CountKey, CountsData, Donor, Prices } from '../_data/types.ts';
import {
    bridge,
    bridgeRows,
    formatCompact,
    GRANT_EQUIVALENT_FROM,
    nonGrantSentence,
    possessive,
    riseNote,
    type StepRow,
} from '../_lib/counts.ts';

/** A one-step waterfall: the first total, the step between, the second total, on one scale. */
const Waterfall = ({ rows, from, to }: { rows: StepRow[]; from: CountKey; to: CountKey }) => {
    const max = Math.max(0, ...rows.map(({ end }) => end));
    // Clamp both ends to [0, max], so a bar crossing zero starts at 0 and shows its part above it.
    const clamp = (amount: number) => Math.min(Math.max(amount, 0), max);
    const percent = (amount: number) => `${max > 0 ? (amount / max) * 100 : 0}%`;
    const colour = (index: number) => (index === 0 ? COUNT_COLOURS[from] : COUNT_COLOURS[to]);

    return (
        <ul className={styles.rows}>
            {rows.map((row, index) => (
                <li key={row.label} className={styles.row}>
                    <div className={styles.head}>
                        <span className={row.kind === 'step' ? styles.stepLabel : styles.label}>
                            {row.label}
                        </span>
                        <span className={styles.value}>
                            {row.kind === 'step' && row.value > 0 ? '+' : ''}
                            {formatCompact(row.value)}
                        </span>
                    </div>
                    <div className={styles.track}>
                        <span
                            className={styles.bar}
                            style={{
                                left: percent(clamp(row.start)),
                                width: percent(clamp(row.end) - clamp(row.start)),
                                background: colour(index),
                                opacity: row.kind === 'step' ? STEP_OPACITY : 1,
                            }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
};

const BridgeCard = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        {children}
        <CardFoot>
            <SourceLine />
        </CardFoot>
    </div>
);

/**
 * Why the counts differ, as two one-step bridges from gross disbursements: to net and
 * to grant equivalents. A step that rises above gross gets its own label and a note,
 * and a bridge without its figures says why in one line.
 */
export const Bridges = ({
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
    const steps = bridge(data, donor, year, prices);
    const rows = bridgeRows(steps);
    const nonGrants = nonGrantSentence(steps.toGrantEquivalent);
    const netRise = riseNote('toNet', steps);
    const grantEquivalentRise = riseNote('toGrantEquivalent', steps);
    const whose = possessive(donor.name);

    return (
        <section className={styles.bridges} aria-labelledby="why-they-differ">
            <h2 id="why-they-differ" className={styles.heading}>
                Why they differ
            </h2>
            <p className={styles.lede}>
                Each count starts from the same gross disbursements. Net disbursements take off what
                the donor received back. Grant equivalents count loans only for their concessional
                part, and count private sector instruments and debt relief on a different basis from
                gross disbursements. So the gap between gross disbursements and grant equivalents is
                mostly loans, but it can be larger, or negative.
            </p>
            <div className={styles.cards}>
                <BridgeCard title="Gross to net disbursements">
                    {rows.toNet === null ? (
                        <p className={styles.note}>
                            {whose} gross or net figure for {year} is not published.
                        </p>
                    ) : (
                        <>
                            <Waterfall rows={rows.toNet} from="gross" to="net" />
                            {netRise !== null && <p className={styles.note}>{netRise}</p>}
                            <p className={styles.note}>
                                Amounts received are gross minus net disbursements. The DFO
                                publishes no separate series for them.
                            </p>
                        </>
                    )}
                </BridgeCard>
                <BridgeCard title="Gross disbursements to grant equivalents">
                    {rows.toGrantEquivalent === null ? (
                        <p className={styles.note}>
                            {year < GRANT_EQUIVALENT_FROM
                                ? `The OECD's headline counts grant equivalents from ${GRANT_EQUIVALENT_FROM}, so this bridge starts then.`
                                : `${whose} grant-equivalent figure for ${year} is not published.`}
                        </p>
                    ) : (
                        <>
                            <Waterfall
                                rows={rows.toGrantEquivalent}
                                from="gross"
                                to="grantEquivalent"
                            />
                            {nonGrants !== null && <p className={styles.note}>{nonGrants}</p>}
                            {grantEquivalentRise !== null && (
                                <p className={styles.note}>{grantEquivalentRise}</p>
                            )}
                        </>
                    )}
                </BridgeCard>
            </div>
        </section>
    );
};
