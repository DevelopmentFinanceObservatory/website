'use client';

import classNames from 'classnames';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './SourceSearch.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { escapeAction, stepActive } from '@/lib/graphExplorer/search';
import type { PublisherOption } from '@/lib/sources/search';

type SourceSearchProps = {
    value: string;
    onChange: (value: string) => void;
    // The publishers the list offers for the value, with their source counts.
    options: readonly PublisherOption[];
    // The publishers picked so far, by name, in the order they were picked.
    selected: readonly string[];
    // Picks the named publisher, or unpicks it when it is picked.
    onToggle: (name: string) => void;
    // Unpicks every publisher.
    onClearSelected: () => void;
};

/**
 * The Sources page's search box: a field on the dark ground with a list of
 * publishers under it while the field has focus. Typing narrows the list to
 * the publishers whose name holds the text. Picking a row ticks the
 * publisher, and picking it again unticks it; the list stays open for the
 * next pick, and the field's placeholder counts the picks. A cross at the
 * field's right clears the text and the picks. Every row is reachable by
 * keyboard (arrows move, Enter picks, Escape closes the list, then clears
 * the field).
 *
 * The list renders into the document body, placed under the field, because
 * the hero clips its overflow to keep the map inside and would cut the list
 * at its bottom edge.
 */
const SourceSearch = ({
    value,
    onChange,
    options,
    selected,
    onToggle,
    onClearSelected,
}: SourceSearchProps) => {
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

        // The field's size moves the list, as the viewport narrows.
        const resized = new ResizeObserver(measure);

        if (fieldRef.current) {
            resized.observe(fieldRef.current);
        }

        window.addEventListener('scroll', measure, true);
        window.addEventListener('resize', measure);

        return () => {
            resized.disconnect();
            window.removeEventListener('scroll', measure, true);
            window.removeEventListener('resize', measure);
        };
    }, [shown, measure]);

    const pick = (option: PublisherOption) => {
        onToggle(option.label);
        onChange('');
        setActive(-1);
        inputRef.current?.focus();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        // Keys pressed while an input method composes text (Enter commits
        // it, arrows pick a candidate) are the composition's own.
        if (event.nativeEvent.isComposing) {
            return;
        }

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

        // Enter picks only a highlighted row: a pick toggles a filter, so it
        // is never a guess at the first row.
        if (event.key === 'Enter') {
            const option = shown && active >= 0 ? options[active] : undefined;

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
                    placeholder={
                        selected.length > 0
                            ? `${selected.length} ${selected.length === 1 ? 'publisher' : 'publishers'} selected`
                            : 'Search and select sources...'
                    }
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(event) => {
                        onChange(event.target.value);
                        openList();
                        setActive(-1);
                    }}
                    onFocus={openList}
                    onBlur={() => {
                        setOpen(false);
                        setActive(-1);
                    }}
                    onKeyDown={onKeyDown}
                />
                {(value !== '' || selected.length > 0) && (
                    <button
                        type="button"
                        className={styles.clear}
                        aria-label="Clear the search"
                        // Keeps focus in the field, so the list stays open after.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            onChange('');
                            onClearSelected();
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
                        aria-multiselectable="true"
                        className={styles.list}
                        style={place}
                        // Keeps focus in the field, so the blur does not close
                        // the list first: a press on a row or on the list's own
                        // scrollbar, which some browsers would focus.
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        {options.map((option, index) => {
                            const picked = selected.includes(option.label);

                            return (
                                <li
                                    key={option.label}
                                    id={`${id}-${index}`}
                                    role="option"
                                    aria-selected={picked}
                                    className={classNames(
                                        styles.option,
                                        picked && styles.optionPicked,
                                        index === active && styles.optionActive,
                                    )}
                                    onClick={() => pick(option)}
                                    onMouseMove={() => setActive(index)}
                                >
                                    <span className={styles.name}>
                                        <span className={styles.mark} aria-hidden="true">
                                            {picked && (
                                                <Icon name="check" className={styles.markIcon} />
                                            )}
                                        </span>
                                        {option.label}
                                    </span>
                                    <span className={styles.count}>{option.count}</span>
                                </li>
                            );
                        })}
                    </ul>,
                    document.body,
                )}
        </div>
    );
};

export default SourceSearch;
