'use client';

import { useId, useState, type KeyboardEvent } from 'react';

import styles from './CountrySearch.module.scss';

import type { Country } from '../_data/types.ts';
import { money } from '../_lib/format.ts';
import { matchCountries } from '../_lib/search.ts';
import { lastAid } from '../_lib/summary.ts';

const MAX_SHOWN = 8;

/**
 * A type-to-find box for the countries: an ARIA combobox whose list matches by name,
 * ignoring accents. Arrow keys move through the list, Enter chooses, Escape clears the text. Out of focus it shows the selected country; the
 * clear button returns the page to all countries.
 */
export const CountrySearch = ({
    countries,
    year,
    chosen,
    onChoose,
    onClear,
}: {
    countries: readonly Country[];
    /** The year of the aid figure each option shows. */
    year: number;
    chosen: Country | undefined;
    onChoose: (iso3: string) => void;
    onClear: () => void;
}) => {
    const id = useId();
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState(false);
    const [active, setActive] = useState(0);

    const matches = query.trim() === '' ? [] : matchCountries(countries, query).slice(0, MAX_SHOWN);
    const expanded = editing && query.trim() !== '';
    const activeOption = expanded ? matches[active] : undefined;
    const value = editing ? query : (chosen?.name ?? '');

    const choose = (iso3: string) => {
        onChoose(iso3);
        setQuery('');
        setEditing(false);
        setActive(0);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;

            setActive((current) =>
                matches.length === 0 ? 0 : (current + step + matches.length) % matches.length,
            );
        } else if (event.key === 'Enter') {
            if (activeOption !== undefined) {
                event.preventDefault();
                choose(activeOption.iso3);
            }
        } else if (event.key === 'Escape') {
            setQuery('');
        }
    };

    return (
        <div className={styles.search}>
            <label htmlFor={`${id}-input`} className={styles.label}>
                Find a country
            </label>
            <div className={styles.field}>
                <input
                    id={`${id}-input`}
                    className={styles.input}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Kenya, Mozambique…"
                    aria-autocomplete="list"
                    aria-expanded={expanded}
                    aria-controls={`${id}-list`}
                    aria-activedescendant={
                        activeOption === undefined ? undefined : `${id}-${activeOption.iso3}`
                    }
                    value={value}
                    onFocus={(event) => {
                        setQuery(chosen?.name ?? '');
                        setEditing(true);
                        event.currentTarget.select();
                    }}
                    onChange={(event) => {
                        // Typing reopens the list after a choice, while focus stays here.
                        setQuery(event.target.value);
                        setEditing(true);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    onBlur={() => {
                        setEditing(false);
                        setQuery('');
                    }}
                />
                <button
                    type="button"
                    className={styles.clear}
                    aria-label="Clear and show all countries"
                    hidden={chosen === undefined && query === ''}
                    // Pressed before the input's blur, so the click lands.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                        setQuery('');
                        onClear();
                    }}
                >
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </button>
                <ul
                    id={`${id}-list`}
                    role="listbox"
                    aria-label="Matching countries"
                    className={styles.list}
                    hidden={!expanded}
                >
                    {matches.map((option, index) => (
                        <li
                            key={option.iso3}
                            id={`${id}-${option.iso3}`}
                            role="option"
                            aria-selected={index === active}
                            className={styles.option}
                            // Chosen on mouse down, before the input's blur closes the list.
                            onMouseDown={(event) => {
                                event.preventDefault();
                                choose(option.iso3);
                            }}
                            onMouseMove={() => setActive(index)}
                        >
                            <span className={styles.name}>{option.name}</span>
                            <span className={styles.value}>
                                {money(lastAid(option))} in {year}
                            </span>
                        </li>
                    ))}
                    {matches.length === 0 && (
                        <li className={styles.none} role="presentation">
                            No country matches.
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
};
