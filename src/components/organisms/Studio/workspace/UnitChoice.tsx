import classNames from 'classnames';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import chatStyles from './ChatPanel.module.scss';
import ledgerStyles from './PlanLedger.module.scss';
import styles from './UnitChoice.module.scss';

import {
    baseYears,
    currencyRows,
    matchesQuery,
    priceRows,
    servesUnit,
    unitChanged,
    unitChips,
    withBaseYear,
    withCurrency,
    withPrices,
    type UnitChipKey,
    type UnitRow,
} from '@/lib/studio/unitChoice';
import type { UnitChoice as Unit, UnitOffer } from '@/lib/studio/wire';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';

type UnitChoiceProps = {
    offer: UnitOffer;
    onSend: (unit: Unit) => void;
    // Skip renders only when given.
    onSkip?: () => void;
    // Send stays dimmed until a chip moves off `offer.start`.
    sendDisabledUntilChanged?: boolean;
    // Send and the lists' rows ignore clicks while what Send sends elsewhere
    // waits, and keep focus (`aria-disabled`).
    busy?: boolean;
    // What the sent unit says while it applies (the plan card's switch),
    // beside Send.
    pendingText?: string | null;
};

// Where focus goes after the next render: a chip, once its list closes, or
// the filter field, once the full currency list opens.
type FocusTarget = UnitChipKey | 'filter';

// The list a chip opens: radio rows with the picked one marked, and, when the
// list is long, a field above them that narrows the rows as the user types.
const UnitList = <TValue extends string | number>({
    id,
    label,
    rows,
    picked,
    onPick,
    busy,
    field,
    children,
}: {
    id: string;
    label: string;
    rows: UnitRow<TValue>[];
    picked: TValue;
    onPick: (value: TValue) => void;
    busy?: boolean;
    field?: {
        placeholder: string;
        none: string;
        query: string;
        onQuery: (query: string) => void;
        matches: (row: UnitRow<TValue>, query: string) => boolean;
    };
    children?: ReactNode;
}) => {
    const shown = field ? rows.filter((row) => field.matches(row, field.query)) : rows;
    const options = shown.map((row) => {
        const on = row.value === picked;

        return (
            <button
                key={row.value}
                type="button"
                aria-pressed={on}
                aria-disabled={(busy && !on) || undefined}
                className={classNames(ledgerStyles.option, styles.row, on && ledgerStyles.optionOn)}
                onClick={() => !busy && onPick(row.value)}
            >
                <span className={ledgerStyles.radio} />
                <span className={ledgerStyles.optionLabel}>{row.label}</span>
            </button>
        );
    });

    return (
        <div id={id} className={ledgerStyles.options} role="group" aria-label={label}>
            {field ? (
                <>
                    <input
                        className={styles.filter}
                        data-unit-focus="filter"
                        value={field.query}
                        onChange={(event) => field.onQuery(event.target.value)}
                        placeholder={field.placeholder}
                        aria-label={field.placeholder}
                        autoComplete="off"
                    />
                    <div className={styles.scroll}>{options}</div>
                    {shown.length === 0 && (
                        <p className={styles.none} role="status">
                            {field.none}
                        </p>
                    )}
                </>
            ) : (
                options
            )}
            {children}
        </div>
    );
};

