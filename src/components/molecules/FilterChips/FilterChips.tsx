'use client';

import classNames from 'classnames';

import styles from './FilterChips.module.scss';

export type FilterChipGroup<Id extends string> = { id: Id; label: string; color: string };

type FilterChipsProps<Id extends string> = {
    groups: readonly FilterChipGroup<Id>[];
    // Per-group counts for the corner square.
    counts: Partial<Record<Id, number>>;
    // The selection; empty = All.
    selected: readonly Id[];
    onChange: (next: Id[]) => void;
    // 'single': a pick replaces the selection rather than adding to it, and
    // picking the active chip again goes back to All. For a set of groups a
    // card can only belong to one of, where stacking chips widens the list
    // instead of narrowing it and reads as broken (QA-15).
    mode?: 'multi' | 'single';
    // How "All" reads: the light chip (Sources) or the dark one (Roadmap).
    allTone?: 'light' | 'dark';
    // Between chips: rem(6) (Sources) or 2px (Roadmap).
    gap?: 'normal' | 'tight';
    className?: string;
};

/**
 * The group filter chips: mono label on the group's colour, the count as a
 * tiny dark square riding the top-right corner, "All" first. Multi-select by
 * default, see `mode` — unselected chips sit back at 60%.
 */
const FilterChips = <Id extends string>({
    groups,
    counts,
    selected,
    onChange,
    mode = 'multi',
    allTone = 'light',
    gap = 'normal',
    className,
}: FilterChipsProps<Id>) => {
    const toggle = (id: Id) => {
        const on = selected.includes(id);

        if (mode === 'single') {
            onChange(on ? [] : [id]);

            return;
        }

        onChange(on ? selected.filter((g) => g !== id) : [...selected, id]);
    };

    return (
        <div className={classNames(styles.chips, gap === 'tight' && styles.chipsTight, className)}>
            <button
                type="button"
                className={classNames(
                    styles.chip,
                    allTone === 'dark' && styles.chipDark,
                    selected.length === 0 && styles.chipActive,
                )}
                aria-pressed={selected.length === 0}
                onClick={() => onChange([])}
            >
                All
            </button>
            {groups.map((g) => (
                <button
                    key={g.id}
                    type="button"
                    className={classNames(
                        styles.chip,
                        selected.includes(g.id) && styles.chipActive,
                    )}
                    style={{ '--chip': g.color } as React.CSSProperties}
                    aria-pressed={selected.includes(g.id)}
                    onClick={() => toggle(g.id)}
                >
                    {g.label}
                    <sup className={styles.chipCount}>{counts[g.id] ?? 0}</sup>
                </button>
            ))}
        </div>
    );
};

export default FilterChips;
