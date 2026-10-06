'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import { createContext, useId, useState } from 'react';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import { onMenuContentKeyDownCapture } from '@/lib/search/menuContentKeys';
import { dcidSetsEqual, multiSelectApplyLabel, toggleDcid } from '@/lib/search/pickerState';

export { onMenuContentKeyDownCapture };

/** @radix-ui/react-roving-focus's own unexported ENTRY_FOCUS event, fired
 *  whenever the content node itself (not a row) gets focus, including on
 *  every pointer-leave during a scroll, not just the keyboard open.
 *  preventDefault() here cancels Radix's default of focusing the first row
 *  so the filter can take it instead. */
const ENTRY_FOCUS_EVENT = 'rovingFocusGroup.onEntryFocus';

/** Attached as a ref callback (SubContent's prop type omits onEntryFocus)
 *  so it runs ahead of Radix's own roving-focus effect. `handled` limits
 *  this to the first entry focus per mount (the keyboard open), since a
 *  scroll's pointer-leave re-fires the same event and would otherwise
 *  re-focus the filter on every step. */
export const menuEntryFocusRef = (node: HTMLElement | null): (() => void) | undefined => {
    if (!node) return undefined;

    let handled = false;

    const onEntryFocus = (event: Event) => {
        if (handled) return;

        handled = true;

        const filter = node.querySelector<HTMLElement>('[data-menu-field="filter"]');

        if (!filter) return;

        event.preventDefault();
        filter.focus();
    };

    node.addEventListener(ENTRY_FOCUS_EVENT, onEntryFocus);

    return () => node.removeEventListener(ENTRY_FOCUS_EVENT, onEntryFocus);
};

/** Stops a printable character typed into a menu field (a filter box, or
 *  Space on a field's button) from also reaching Radix's typeahead, which
 *  would yank focus to a matching row. Escape, Enter, and the arrow keys
 *  still propagate normally. */
export const stopMenuFieldTypeahead = (event: React.KeyboardEvent<HTMLElement>): void => {
    const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
    const isCharacterKey = event.key.length === 1;

    if (!isModifierKey && isCharacterKey) {
        event.stopPropagation();
    }
};

/** A slot trigger's accessible name: the field it edits, the variable when
 *  several share the page, and the current value ("Place: Kenya", "Method
 *  for GDP: Census"). The visible trigger shows the value alone. */
export const slotAriaLabel = (field: string, value: string, variable?: string | null): string =>
    `${field}${variable ? ` for ${variable}` : ''}: ${value.trim()}`;

/** One popover shell for every editable slot in the sentence. `marked` flags
 *  a slot that still needs a decision (an ambiguous wording), with the same
 *  interaction and a distinct resting style. `ariaLabel` (see `slotAriaLabel`)
 *  names the trigger, and the menu takes its name from the trigger. Passing
 *  `open` makes the menu controlled, so something outside the trigger (a
 *  departure's action) can open it; `onOpenChange` then reports every
 *  request to open or close. `about` (a TokenAbout) heads the panel, above
 *  the options. A token with nothing to pick passes it with no children. */
export const SlotMenu = ({
    label,
    title,
    marked,
    ariaLabel,
    open,
    onOpenChange,
    about,
    children,
}: {
    label: string;
    title: string;
    marked?: boolean;
    ariaLabel: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    about?: React.ReactNode;
    children?: React.ReactNode;
}) => {
    return (
        <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}>
            <DropdownMenu.Trigger asChild>
                {/* A span, not a button: buttons are atomic inline-blocks (with a
                    UA text-align:center) and long phrases stop wrapping mid-text. */}
                <span
                    role="button"
                    tabIndex={0}
                    aria-label={ariaLabel}
                    className={classNames(styles.slot, marked && styles.slotMarked)}
                >
                    {label}
                </span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    ref={menuEntryFocusRef}
                    className={styles.slotMenu}
                    align="start"
                    sideOffset={2}
                    collisionPadding={16}
                    loop
                    onKeyDownCapture={onMenuContentKeyDownCapture({ loop: true })}
                >
                    <p className={styles.slotMenuTitle}>{title}</p>
                    <div className={styles.slotMenuBody}>
                        {about}
                        {children}
                    </div>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};

/** A marked, non-interactive phrase for a candidates, no_data or unsupported
 *  part's own what-token, with its reason on hover. A candidates part's
 *  choice sits in its reading cards. */
export const UnresolvedToken = ({ label, reason }: { label: string; reason?: string | null }) => (
    <span className={styles.slotMarked} title={reason ?? undefined}>
        {label}
    </span>
);

/** What a row hands its trailing info note (GraphInfo's InfoIcon): whether
 *  Radix highlights the row, which it does on keyboard focus and pointer
 *  hover alike, with its submenu (if any) closed, and the id the row's aria-describedby names. The note calls
 *  `onDescribed` once it holds text, so the row only points at a note that
 *  exists. */
export const OptionRowInfo = createContext<{
    highlighted: boolean;
    descriptionId: string;
    onDescribed: (described: boolean) => void;
} | null>(null);

