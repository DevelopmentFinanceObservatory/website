'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';

import styles from './Gallery.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import searchStyles from '@/components/organisms/DataSearch/DataSearch.module.scss';
import { OptionRow } from '@/components/organisms/DataSearch/SlotMenu';

type Option = { readonly id: string; readonly label: string };

type GalleryFilterProps = {
    label: string;
    options: readonly Option[];
    selected: readonly string[];
    onChange: (next: string[]) => void;
};

/**
 * One filter pill (Types / Regions / Sources) opening the house dropdown —
 * the same panel + OptionRow rows the search page's pickers use. Multi-
 * select, empty selection = everything; rows toggle without closing the
 * menu (OptionRow is a plain button, not a menu item). The corner count
 * shows how many options are SELECTED — absent while the filter is off.
 */
const GalleryFilter = ({ label, options, selected, onChange }: GalleryFilterProps) => {
    const toggle = (id: string) =>
        onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

    return (
        <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className={classNames(
                        styles.filterPill,
                        selected.length > 0 && styles.filterPillActive,
                    )}
                >
                    {label}
                    <Icon name="chevron-down" className={styles.filterChevron} />
                    {selected.length > 0 && (
                        <sup className={styles.filterCount}>{selected.length}</sup>
                    )}
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={searchStyles.slotMenu}
                    align="start"
                    sideOffset={6}
                    collisionPadding={16}
                >
                    <div className={searchStyles.slotMenuBody}>
                        {options.map((option) => (
                            <OptionRow
                                key={option.id}
                                checked={selected.includes(option.id)}
                                toggle
                                onClick={() => toggle(option.id)}
                            >
                                {option.label}
                            </OptionRow>
                        ))}
                    </div>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};

export default GalleryFilter;
