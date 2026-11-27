'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';

import styles from './FilterMenu.module.scss';

import Icon from '@/components/atoms/Icon/Icon';

export type FilterMenuOption = { value: string; label: string; count: number };

type FilterMenuProps = {
    // The trigger's label: what the filter covers with nothing picked ("All Types").
    label: string;
    options: readonly FilterMenuOption[];
    selected: readonly string[];
    onChange: (next: string[]) => void;
};

/**
 * A filter of any number of values: a chip that names it, with the count of
 * values picked riding its corner, and a menu of the values with a tick each
 * and how many items carry it. Picking a value keeps the menu open for the
 * next one, and "Clear" unpicks them all. A picked value the options lack
 * (a stale link) is listed with a count of 0 so it can be unticked, and the
 * trigger stays open while anything is picked.
 */
const FilterMenu = ({ label, options, selected, onChange }: FilterMenuProps) => {
    const toggle = (value: string) =>
        onChange(
            selected.includes(value)
                ? selected.filter((picked) => picked !== value)
                : [...selected, value],
        );

    const listed: readonly FilterMenuOption[] = [
        ...options,
        ...selected
            .filter((value) => !options.some((option) => option.value === value))
            .map((value) => ({ value, label: value, count: 0 })),
    ];

    return (
        <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger
                className={classNames(styles.trigger, selected.length > 0 && styles.triggerOn)}
                disabled={listed.length === 0}
                aria-label={
                    selected.length > 0 ? `${label}, ${selected.length} selected` : undefined
                }
            >
                {label}
                <Icon name="chevron-down" className={styles.chevron} />
                {selected.length > 0 && (
                    <span className={styles.count} aria-hidden="true">
                        {selected.length}
                    </span>
                )}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.menu}
                    align="start"
                    sideOffset={6}
                    collisionPadding={16}
                >
                    {listed.map((option) => (
                        <DropdownMenu.CheckboxItem
                            key={option.value}
                            className={styles.option}
                            checked={selected.includes(option.value)}
                            // The menu stays open for the next pick.
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={() => toggle(option.value)}
                        >
                            <span className={styles.name}>
                                <span className={styles.mark} aria-hidden="true">
                                    <DropdownMenu.ItemIndicator>
                                        <Icon name="check" className={styles.markIcon} />
                                    </DropdownMenu.ItemIndicator>
                                </span>
                                {option.label}
                            </span>
                            <span className={styles.optionCount}>{option.count}</span>
                        </DropdownMenu.CheckboxItem>
                    ))}
                    {selected.length > 0 && (
                        <DropdownMenu.Item className={styles.clear} onSelect={() => onChange([])}>
                            Clear
                        </DropdownMenu.Item>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};

export default FilterMenu;