// The unit choice a unit question, a card's Change unit and a plan card's
// unit row show: three chips (currency, prices, and the base year on
// constant prices), each opening its list below them, then Send and an
// optional Skip. The pure rules live in lib/studio/unitChoice.ts.
const UnitChoice = ({
    offer,
    onSend,
    onSkip,
    sendDisabledUntilChanged,
    busy,
    pendingText,
}: UnitChoiceProps) => {
    const [unit, setUnit] = useState<Unit>(offer.start);
    const [open, setOpen] = useState<UnitChipKey | null>(null);
    const [all, setAll] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const focusRef = useRef<FocusTarget | null>(null);

    // A pick unmounts the list that held focus. Move it to the chip, or to
    // the filter field the full currency list brings.
    useEffect(() => {
        const target = focusRef.current;

        if (!target) {
            return;
        }

        focusRef.current = null;
        rootRef.current
            ?.querySelector<HTMLElement>(`[data-unit-focus="${target}"]`)
            ?.focus({ preventScroll: true });
    });

    const chips = unitChips(offer, unit);
    // The base-year list closes when the prices move off constant.
    const shownList = open === 'year' && unit.prices !== 'constant' ? null : open;
    // Send is natively disabled only when it has nothing to send; while busy
    // it stays focusable and ignores clicks.
    const sendable =
        servesUnit(offer, unit) && (!sendDisabledUntilChanged || unitChanged(offer.start, unit));
    const listId = useId();

    const toggle = (key: UnitChipKey) => {
        setOpen(shownList === key ? null : key);
        setAll(false);
        setQuery('');
    };

    const pick = (key: UnitChipKey, next: Unit) => {
        setUnit(next);
        setOpen(null);
        setAll(false);
        setQuery('');
        focusRef.current = key;
    };

    const list = () => {
        switch (shownList) {
            case 'currency':
                return (
                    <UnitList
                        id={listId}
                        busy={busy}
                        label="Currency"
                        rows={currencyRows(offer, unit, all)}
                        picked={unit.currency}
                        onPick={(code) => pick('currency', withCurrency(offer, unit, code))}
                        field={
                            all
                                ? {
                                      placeholder: 'Type a currency',
                                      none: 'No currency matches.',
                                      query,
                                      onQuery: setQuery,
                                      matches: (row, typed) =>
                                          matchesQuery(typed, row.label, row.value),
                                  }
                                : undefined
                        }
                    >
                        {!all && (
                            <button
                                type="button"
                                className={styles.all}
                                onClick={() => {
                                    setAll(true);
                                    focusRef.current = 'filter';
                                }}
                            >
                                Change to any currency
                            </button>
                        )}
                    </UnitList>
                );
            case 'prices':
                return (
                    <UnitList
                        id={listId}
                        busy={busy}
                        label="Prices"
                        rows={priceRows(offer, unit)}
                        picked={unit.prices}
                        onPick={(prices) => pick('prices', withPrices(offer, unit, prices))}
                    />
                );
            case 'year': {
                const years = baseYears(offer, unit);

                return (
                    <UnitList
                        id={listId}
                        busy={busy}
                        label="Base year"
                        rows={years.map((year) => ({ value: year, label: String(year) }))}
                        picked={unit.base_year ?? 0}
                        onPick={(year) => pick('year', withBaseYear(unit, year))}
                        field={{
                            placeholder: 'Type a year',
                            none: `No year matches. ${years.at(-1)} to ${years[0]}.`,
                            query,
                            onQuery: setQuery,
                            matches: (row, typed) => matchesQuery(typed, row.label),
                        }}
                    />
                );
            }
            default:
                return null;
        }
    };

    return (
        <div ref={rootRef} className={styles.choice}>
            <div className={styles.more}>
                <div className={styles.chips}>
                    {chips.map((chip) => (
                        <button
                            key={chip.key}
                            type="button"
                            data-unit-focus={chip.key}
                            className={classNames(chatStyles.followupChip, styles.chip)}
                            aria-expanded={shownList === chip.key}
                            aria-controls={shownList === chip.key ? listId : undefined}
                            aria-label={`${chip.name}, ${chip.label}`}
                            onClick={() => toggle(chip.key)}
                        >
                            {chip.label}
                            <Icon name="chevron-down" className={styles.chevron} />
                        </button>
                    ))}
                </div>
                {list()}
            </div>
            <div className={styles.foot}>
                {pendingText && (
                    <span className={ledgerStyles.optionTag}>
                        <span className={ledgerStyles.spin} />
                        {pendingText}
                    </span>
                )}
                {onSkip && (
                    <Button variant="bordered" onClick={onSkip}>
                        Skip
                    </Button>
                )}
                <Button
                    variant="dark"
                    disabled={!sendable}
                    aria-disabled={busy || undefined}
                    aria-busy={busy || undefined}
                    onClick={() => !busy && onSend(unit)}
                >
                    Send
                </Button>
            </div>
        </div>
    );
};

export default UnitChoice;
