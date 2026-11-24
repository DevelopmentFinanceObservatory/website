'use client';

import classNames from 'classnames';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './SourceSearch.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { enterChoice, escapeAction, stepActive } from '@/lib/graphExplorer/search';
import type { PublisherOption } from '@/lib/sources/search';

type SourceSearchProps = {
    value: string;
    onChange: (value: string) => void;
    // The publishers the list offers for the value, with their source counts.
    options: readonly PublisherOption[];
};

/**
 * The Sources page's search box: a field on the dark ground with a list of
 * publishers under it while the field has focus. Typing narrows the list to
 * the publishers whose name holds the text, and picking one puts its name
 * in the field. A cross at the field's right clears it. Every row is
 * reachable by keyboard (arrows move, Enter picks, Escape closes the list,
 * then clears the field).
 *
 * The list renders into the document body, placed under the field, because
 * the hero clips its overflow to keep the map inside and would cut the list
 * at its bottom edge.
 */
const SourceSearch = ({ value, onChange, options }: SourceSearchProps) => {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    // Set when the arrow keys move the active row, so only they scroll the list.
    const stepped = useRef(false);
    const id = useId();
    const listId = `${id}-publishers`;
    const shown = open && options.length > 0;
    const fieldRef = useRef<HTMLLabelElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // Where the list sits: under the field, as wide as it. Measured as the
    // list opens and again as the page scrolls or resizes while it is open.
    const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);

    const measure = useCallback(() => {
        const rect = fieldRef.current?.getBoundingClientRect();

        if (rect) {
            setPlace({ top: rect.bottom + 2, left: rect.left, width: rect.width });
        }
    }, []);

    const openList = () => {
        measure();
        setOpen(true);
    };

    useEffect(() => {
        if (!shown) {
            return;
        }

        window.addEventListener('scroll', measure, true);
        window.addEventListener('resize', measure);

        return () => {
            window.removeEventListener('scroll', measure, true);
            window.removeEventListener('resize', measure);
        };
    }, [shown, measure]);

    const pick = (option: PublisherOption) => {
        onChange(option.label);
        setOpen(false);
        setActive(-1);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const count = options.length;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();

            if (count === 0) {
                return;
            }

            stepped.current = true;
            setActive((current) => stepActive(current, event.key === 'ArrowDown' ? 1 : -1, count));

            return;
        }

        if (event.key === 'Enter') {
            const chosen = enterChoice(active, count, shown);
            const option = chosen === null ? undefined : options[chosen];

            if (option) {
                event.preventDefault();
                pick(option);
            }

            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();

            if (escapeAction(shown) === 'close') {
                setOpen(false);
            } else {
                onChange('');
            }

            setActive(-1);
        }
    };

    // The list scrolls, so a row reached by the arrow keys is scrolled into it.
    useEffect(() => {
        if (!stepped.current) {
            return;
        }

        stepped.current = false;

        if (active >= 0) {
            document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
        }
    }, [active, id]);

    return (
        <div className={styles.search}>
            <label ref={fieldRef} className={classNames(styles.field, shown && styles.fieldOpen)}>
                <Icon name="search" className={styles.icon} />
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    role="combobox"
                    aria-label="Search and select sources"
                    aria-autocomplete="list"
                    aria-expanded={shown}
                    aria-controls={listId}
                    aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
                    placeholder="Search and select sources..."
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(event) => {
                        onChange(event.target.value);
                        openList();
                        setActive(-1);
                    }}
                    onFocus={openList}
                    onBlur={() => setOpen(false)}
                    onKeyDown={onKeyDown}
                />
                {value !== '' && (
                    <button
                        type="button"
                        className={styles.clear}
                        aria-label="Clear the search"
                        // Keeps focus in the field, so the list stays open after.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            onChange('');
                            setActive(-1);
                            inputRef.current?.focus();
                        }}
                    >
                        <Icon name="closer" className={styles.clearIcon} />
                    </button>
                )}
            </label>
            {shown &&
                place &&
                createPortal(
                    <ul
                        id={listId}
                        role="listbox"
                        aria-label="Publishers"
                        className={styles.list}
                        style={place}
                    >
                        {options.map((option, index) => (
                            <li
                                key={option.id}
                                id={`${id}-${index}`}
                                role="option"
                                aria-selected={index === active}
                                className={classNames(
                                    styles.option,
                                    index === active && styles.optionActive,
                                )}
                                // Keeps focus in the field so the blur does not close the list first.
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => pick(option)}
                                onMouseMove={() => setActive(index)}
                            >
                                <span className={styles.name}>{option.label}</span>
                                <span className={styles.count}>{option.count}</span>
                            </li>
                        ))}
                    </ul>,
                    document.body,
                )}
        </div>
    );
};

export default SourceSearch;
