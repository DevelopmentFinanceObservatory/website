import type { ReactNode } from 'react';

import { CardFoot, SourceLine } from './CardFoot';
import { COUNT_COLOURS } from './colours';
import styles from './Scope.module.scss';
import { SideDetails, WithSide } from './SideColumn';
import { useStill } from './useWidth';

import type { CountsData, Donor } from '../_data/types.ts';
import {
    formatShare,
    formatAmount,
    missingText,
    ODA_GNI_TARGET,
    odaGniSentence,
    possessive,
    PRELIMINARY_YEAR,
    scope,
} from '../_lib/counts.ts';
import type { Unit } from '../_lib/live.ts';

/** House-palette colours (theme.ts DEFAULT_SERIES) no count uses, so a share is not mistaken for a count. */
const SCOPE_COLOURS = {
    bilateral: '#662d6e',
    multilateral: '#c9a227',
    refugeeCosts: '#f46f58',
} as const;

const NOT_PUBLISHED = 'not published';

const Block = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className={styles.block}>
        <h3 className={styles.title}>{title}</h3>
        {children}
    </div>
);

/** A horizontal track with one or more segments laid end to end, each a share of the track. */
const Track = ({
    segments,
    marker,
}: {
    segments: { share: number; colour: string }[];
    /** a reference line across the track, at a share of its width, with its label */
    marker?: { share: number; label: string };
}) => (
    <div className={styles.trackWrap}>
        <div className={styles.track}>
            {segments.map(({ share, colour }) => (
                <span
                    key={colour}
                    className={styles.segment}
                    style={{
                        width: `${Math.min(Math.max(share, 0), 1) * 100}%`,
                        background: colour,
                    }}
                />
            ))}
        </div>
        {marker && (
            <>
                <span className={styles.marker} style={{ left: `${marker.share * 100}%` }} />
                <span className={styles.markerLabel} style={{ left: `${marker.share * 100}%` }}>
                    {marker.label}
                </span>
            </>
        )}
    </div>
);

/**
 * What is inside a donor's ODA in a year: the bilateral and core multilateral shares of
 * gross disbursements, in-donor refugee costs as a share of the OECD headline, and the
 * headline as a share of gross national income against the 0.7% target. A value the
 * OECD has not published reads "not published".
 */
export const Scope = ({
    data,
    donor,
    year,
    unit,
}: {
    data: CountsData;
    donor: Donor;
    year: number;
    unit: Unit;
}) => {
    const { prices, currency } = unit;
    const still = useStill();
    // A donor-year has one deflator and one exchange rate, so shares are the same at either
    // price basis. Current prices supply them, and constant prices where a current-price
    // figure is missing, as while a live current basis loads.
    const amounts = scope(data, donor, year, prices);
    const current = scope(data, donor, year, 'current');
    const constant = scope(data, donor, year, 'constant');
    const split = current.bilateralShare === null ? constant : current;
    const { bilateralShare, multilateralShare } = split;
    const refugeeShare = current.refugeeShare ?? constant.refugeeShare;
    const { odaGni } = amounts;
    const refugeeNote =
        amounts.refugeeCosts === null
            ? `Amount ${missingText(data, donor, 'refugeeCosts', year, prices)}.`
            : `${formatAmount(amounts.refugeeCosts, currency)} spent on refugees in the donor country, ` +
              'for up to a year after they arrive.';
    const gniScale = Math.max(1, Math.ceil((odaGni ?? 0) * 4) / 4);
    const anyMissing = bilateralShare === null || refugeeShare === null || odaGni === null;

    return (
        <section className={styles.section} aria-labelledby="what-is-inside">
            <h2 id="what-is-inside" className={styles.heading}>
                What is inside
            </h2>
            <p className={styles.lede}>
                Gross disbursements split between bilateral aid and core multilateral contributions.
                Part of the OECD headline stays in the donor country as in-donor refugee costs, and
                the total is measured against the UN target of {ODA_GNI_TARGET}% of gross national
                income.
            </p>

            <div ref={still} className={styles.card}>
                <h3 className={styles.cardTitle}>
                    What is inside {possessive(donor.name)} ODA in {year}
                </h3>
                <WithSide
                    side={
                        <SideDetails title="How to read this">
                            <p>
                                The first bar splits gross disbursements between bilateral aid and
                                core multilateral contributions, so the two shares add to 100%.
                            </p>
                            <p>
                                In-donor refugee costs are a share of the OECD headline, the count
                                they are reported on.
                            </p>
                            <p>
                                The line on the last bar marks the UN target of {ODA_GNI_TARGET}% of
                                gross national income.
                            </p>
                            <p>Shares are the same in current and constant prices.</p>
                        </SideDetails>
                    }
                >
                    <div className={styles.blocks}>
                        <Block title="Bilateral and core multilateral, share of gross disbursements">
                            {bilateralShare === null || multilateralShare === null ? (
                                <p className={styles.missing}>{NOT_PUBLISHED}</p>
                            ) : (
                                <>
                                    <Track
                                        segments={[
                                            {
                                                share: bilateralShare,
                                                colour: SCOPE_COLOURS.bilateral,
                                            },
                                            {
                                                share: multilateralShare,
                                                colour: SCOPE_COLOURS.multilateral,
                                            },
                                        ]}
                                    />
                                    <ul className={styles.legend}>
                                        <li>
                                            <span
                                                className={styles.swatch}
                                                style={{ background: SCOPE_COLOURS.bilateral }}
                                            />
                                            Bilateral <b>{formatShare(bilateralShare)}</b>
                                        </li>
                                        <li>
                                            <span
                                                className={styles.swatch}
                                                style={{ background: SCOPE_COLOURS.multilateral }}
                                            />
                                            Core multilateral{' '}
                                            <b>{formatShare(multilateralShare)}</b>
                                        </li>
                                    </ul>
                                </>
                            )}
                        </Block>

                        <Block title="In-donor refugee costs, share of the OECD headline">
                            {refugeeShare === null ? (
                                <p className={styles.missing}>{NOT_PUBLISHED}</p>
                            ) : (
                                <>
                                    <p key={refugeeShare} className={styles.figure}>
                                        {formatShare(refugeeShare)}
                                    </p>
                                    <Track
                                        segments={[
                                            {
                                                share: refugeeShare,
                                                colour: SCOPE_COLOURS.refugeeCosts,
                                            },
                                        ]}
                                    />
                                    <p className={styles.note}>{refugeeNote}</p>
                                </>
                            )}
                        </Block>

                        <Block title="OECD headline, share of gross national income">
                            {odaGni === null ? (
                                <p className={styles.missing}>{NOT_PUBLISHED}</p>
                            ) : (
                                <>
                                    <p key={odaGni} className={styles.figure}>
                                        {odaGni.toFixed(2)}%
                                    </p>
                                    <Track
                                        segments={[
                                            {
                                                share: odaGni / gniScale,
                                                colour: COUNT_COLOURS.headline,
                                            },
                                        ]}
                                        marker={{
                                            share: ODA_GNI_TARGET / gniScale,
                                            label: `${ODA_GNI_TARGET}% target`,
                                        }}
                                    />
                                    <p className={styles.note}>{odaGniSentence(odaGni)}</p>
                                </>
                            )}
                        </Block>
                    </div>
                    {anyMissing && year === PRELIMINARY_YEAR && (
                        <p className={styles.note}>
                            The OECD's preliminary {year} release leaves out these splits for most
                            donors.
                        </p>
                    )}
                </WithSide>
                <CardFoot>
                    <SourceLine />
                </CardFoot>
            </div>
        </section>
    );
};
