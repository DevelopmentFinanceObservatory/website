import { useId } from 'react';

import styles from './CardPage.module.scss';

import {
    baseYears,
    currencyRows,
    priceRows,
    withBaseYear,
    withCurrency,
    withPrices,
} from '@/lib/studio/unitChoice';
import type { UnitChoice, UnitOffer } from '@/lib/studio/wire';

/**
 * The unit picker's choices: the currency and, for constant prices, the base
 * year as native selects, and the price basis as radios. Every pick lands on
 * a unit the offer serves (`unitChoice.ts`).
 */
const UnitPick = ({
    offer,
    unit,
    onChange,
}: {
    offer: UnitOffer;
    unit: UnitChoice;
    onChange: (unit: UnitChoice) => void;
}) => {
    const id = useId();
    const currencies = currencyRows(offer, unit, true);
    const prices = priceRows(offer, unit);
    const years = baseYears(offer, unit);

    return (
        <div className={styles.unitPick}>
            {currencies.length > 1 && (
                <label className={styles.pickField}>
                    <span className={styles.pickLabel}>Currency</span>
                    <select
                        className={styles.select}
                        value={unit.currency}
                        data-pick-focus={prices.length < 2 || undefined}
                        onChange={(event) =>
                            onChange(withCurrency(offer, unit, event.target.value))
                        }
                    >
                        {currencies.map((row) => (
                            <option key={row.value} value={row.value}>
                                {row.label}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {prices.length > 1 && (
                <div className={styles.radios} role="radiogroup" aria-label="Prices">
                    {prices.map((row) => (
                        <label key={row.value} className={styles.option}>
                            <input
                                type="radio"
                                name={`${id}-prices`}
                                value={row.value}
                                checked={unit.prices === row.value}
                                data-pick-focus={unit.prices === row.value || undefined}
                                onChange={() => onChange(withPrices(offer, unit, row.value))}
                            />
                            {row.label}
                        </label>
                    ))}
                </div>
            )}
            {unit.prices === 'constant' && years.length > 1 && (
                <label className={styles.pickField}>
                    <span className={styles.pickLabel}>Base year</span>
                    <select
                        className={styles.select}
                        value={unit.base_year ?? ''}
                        onChange={(event) =>
                            onChange(withBaseYear(unit, Number(event.target.value)))
                        }
                    >
                        {years.map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                        ))}
                    </select>
                </label>
            )}
        </div>
    );
};

export default UnitPick;
