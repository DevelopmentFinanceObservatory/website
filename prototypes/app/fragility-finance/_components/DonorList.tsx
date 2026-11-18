import styles from './DonorList.module.scss';

import type { DonorShare } from '../_data/types.ts';
import { LABELS } from '../_lib/copy.ts';
import { formatChange, formatMoney } from '../_lib/format.ts';

/**
 * The largest providers of ODA in 2024 as bars, each with its total ODA's change from 2024
 * to 2025. Six rows always, keyed by slot, so the page below never moves; an empty slot
 * and a change DAC1 does not hold are empty cells.
 */
export const DonorList = ({ donors }: { donors: readonly (DonorShare | null)[] }) => {
    const largest = Math.max(1, ...donors.map((donor) => donor?.value ?? 0));

    return (
        <table className={styles.table}>
            <thead>
                <tr>
                    <th scope="col">Donor</th>
                    <th scope="col">ODA, 2024</th>
                    <th scope="col" className={styles.change}>
                        {LABELS.donorChange}
                    </th>
                </tr>
            </thead>
            <tbody>
                {donors.map((donor, slot) => (
                    // Rows are slots: a new donor takes the slot's place.
                    <tr key={slot} data-empty={donor === null}>
                        <th scope="row" className={styles.name}>
                            <span
                                key={donor?.name ?? 'none'}
                                className={styles.donor}
                                title={donor?.name}
                            >
                                {donor?.name ?? ''}
                            </span>
                        </th>
                        <td>
                            <div className={styles.amount}>
                                <span className={styles.track} aria-hidden="true">
                                    <span
                                        className={styles.bar}
                                        style={{
                                            transform: `scaleX(${(donor?.value ?? 0) / largest})`,
                                        }}
                                    />
                                </span>
                                <span key={donor?.value ?? 'none'} className={styles.value}>
                                    {donor === null ? '' : formatMoney(donor.value)}
                                </span>
                            </div>
                        </td>
                        <td
                            className={styles.change}
                            data-falling={donor?.change2025 != null && donor.change2025 < 0}
                        >
                            <span key={donor?.change2025 ?? 'none'} className={styles.fade}>
                                {donor?.change2025 == null ? '' : formatChange(donor.change2025)}
                            </span>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
