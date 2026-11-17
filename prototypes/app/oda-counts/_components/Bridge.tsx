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
    type StepRow,
} from '../_lib/counts.ts';

/** A one-step waterfall: the first total, the step between, the second total, on one scale. */
const Waterfall = ({ rows, from, to }: { rows: StepRow[]; from: CountKey; to: CountKey }) => {
    const max = Math.max(0, ...rows.map(({ end }) => end));
    const percent = (amount: number) => `${max > 0 ? (Math.max(amount, 0) / max) * 100 : 0}%`;
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
                                left: percent(row.start),
                                width: percent(row.end - row.start),
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
 * Why the counts differ, as two one-step bridges from gross disbursements: to net, by
 * repayments and other amounts received, and to grant equivalents, by the part not
 * counted as concessional. A bridge without its figures says why in one line.
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
    const whose = possessive(donor.name);

    return (
        <section className={styles.bridges} aria-labelledby="why-they-differ">
            <h2 id="why-they-differ" className={styles.heading}>
                Why they differ
            </h2>
            <p className={styles.lede}>
                Each count starts from the same gross disbursements. Net disbursements take off what
                the donor received back. Grant equivalents count loans and other non-grant
                instruments only for their concessional part.
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
                        </>
                    )}
                </BridgeCard>
            </div>
        </section>
    );
};
