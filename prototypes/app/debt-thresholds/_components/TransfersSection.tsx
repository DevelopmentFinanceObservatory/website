import styles from './DebtThresholds.module.scss';
import { NetTransfers } from './NetTransfers';

import type { Group } from '../_lib/thresholds.ts';
import {
    groupTransfers,
    transfersHeading,
    type LineKey,
    type TransfersData,
} from '../_lib/transfers.ts';

/**
 * The net-transfers section, drawn from the net transfers the build read from DFO
 * (_lib/build.ts), so the browser reads nothing. Its heading states the swing of the grouping
 * on screen.
 */
export const TransfersSection = ({
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
        <section
            className={styles.transfers}
            aria-labelledby="net-transfers"
            data-read-tier="built"
            data-read-live="built"
        >
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
        </section>
    );
};
