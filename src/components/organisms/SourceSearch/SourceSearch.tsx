'use client';

import classNames from 'classnames';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import styles from './SourceSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
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
 * publisher, and picking it again unticks it. The list stays open for the
 * next pick, and the field's placeholder counts the picks. A cross at the
 * field's right clears the text and the picks. Every row is reachable by
 * keyboard (arrows move, Enter picks, Escape closes the list, then clears
 * the field).
 *
 * The list renders into the document body, placed under the field, because
 * the hero clips its overflow to keep the map inside and would cut the list
 * at its bottom edge. A page scroll closes the list, since a fixed list over
 * a moving page would slide across the header.
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
    const listRef = useRef<HTMLUListElement>(null);
    // Where the list sits, under the field and as wide as it.
    const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);

    // Keeps the current place when the field has not moved, so a measure
    // without movement does not re-render.
    const measure = useCallback(() => {
        const rect = fieldRef.current?.getBoundingClientRect();

        if (!rect) {
            return;
        }

        const next = { top: rect.bottom + 2, left: rect.left, width: rect.width };

        setPlace((current) =>
            current?.top === next.top && current.left === next.left && current.width === next.width
                ? current
                : next,
        );
    }, []);

    const openList = () => {
        measure();
        setOpen(true);
    };

    useEffect(() => {
        if (!shown) {
            return;
        }

        const field = fieldRef.current;

        // A scroll anywhere but in the list itself moves the field, so it
        // closes the list.
        const onScroll = (event: Event) => {
            if (!(event.target instanceof Node && listRef.current?.contains(event.target))) {
                setOpen(false);
                setActive(-1);
            }
        };

        // The controls rise into place with a CSS reveal animation (data-reveal),
        // and a field focused during it moves until the animation ends.
        const onAnimationEnd = (event: AnimationEvent) => {
            if (event.target instanceof Node && field && event.target.contains(field)) {
                measure();
            }
        };

        const resizes = new ResizeObserver(measure);

        if (field) {
            resizes.observe(field);
        }

        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        window.addEventListener('resize', measure);
        document.addEventListener('animationend', onAnimationEnd);

        return () => {
            window.removeEventListener('scroll', onScroll, { capture: true });
            window.removeEventListener('resize', measure);
            document.removeEventListener('animationend', onAnimationEnd);
            resizes.disconnect();
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

        // Enter picks only a highlighted row. A pick toggles a filter, so
        // Enter leaves the first row alone when no row is highlighted.
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
                    <Button
                        variant="plain"
                        icon="closer"
                        className={styles.clear}
                        aria-label="Clear the search"
                        // Keeps focus in the field, so the list stays open after.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            // The picks clear first. Their write pushes a history
                            // entry, and the text's write then replaces it, so Back
                            // restores the text together with the picks.
                            onClearSelected();
                            onChange('');
                            setActive(-1);
                            inputRef.current?.focus();
                        }}
                    />
                )}
            </label>
            {shown &&
                place &&
                createPortal(
                    <ul
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        aria-label="Publishers"
                        aria-multiselectable="true"
                        className={styles.list}
                        style={place}
                        // Keeps focus in the field when a row or the list's own
                        // scrollbar is pressed, which some browsers would focus,
                        // so the blur does not close the list first.
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
