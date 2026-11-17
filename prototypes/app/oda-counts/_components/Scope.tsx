import type { ReactNode } from 'react';

import { CardFoot } from './CardFoot';
import { COUNT_COLOURS } from './colours';
import { SourceLine } from './CountBars';
import styles from './Scope.module.scss';

import type { CountsData, Donor, Prices } from '../_data/types.ts';
import {
    formatShare,
    formatUsd,
    missingText,
    ODA_GNI_TARGET,
    odaGniSentence,
    possessive,
    PRELIMINARY_YEAR,
    scope,
} from '../_lib/counts.ts';

/** House-palette colours (theme.ts DEFAULT_SERIES) no count uses, so a share never reads as a count. */
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
    prices,
}: {
    data: CountsData;
    donor: Donor;
    year: number;
    prices: Prices;
}) => {
    // A donor-year has one deflator, so shares are the same at either price basis; the
    // current-price shares stay readable where a constant-price figure is missing.
    const shares = scope(data, donor, year, 'current');
    const amounts = scope(data, donor, year, prices);
    const { bilateralShare, multilateralShare, refugeeShare, odaGni } = shares;
    const refugeeNote =
        amounts.refugeeCosts === null
            ? `The amount: ${missingText(data, donor, 'refugeeCosts', year, prices)}.`
            : `${formatUsd(amounts.refugeeCosts)} spent on refugees in the donor country, ` +
              'for up to a year after they arrive.';
    const gniScale = Math.max(1, Math.ceil((odaGni ?? 0) * 4) / 4);
    const anyMissing = bilateralShare === null || refugeeShare === null || odaGni === null;

    return (
        <section className={styles.section} aria-labelledby="what-is-inside">
            <h2 id="what-is-inside" className={styles.heading}>
                What is inside
            </h2>
            <p className={styles.lede}>
                Some ODA never leaves the donor country, and some goes through multilateral agencies
                the donor does not run. These figures show how much, and how the headline compares
                with the UN target of {ODA_GNI_TARGET}% of gross national income.
            </p>

            <div className={styles.card}>
                <h3 className={styles.cardTitle}>
                    What is inside {possessive(donor.name)} ODA in {year}
                </h3>
                <div className={styles.blocks}>
                    <Block title="Bilateral and core multilateral, share of gross disbursements">
                        {bilateralShare === null || multilateralShare === null ? (
                            <p className={styles.missing}>{NOT_PUBLISHED}</p>
                        ) : (
                            <>
                                <Track
                                    segments={[
                                        { share: bilateralShare, colour: SCOPE_COLOURS.bilateral },
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
                                        Core multilateral <b>{formatShare(multilateralShare)}</b>
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
                                <p className={styles.figure}>{formatShare(refugeeShare)}</p>
                                <Track
                                    segments={[
                                        { share: refugeeShare, colour: SCOPE_COLOURS.refugeeCosts },
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
                                <p className={styles.figure}>{odaGni.toFixed(2)}%</p>
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
                        The OECD publishes these splits for {year} with its final figures.
                    </p>
                )}
                <CardFoot>
                    <SourceLine />
                </CardFoot>
            </div>
        </section>
    );
};
