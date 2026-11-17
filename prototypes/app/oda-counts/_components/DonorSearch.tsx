'use client';

import { useId, useState, type KeyboardEvent } from 'react';

import styles from './DonorSearch.module.scss';

import type { Donor } from '../_data/types.ts';
import { matchDonors } from '../_lib/counts.ts';

/**
 * A type-to-find donor box: an ARIA combobox showing the chosen donor's name until it
 * takes focus, then every donor matching what is typed, countries before group totals.
 * Arrow keys move through the list, Enter chooses, Escape closes.
 */
export const DonorSearch = ({
    donors,
    selected,
    onChoose,
}: {
    donors: Donor[];
    selected: Donor;
    onChoose: (id: string) => void;
}) => {
    const id = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const matches = matchDonors(donors, query);
    const activeOption = open ? matches[active] : undefined;
    const optionId = (donor: Donor) => `${id}-${donor.id.replace(/\W/g, '-')}`;

    const close = () => {
        setOpen(false);
        setQuery('');
        setActive(0);
    };

    const choose = (donor: Donor) => {
        onChoose(donor.id);
        close();
    };

    const move = (next: number) => {
        setActive(next);
        // Keeps the active option in view in the scrolling list.
        const option = matches[next];

        if (option !== undefined) {
            requestAnimationFrame(() =>
                document.getElementById(optionId(option))?.scrollIntoView({ block: 'nearest' }),
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
                choose(activeOption);
            }
        } else if (event.key === 'Escape') {
            close();
        }
    };

    const firstGroup = matches.findIndex((donor) => donor.isGroup);

    return (
        <div className={styles.search}>
            <label htmlFor={`${id}-input`} className={styles.label}>
                Donor
            </label>
            <div className={styles.field}>
                <input
                    id={`${id}-input`}
                    className={styles.input}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Type a donor's name"
                    aria-autocomplete="list"
                    aria-expanded={open}
                    aria-controls={`${id}-list`}
                    aria-activedescendant={
                        activeOption === undefined ? undefined : optionId(activeOption)
                    }
                    value={open ? query : selected.name}
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
                    aria-label="Donors"
                    className={styles.list}
                    hidden={!open}
                >
                    {matches.map((donor, index) => (
                        <li
                            key={donor.id}
                            id={optionId(donor)}
                            role="option"
                            aria-selected={index === active}
                            data-first-group={index === firstGroup && index > 0}
                            className={styles.option}
                            // Chosen on mouse down, before the input's blur closes the list.
                            onMouseDown={(event) => {
                                event.preventDefault();
                                choose(donor);
                            }}
                            onMouseMove={() => setActive(index)}
                        >
                            <span className={styles.name}>{donor.name}</span>
                            {donor.isGroup && <span className={styles.tag}>group total</span>}
                        </li>
                    ))}
                    {matches.length === 0 && (
                        <li className={styles.none} role="presentation">
                            No donor matches.
                        </li>
                    )}
                </ul>
            </div>
        </div>
    );
};
