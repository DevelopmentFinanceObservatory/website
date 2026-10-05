/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flattened wire Spec */
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './DataSearch.module.scss';
import { OptionRow, stopMenuFieldTypeahead } from './SlotMenu';

import Button from '@/components/atoms/Button/Button';
import { currencyName } from '@/lib/search/tokenAbout';
import type { IdentityUnitRequest, UnitConversion } from '@/lib/search/types';
import {
    currencyMatches,
    currencyRequest,
    currentUnit,
    priceBases,
    pricesRequest,
    stagedUnit,
    unitPresets,
    validBaseYear,
} from '@/lib/search/unitPicker';

/**
 * The unit token's options on a convertible answer: preset currencies
 * (US dollars, euros, and the currency of each role's entity), a current
 * or constant price switch with the base year, and a search over every
 * currency the rate tables hold. The current currency is checked. A
 * currency pick keeps the price basis and base year the switch shows where
 * the picked currency converts at them, and otherwise takes the basis it
 * converts at and the nearest base year it takes. A price pick keeps the
 * currency. Every pick posts one unit request through `onPick`. The switch
 * offers only the price bases the answer's currency converts at, and the
 * base year runs inside that currency's bounds. `conversion` is the offer
 * every part the token covers serves (`sharedOffer`), so a pick serves them
 * all.
 *
 * The switch, the year and the search are menu fields, so the panel's
 * arrow keys reach them and typing in them never moves the menu's focus.
 */
export const UnitPicker = ({
    spec,
    conversion,
    onPick,
}: {
    spec: any;
    conversion: UnitConversion;
    onPick: (request: IdentityUnitRequest) => void;
}) => {
    const current = currentUnit(spec);
    const [prices, setPrices] = useState(current.prices);
    const [yearText, setYearText] = useState(
        String(current.baseYear ?? conversion.default_base_year),
    );
    const [query, setQuery] = useState('');
    const bases = priceBases(conversion, current.currency);
    const year = validBaseYear(yearText, bases);
    const name = current.currency ? currencyName(current.currency, conversion) : null;
    const unchanged = current.prices === 'constant' && year === current.baseYear;
    const matches = currencyMatches(conversion, query);
    const searchRef = useRef<HTMLDivElement>(null);

    // The matches print under the field, past the panel's scroll fold, so
    // the panel scrolls them into view as they change.
    useEffect(() => {
        if (query.trim()) searchRef.current?.scrollIntoView({ block: 'nearest' });
    }, [query]);

    const pickPrices = (next: 'current' | 'constant', baseYear: number) => {
        const request = pricesRequest(current, next, baseYear);

        if (request) onPick(request);
    };

    // Current prices need nothing more, so they apply at once. Constant
    // prices open the base year first.
    const selectCurrent = () => {
        setPrices('current');

        if (current.prices !== 'current') pickPrices('current', conversion.default_base_year);
    };

    const currencyRow = (
        code: string,
        label: string,
        currency: IdentityUnitRequest['currency'],
    ) => {
        const checked = code === current.currency;
        const request = currencyRequest(stagedUnit(current, prices, year), currency, conversion);

        // A currency the answer converts to at neither basis has no row.
        if (!checked && !request) return null;

        return (
            <DropdownMenu.Item
                key={code}
                asChild
                onSelect={() => {
                    if (!checked && request) onPick(request);
                }}
            >
                <OptionRow checked={checked} meta={code}>
                    {label}
                </OptionRow>
            </DropdownMenu.Item>
        );
    };

    return (
        <>
            {unitPresets(spec, conversion).map((preset) =>
                currencyRow(preset.code, preset.label, preset.currency),
            )}
            <div className={styles.unitGroup}>
                <p className={styles.slotGroupTitle}>Prices</p>
                <div className={styles.unitSwitch} role="group" aria-label="Prices">
                    {(['current', 'constant'] as const).map((basis) => (
                        <button
                            key={basis}
                            type="button"
                            className={classNames(
                                styles.unitSwitchOption,
                                prices === basis && styles.unitSwitchOptionOn,
                            )}
                            aria-pressed={prices === basis}
                            disabled={basis === 'current' ? !bases.current : !bases.baseYears}
                            data-menu-field="field"
                            onClick={() =>
                                basis === 'current' ? selectCurrent() : setPrices('constant')
                            }
                            onKeyDown={stopMenuFieldTypeahead}
                        >
                            {basis === 'current' ? 'Current' : 'Constant'}
                        </button>
                    ))}
                </div>
                {name && !bases.current && (
                    <p className={styles.slotNote}>
                        No exchange rates for {name} at current prices.
                    </p>
                )}
                {name && !bases.baseYears && (
                    <p className={styles.slotNote}>No base year for {name} at constant prices.</p>
                )}
                {prices === 'constant' && bases.baseYears && (
                    <form
                        className={styles.windowInputs}
                        onSubmit={(event) => {
                            event.preventDefault();

                            if (year != null && !unchanged) pickPrices('constant', year);
                        }}
                    >
                        <input
                            className={styles.windowInput}
                            data-menu-field="field"
                            value={yearText}
                            onChange={(event) => setYearText(event.target.value)}
                            onKeyDown={stopMenuFieldTypeahead}
                            inputMode="numeric"
                            aria-label={`Base year, ${bases.baseYears.min} to ${bases.baseYears.max}`}
                            aria-invalid={year == null}
                            autoComplete="off"
                        />
                        <Button
                            variant="dark"
                            type="submit"
                            data-menu-field="field"
                            disabled={year == null || unchanged}
                        >
                            {year == null
                                ? `${bases.baseYears.min} to ${bases.baseYears.max}`
                                : `Use ${year} prices`}
                        </Button>
                    </form>
                )}
            </div>
            <div ref={searchRef} className={styles.unitGroup}>
                <input
                    className={styles.slotInput}
                    data-menu-field="field"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={stopMenuFieldTypeahead}
                    placeholder="Other currency…"
                    aria-label="Other currency"
                    autoComplete="off"
                />
                {matches.map(({ code, name }) => currencyRow(code, name, code))}
                {query.trim() && matches.length === 0 && (
                    <p className={styles.slotNote}>No currency matches.</p>
                )}
            </div>
        </>
    );
};
