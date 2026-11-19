'use client';

import styles from './DebtThresholds.module.scss';
import { NetTransfers } from './NetTransfers';
import { useTransfers } from './useTransfers';

import type { Group } from '../_lib/thresholds.ts';
import {
    groupTransfers,
    transfersHeading,
    type LineKey,
    type TransfersData,
    type TransfersMembers,
} from '../_lib/transfers.ts';

const QUESTION = 'How much do these countries borrow, net of what they repay?';

const Ready = ({
    data,
    groupOf,
    groupSource,
    highlight,
}: {
    data: TransfersData;
    groupOf: (iso3: string) => Group | null;
    groupSource: string;
    highlight: LineKey | null;
}) => {
    const { lines } = groupTransfers(data, groupOf);

    return (
        <>
            <h2 id="net-transfers" className={styles.sectionHeading}>
                {transfersHeading(lines, data.years)}
            </h2>
            <p className={styles.sectionLede}>
                Net transfers are loans received minus repayments and interest, {data.years[0]} to{' '}
                {data.years.at(-1)}. The lines group countries as the chart above does and follow
                its view and capacity controls. Below zero, a group pays its creditors more than it
                borrows.
            </p>
            <NetTransfers
                data={data}
                groupOf={groupOf}
                groupSource={groupSource}
                highlight={highlight}
            />
        </>
    );
};

/**
 * The net-transfers section. The rows come from the transfers ref in the browser, so the
 * section shows a loading line, then the chart, or the error when the read fails.
 */
export const TransfersSection = ({
    members,
    groupOf,
    groupSource,
    highlight,
}: {
    members: TransfersMembers;
    groupOf: (iso3: string) => Group | null;
    groupSource: string;
    highlight: LineKey | null;
}) => {
    const state = useTransfers(members);

    return (
        <section className={styles.transfers} aria-labelledby="net-transfers">
            {state.status === 'ready' ? (
                <Ready
                    data={state.data}
                    groupOf={groupOf}
                    groupSource={groupSource}
                    highlight={highlight}
                />
            ) : (
                <>
                    <h2 id="net-transfers" className={styles.sectionHeading}>
                        {QUESTION}
                    </h2>
                    {state.status === 'loading' ? (
                        <p className={styles.sectionLede} role="status">
                            Loading net transfers from the Development Finance Observatory.
                        </p>
                    ) : (
                        <p className={styles.sectionLede} role="alert">
                            Net transfers could not be loaded: {state.error.message}. Reload the
                            page to try again.
                        </p>
                    )}
                </>
            )}
        </section>
    );
};