/**
 * Custom popup row: options carry a check gutter, submenu triggers a small
 * right arrow. Radix drives it via asChild. In React 19 the incoming ref
 * rides the props spread, as does Radix's `data-highlighted`.
 */
export const OptionRow = ({
    checked,
    arrow,
    direction,
    muted,
    pinned,
    toggle,
    current,
    meta,
    detail,
    info,
    children,
    role,
    ...rest
}: {
    checked?: boolean;
    arrow?: boolean;
    // A level-scoped menu's way up/down (SlotOption.relation): overrides the
    // check gutter with a plain direction glyph instead of a checkmark,
    // since this row moves the bound value rather than toggling it.
    direction?: 'up' | 'down';
    // A confirmed-no-data option (optionCoverage's 'probed-zero'): stays in
    // the list, ranked last, read as dimmer than a resting row rather than
    // removed — still selectable, e.g. when it is the current pick.
    muted?: boolean;
    pinned?: boolean;
    // A real multi-select toggle row (its list posts the whole checked set
    // through a sticky Apply): exposes `checked` to assistive tech as
    // role="menuitemcheckbox"/aria-checked, or `role` outside a menu (the
    // download dialog's "checkbox"). Omitted, a `checked` row is an
    // immediate single pick — the current value whether or not it's also
    // `pinned` — which carries aria-current instead. The two never overlap
    // in this file's menus.
    toggle?: boolean;
    // Overrides aria-current for a non-toggle row; defaults to `checked`.
    // A caller whose `checked` set can hold more than one row in the same
    // menu (e.g. a hoisted shared entity bound to several places) passes
    // this explicitly so only one row reads as current.
    current?: boolean;
    // Quiet trailing note: a slot option's download rows ("425 rows"), or
    // an entity option's data footprint ("40 obs").
    meta?: string | null;
    // A second line under the label that wraps within the row (a source's
    // publisher and origin), where a trailing meta would crowd the label out.
    detail?: string | null;
    // Trailing info affordance (a source's description), after the meta. It
    // reads OptionRowInfo, and its text becomes the row's description.
    info?: React.ReactNode;
    // Set by a Radix item while the row is highlighted, and by a submenu
    // trigger to "open" while its submenu is.
    'data-highlighted'?: string;
    'data-state'?: string;
    children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
    const descriptionId = useId();
    const [described, setDescribed] = useState(false);
    // A submenu row opens its submenu on hover, right where the note would
    // sit, so its note waits for the icon's own hover once that is open.
    const highlighted = rest['data-highlighted'] !== undefined && rest['data-state'] !== 'open';

    return (
        <button
            type="button"
            role={toggle ? (role ?? 'menuitemcheckbox') : role}
            aria-checked={toggle ? !!checked : undefined}
            aria-current={!toggle && (current ?? checked) ? 'true' : undefined}
            aria-describedby={described ? descriptionId : undefined}
            className={classNames(
                styles.slotOption,
                arrow && styles.slotOptionSub,
                checked && styles.slotOptionChecked,
                muted && styles.slotOptionMuted,
                pinned && styles.slotOptionPinned,
            )}
            {...rest}
        >
            {/* Gutter only where a current pick or a direction exists. Add
                Criteria rows are unbound by definition, so they skip it
                entirely. */}
            {!arrow && (checked !== undefined || direction) && (
                <span className={styles.optionCheck} aria-hidden="true">
                    {direction === 'up' && '↑'}
                    {direction === 'down' && '↓'}
                    {!direction && checked && <Icon name="check" />}
                </span>
            )}
            {detail ? (
                <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{children}</span>
                    <span className={styles.optionDetail}>{detail}</span>
                </span>
            ) : (
                <span className={styles.optionLabel}>{children}</span>
            )}
            {meta && <span className={styles.optionMeta}>{meta}</span>}
            {info && (
                <OptionRowInfo value={{ highlighted, descriptionId, onDescribed: setDescribed }}>
                    {info}
                </OptionRowInfo>
            )}
            {arrow && <Icon name="arrow-small" className={styles.rowArrow} />}
        </button>
    );
};

/** A level-scoped menu's non-interactive leaf note ("most specific level"):
 *  the same row rhythm as an option, but plain text, shown at the
 *  narrowest level of the taxonomy. */
export const LevelHint = ({ children }: { children: React.ReactNode }) => (
    <p className={styles.levelHint}>{children}</p>
);

/** Records a submenu's trigger edges on the panel as `--sub-trigger-left`
 *  and `--sub-trigger-right`. Radix always opens a submenu beside its
 *  trigger, so on a phone, where neither side has room, the stylesheet
 *  reads these to move the panel to full width under the trigger
 *  (`.subMenu` in DataSearch.module.scss). */
const subMenuRef = (node: HTMLElement | null): (() => void) | undefined => {
    const trigger = node?.ownerDocument.getElementById(node.getAttribute('aria-labelledby') ?? '');

    if (node && trigger) {
        const { left, right } = trigger.getBoundingClientRect();

        node.style.setProperty('--sub-trigger-left', `${left}px`);
        node.style.setProperty('--sub-trigger-right', `${right}px`);
    }

    return menuEntryFocusRef(node);
};

/** A menu row that opens a submenu of `children`. Uncontrolled unless
 *  `open` is passed, as Refine does to open at the submenu a departure
 *  names. */
export const OptionSubmenu = ({
    label,
    detail,
    meta,
    info,
    open,
    onOpenChange,
    children,
}: {
    label: React.ReactNode;
    detail?: string | null;
    meta?: string | null;
    info?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}) => (
    <DropdownMenu.Sub open={open} onOpenChange={onOpenChange}>
        <DropdownMenu.SubTrigger asChild>
            <OptionRow arrow detail={detail} meta={meta} info={info}>
                {label}
            </OptionRow>
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
            <DropdownMenu.SubContent
                ref={subMenuRef}
                className={classNames(styles.slotMenu, styles.fitMenu, styles.subMenu)}
                sideOffset={0}
                collisionPadding={16}
                onKeyDownCapture={onMenuContentKeyDownCapture()}
            >
                <div className={styles.slotMenuBody}>{children}</div>
            </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
    </DropdownMenu.Sub>
);

/** Shared by every filterable list, gated behind pickerState.ts's length
 *  threshold. data-menu-field="filter" marks it as the keyboard mechanism's
 *  stop and focus target, a plain attribute since SearchCards renders this
 *  outside any Radix menu, where the ref-based hooks above don't apply. */
export const OptionFilterInput = ({
    value,
    onChange,
    label,
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
}) => (
    <input
        className={styles.slotInput}
        data-menu-field="filter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={stopMenuFieldTypeahead}
        placeholder={`${label}…`}
        aria-label={label}
        autoComplete="off"
    />
);

/** The empty-filter-result note shared by the same filterable lists. */
export const NoFilterMatch = () => <p className={styles.slotNote}>No match — clear the filter.</p>;

/** Backs every multi-select popover (PlaceEditor, PlaceScopeEditor,
 *  EntityOptionRows): a working selection seeded from the bound dcids,
 *  reset, not merged, whenever that bound set changes underneath the
 *  still-open popover, e.g. a streamed event landing while the user is
 *  toggling rows. `applyDisabled` is true once `selected` reads back the
 *  same as the bound set; a caller with its own extra Apply-disabling rule
 *  (PlaceEditor's requireSelection) ORs it in locally. `clear` empties the
 *  working selection, which an "Any provider"/"Any recipient" row stages. */
export const useToggleSelection = (
    boundDcids: string[],
): {
    selected: Set<string>;
    toggle: (dcid: string) => void;
    clear: () => void;
    applyDisabled: boolean;
} => {
    const [selected, setSelected] = useState<Set<string>>(() => new Set(boundDcids));
    const boundDcidsKey = boundDcids.join(',');
    const [prevBoundDcidsKey, setPrevBoundDcidsKey] = useState(boundDcidsKey);

    if (boundDcidsKey !== prevBoundDcidsKey) {
        setPrevBoundDcidsKey(boundDcidsKey);
        setSelected(new Set(boundDcids));
    }

    const toggle = (dcid: string) => setSelected((prev) => toggleDcid(prev, dcid));
    const clear = () => setSelected(new Set());
    const applyDisabled = dcidSetsEqual(selected, new Set(boundDcids));

    return { selected, toggle, clear, applyDisabled };
};

/** A multi-select role picker's "Any provider"/"Any recipient" row. It reads
 *  the staged selection, so it unticks as soon as a specific pick is staged
 *  and re-ticks once every pick is cleared. Clicking it clears the staged
 *  picks; Apply then posts the empty set, which drops the role. */
export const AnySelectionRow = ({
    label,
    selected,
    onClear,
}: {
    label: string;
    selected: ReadonlySet<string>;
    onClear: () => void;
}) => (
    <DropdownMenu.Item
        asChild
        onSelect={(event) => {
            event.preventDefault();
            onClear();
        }}
    >
        <OptionRow checked={selected.size === 0} toggle>
            {label}
        </OptionRow>
    </DropdownMenu.Item>
);

/** The sticky "commit the whole toggled set" button shared by every
 *  multi-select popover. Pinned to the bottom of .slotMenuBody's own scroll
 *  area (styles.multiSelectApply) so a long list never scrolls it out of
 *  reach. `onApply` is a callback rather than a typed payload since sites
 *  differ in what they post (place/entity refs with labels vs. bare
 *  dcids). Each call site builds its own payload from `selected` and
 *  calls this with no arguments. */
export const MultiSelectApplyButton = ({
    selected,
    disabled,
    onApply,
}: {
    selected: Set<string>;
    disabled: boolean;
    onApply: () => void;
}) => (
    <Button
        variant="dark"
        full
        type="button"
        data-menu-field="field"
        className={styles.multiSelectApply}
        disabled={disabled}
        onClick={onApply}
    >
        {multiSelectApplyLabel(selected.size, disabled)}
    </Button>
);
