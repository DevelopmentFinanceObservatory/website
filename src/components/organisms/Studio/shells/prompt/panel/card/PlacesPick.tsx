import { useEffect, useId, useState } from 'react';

import { useStudioModel } from '../../../../hooks/studioContext';
import { usePromptShell } from '../../shellContext';
import { TextButton } from '../parts/TextButton';
import styles from './CardPage.module.scss';

import { pickablePlaces, placeMatches } from '@/lib/studio/cardChange';
import type { PlaceOptionsRead } from '@/lib/studio/studioClient';
import type { PlaceOption } from '@/lib/studio/wire';

// The places list as the picker holds it while it loads, once it has it, and
// when the read failed.
type List =
    | { state: 'loading' }
    | { state: 'ready'; options: PlaceOption[]; truncated: boolean }
    | { state: 'failed'; detail: string | null; retry: boolean };

const listOf = (read: PlaceOptionsRead): List =>
    read.kind === 'options'
        ? { state: 'ready', options: read.options, truncated: read.truncated }
        : { state: 'failed', detail: read.detail, retry: read.retry };

const FAILED = 'The other places could not be loaded.';

// How long the filter waits after the last keystroke before it announces the
// number of places that match.
const ANNOUNCE_AFTER_MS = 500;

/**
 * The places picker's choices: a filter field over a scrolling list of the
 * places role `role` of the card can show, as checkboxes, or as radios when
 * the role takes one place. The places the card shows come first. The list
 * loads when the picker opens (`chat.placeOptions`, read once per card and
 * role); until it does, the picker lists the places the card shows and a
 * quiet loading row. At least one place stays chosen, and at most `max`:
 * once that many are ticked, the others wait and a line says how many the
 * card can show.
 */
const PlacesPick = ({
    componentId,
    role,
    label,
    multiple,
    max,
    shown,
    picked,
    onChange,
}: {
    componentId: string;
    role: string;
    label: string;
    multiple: boolean;
    /** The most places the card can show for the role. */
    max: number;
    /** The places the card shows now. */
    shown: PlaceOption[];
    /** The places the reader has ticked. */
    picked: PlaceOption[];
    onChange: (places: PlaceOption[]) => void;
}) => {
    const { chat } = useStudioModel();
    const { announce } = usePromptShell();
    const read = chat.placeOptions;
    const [list, setList] = useState<List>({ state: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const [filter, setFilter] = useState('');
    const id = useId();
    const listId = `${id}-list`;

    // The read stops when the picker closes or its card changes; a read
    // stopped that way ends in silence.
    useEffect(() => {
        const stop = new AbortController();

        read(componentId, role, stop.signal).then(
            (answer) => {
                if (stop.signal.aborted) return;

                const next = listOf(answer);

                setList(next);

                if (next.state === 'failed') announce(next.detail ?? FAILED);
            },
            () => {},
        );

        return () => stop.abort();
    }, [read, componentId, role, attempt, announce]);

    // The places the card shows and those the reader has ticked since open
    // lead the list, chosen ones first, whatever the filter; the rest follow
    // in the service's order.
    const [ticked, setTicked] = useState<PlaceOption[]>([]);
    const isPicked = (place: PlaceOption) => picked.some((other) => other.id === place.id);
    const lead = pickablePlaces(shown, ticked);
    const places = pickablePlaces(
        [...lead.filter(isPicked), ...lead.filter((place) => !isPicked(place))],
        list.state === 'ready' ? list.options : [],
    );
    const matching = places.filter((place) => placeMatches(place, filter));
    const count = matching.length;
    const full = multiple && picked.length >= max;

    // The match count, once the reader pauses typing.
    useEffect(() => {
        if (filter.trim() === '' || list.state !== 'ready') return;

        const timer = setTimeout(
            () => announce(count === 1 ? '1 place matches' : `${count} places match`),
            ANNOUNCE_AFTER_MS,
        );

        return () => clearTimeout(timer);
    }, [filter, count, list.state, announce]);

    const toggle = (place: PlaceOption) => {
        if (!multiple) {
            onChange([place]);
            setTicked((before) => pickablePlaces(before, [place]));

            return;
        }

        if (!isPicked(place) && full) return;

        if (!isPicked(place)) setTicked((before) => pickablePlaces(before, [place]));

        onChange(
            isPicked(place) ? picked.filter((other) => other.id !== place.id) : [...picked, place],
        );
    };

    return (
        <fieldset className={styles.placesPick}>
            <legend className={styles.pickLabel}>{label}</legend>
            <input
                type="search"
                className={styles.filter}
                placeholder="Filter places"
                aria-label={`Filter ${label.toLowerCase()}`}
                aria-controls={listId}
                value={filter}
                data-pick-focus
                onChange={(event) => setFilter(event.target.value)}
            />
            <div
                id={listId}
                className={styles.placeList}
                aria-busy={list.state === 'loading' || undefined}
            >
                {matching.map((place) => {
                    const checked = isPicked(place);
                    // The last ticked place stays ticked, and an unticked
                    // one waits while the card shows all it can.
                    const locked = multiple && (checked ? picked.length === 1 : full);

                    return (
                        <label key={place.id} className={styles.option}>
                            <input
                                type={multiple ? 'checkbox' : 'radio'}
                                name={`${id}-place`}
                                value={place.id}
                                checked={checked}
                                disabled={locked}
                                onChange={() => toggle(place)}
                            />
                            {place.label}
                        </label>
                    );
                })}
                {list.state === 'loading' && <p className={styles.listNote}>Loading places</p>}
                {full && (
                    <p className={styles.listNote}>
                        This card shows up to {max === 1 ? '1 place' : `${max} places`}.
                    </p>
                )}
                {list.state === 'ready' && count === 0 && (
                    <p className={styles.listNote}>No place matches.</p>
                )}
            </div>
            {list.state === 'failed' && (
                <p className={styles.listFailed}>
                    {list.detail ?? FAILED}{' '}
                    {list.retry && (
                        <TextButton
                            onClick={() => {
                                setList({ state: 'loading' });
                                setAttempt((value) => value + 1);
                            }}
                        >
                            Try again
                        </TextButton>
                    )}
                </p>
            )}
            {list.state === 'ready' && list.truncated && (
                <p className={styles.listNote}>
                    The list holds the first {list.options.length} places. Ask in the prompt for one
                    it leaves out.
                </p>
            )}
        </fieldset>
    );
};

export default PlacesPick;
