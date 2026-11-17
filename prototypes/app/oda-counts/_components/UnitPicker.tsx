'use client';

import { useId, useState, type KeyboardEvent } from 'react';

import styles from './UnitPicker.module.scss';

import type { Offer, Prices } from '../_data/types.ts';
import {
    currencyMatches,
    currencyNoun,
    pickCurrency,
    priceBases,
    validBaseYear,
    type CurrencyOption,
    type Unit,
} from '../_lib/live.ts';

/** The currencies listed first, before the search finds any other. */
const PINNED = ['USD', 'EUR'];

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The currency box: an ARIA combobox showing the unit's currency until it takes focus,
 * then every currency in the offer matching what is typed, by name, US dollars and euros
 * first while nothing is typed. Arrow keys move through the list, Enter chooses, Escape
 * closes.
 */
const CurrencySearch = ({
    offer,
    unit,
    onPick,
}: {
    offer: Offer;
    unit: Unit;
    onPick: (code: string) => void;
}) => {
    const id = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const found = currencyMatches(offer, query).filter(
        ({ code }) => pickCurrency(unit, code, offer) !== null,
    );
    const pinned =
        query.trim() === '' ? PINNED.filter((code) => found.some((o) => o.code === code)) : [];
    const matches: CurrencyOption[] = [
        ...pinned.flatMap((code) => found.filter((option) => option.code === code)),
        ...found.filter(({ code }) => !pinned.includes(code)),
    ];
    const activeOption = open ? matches[active] : undefined;
    const optionId = (code: string) => `${id}-${code}`;
    const label = `Search ${offer.currencies.length} currencies by name or code`;

    const close = () => {
        setOpen(false);
        setQuery('');
        setActive(0);
    };

    const choose = (code: string) => {
        if (code !== unit.currency) {
            onPick(code);
        }

        close();
    };

    const move = (next: number) => {
        setActive(next);
        const option = matches[next];

        if (option !== undefined) {
            requestAnimationFrame(() =>
                document
                    .getElementById(optionId(option.code))
                    ?.scrollIntoView({ block: 'nearest' }),
            );
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();

            if (!open) {
                setOpen(true);

                return;
            }

            if (matches.length > 0) {
                const step = event.key === 'ArrowDown' ? 1 : -1;

                move((active + step + matches.length) % matches.length);
            }
        } else if (event.key === 'Enter') {
            if (activeOption !== undefined) {
                event.preventDefault();
                choose(activeOption.code);
            }
        } else if (event.key === 'Escape') {
            close();
        }
    };

    return (
        <span className={styles.control}>
            <label htmlFor={`${id}-input`}>Currency</label>
            <span className={styles.field}>
                <input
                    id={`${id}-input`}
                    className={styles.input}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={label}
                    title={label}
                    aria-autocomplete="list"
                    aria-expanded={open}
                    aria-controls={`${id}-list`}
                    aria-activedescendant={
                        activeOption === undefined ? undefined : optionId(activeOption.code)
                    }
                    value={open ? query : capitalise(currencyNoun(offer, unit.currency))}
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    onBlur={close}
                />
                <ul
                    id={`${id}-list`}
                    role="listbox"
                    aria-label="Currencies"
                    className={styles.list}
                    hidden={!open}
                >
                    {matches.map((option, index) => (
                        <li
                            key={option.code}
                            id={optionId(option.code)}
                            role="option"
                            aria-selected={index === active}
                            data-checked={option.code === unit.currency}
                            data-after-pinned={pinned.length > 0 && index === pinned.length}
                            className={styles.option}
                            // Chosen on mouse down, before the input's blur closes the list.
                            onMouseDown={(event) => {
                                event.preventDefault();
                                choose(option.code);
                            }}
                            onMouseMove={() => setActive(index)}
                        >
                            <span>{option.name}</span>
                            <span className={styles.code}>{option.code}</span>
                        </li>
                    ))}
                    {matches.length === 0 && (
                        <li className={styles.none} role="presentation">
                            No currency matches.
                        </li>
                    )}
                </ul>
            </span>
        </span>
    );
};

/**
 * The base year box: four digits inside the currency's run, applied on Enter or when the
 * box loses focus, and reset to the unit's year when what is typed is not one.
 */
const BaseYear = ({
    unit,
    bounds,
    onPick,
}: {
    unit: Unit;
    bounds: { min: number; max: number };
    onPick: (year: number) => void;
}) => {
    const id = useId();
    const [text, setText] = useState(String(unit.baseYear));
    const year = validBaseYear(text, { current: true, baseYears: bounds });

    const apply = () => {
        if (year === null) {
            setText(String(unit.baseYear));
        } else if (year !== unit.baseYear) {
            onPick(year);
        }
    };

    return (
        <span className={styles.control}>
            <label htmlFor={id}>Base year</label>
            <input
                id={id}
                className={styles.year}
                inputMode="numeric"
                autoComplete="off"
                value={text}
                aria-invalid={year === null}
                aria-describedby={`${id}-range`}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        apply();
                    }
                }}
                onBlur={apply}
            />
            <span id={`${id}-range`} className={styles.range}>
                {bounds.min} to {bounds.max}
            </span>
        </span>
    );
};

/**
 * The unit every figure on the page is in, modelled on the DFO data page's unit picker: a
 * search over every currency the offer holds, current or constant prices, and for
 * constant prices a base year inside the currency's run. A currency pick keeps the price
 * basis and base year where the currency converts at them. The switch offers only the
 * bases the currency converts at.
 */
export const UnitPicker = ({
    offer,
    unit,
    onPick,
}: {
    offer: Offer;
    unit: Unit;
    onPick: (unit: Unit) => void;
}) => {
    const bases = priceBases(offer, unit.currency);

    const pickPrices = (prices: Prices) => {
        if (prices !== unit.prices) {
            onPick({ ...unit, prices });
        }
    };

    return (
        <>
            <CurrencySearch
                offer={offer}
                unit={unit}
                onPick={(code) => {
                    const next = pickCurrency(unit, code, offer);

                    if (next !== null) {
                        onPick(next);
                    }
                }}
            />
            <span className={styles.seg} role="group" aria-label="Prices">
                {(['current', 'constant'] as const).map((prices) => (
                    <button
                        key={prices}
                        type="button"
                        aria-pressed={unit.prices === prices}
                        disabled={prices === 'current' ? !bases.current : bases.baseYears === null}
                        onClick={() => pickPrices(prices)}
                    >
                        {prices === 'current' ? 'Current prices' : 'Constant prices'}
                    </button>
                ))}
            </span>
            {unit.prices === 'constant' && bases.baseYears !== null && (
                <BaseYear
                    key={`${unit.currency} ${unit.baseYear}`}
                    unit={unit}
                    bounds={bases.baseYears}
                    onPick={(baseYear) => onPick({ ...unit, baseYear })}
                />
            )}
        </>
    );
};
