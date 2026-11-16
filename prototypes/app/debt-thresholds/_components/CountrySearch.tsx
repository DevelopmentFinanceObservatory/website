'use client';

import { useId, useState, type KeyboardEvent } from 'react';

import styles from './CountrySearch.module.scss';
import { GROUP_COLOURS } from './ThresholdScatter';

import type { Group } from '../_lib/thresholds.ts';

export type SearchOption = { iso3: string; name: string; group: Group };

const MAX_SHOWN = 8;

/** Lower case without accents, so "sao" finds São Tomé and Príncipe. */
const fold = (text: string): string =>
    text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

/**
 * Options matching `query`: names that start with it, then an exact ISO3 code, then names
 * with a word that starts with it, then names that contain it.
 */
export const matchCountries = (options: SearchOption[], query: string): SearchOption[] => {
    const q = fold(query.trim());

    if (q === '') {
        return [];
    }

    const rank = ({ iso3, name }: SearchOption): number => {
        const folded = fold(name);

        if (folded.startsWith(q)) {
            return 0;
        }

        if (iso3.toLowerCase() === q) {
            return 1;
        }

        if (folded.split(/[\s-]+/).some((word) => word.startsWith(q))) {
            return 2;
        }

        return folded.includes(q) ? 3 : 4;
    };

    return options
        .map((option) => ({ option, score: rank(option) }))
        .filter(({ score }) => score < 4)
        .toSorted((a, b) => a.score - b.score || a.option.name.localeCompare(b.option.name))
        .map(({ option }) => option);
};

/**
 * A type-to-find country box: an ARIA combobox with a list of matches by name or ISO3
 * code. Arrow keys move through the list, Enter chooses, Escape closes and then clears.
 * Choosing calls `onChoose` with the country's ISO3 code and empties the box.
 */
export const CountrySearch = ({
    options,
    onChoose,
    label = 'Find a country',
}: {
    options: SearchOption[];
    onChoose: (iso3: string) => void;
    label?: string;
}) => {
    const id = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const matches = matchCountries(options, query).slice(0, MAX_SHOWN);
    const expanded = open && query.trim() !== '';
    const activeOption = expanded ? matches[active] : undefined;

    const choose = (iso3: string) => {
        onChoose(iso3);
        setQuery('');
        setOpen(false);
        setActive(0);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!expanded) {
                setOpen(true);

                return;
            }

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
            if (expanded) {
                setOpen(false);
            } else {
                setQuery('');
            }
        }
    };

    return (
        <div className={styles.search}>
            <label htmlFor={`${id}-input`} className={styles.label}>
                {label}
            </label>
            <div className={styles.field}>
                <input
                    id={`${id}-input`}
                    className={styles.input}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Name or ISO3 code"
                    aria-autocomplete="list"
                    aria-expanded={expanded}
                    aria-controls={`${id}-list`}
                    aria-activedescendant={
                        activeOption === undefined ? undefined : `${id}-${activeOption.iso3}`
                    }
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    onBlur={() => setOpen(false)}
                />
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
                            <span
                                className={styles.swatch}
                                style={{ background: GROUP_COLOURS[option.group] }}
                                aria-hidden="true"
                            />
                            <span className={styles.name}>{option.name}</span>
                            <span className={styles.code}>{option.iso3}</span>
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
