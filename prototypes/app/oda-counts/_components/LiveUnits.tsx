'use client';

import { createContext, use, useRef, useState, type ReactNode } from 'react';

import type { CountsData, Donor, LiveData, Offer, Prices, SeriesKey } from '../_data/types.ts';
import { DEFAULT_DONOR, findDonor } from '../_lib/counts.ts';
import {
    basisKey,
    committedUnit,
    isCommitted,
    liveDonor,
    resolveRequests,
    seriesFromEvents,
    streamEvents,
    withPrices,
    type LiveBasis,
    type Unit,
} from '../_lib/live.ts';

/** How long one resolve request may take before the page gives up on it. */
const REQUEST_TIMEOUT_MS = 30_000;

/** What the page shows: one donor in one unit. */
type Shown = { donorId: string; unit: Unit };

type LiveUnits = {
    offer: Offer;
    /** the donor and unit the controls show, which lead `shown` while a fetch runs */
    picked: Shown;
    /** the donor and unit whose figures are on screen */
    shown: Shown;
    /** the shown donor, its series in the shown unit */
    donor: Donor;
    /** true while the picked figures are being fetched */
    pending: boolean;
    /** true when the last pick could not be fetched */
    failed: boolean;
    pickDonor: (donorId: string) => void;
    pickUnit: (unit: Unit) => void;
};

const Context = createContext<LiveUnits | null>(null);

/** The donor and unit the page shows, for every component under `LiveUnitsProvider`. */
export const useLiveUnits = (): LiveUnits => {
    const value = use(Context);

    if (value === null) {
        throw new Error('useLiveUnits needs a LiveUnitsProvider above it');
    }

    return value;
};

const sameShown = (a: Shown, b: Shown): boolean =>
    a.donorId === b.donorId &&
    a.unit.currency === b.unit.currency &&
    a.unit.prices === b.unit.prices &&
    a.unit.baseYear === b.unit.baseYear;

/** A donor's committed series at one price basis. */
const committedBasis = (donor: Donor, prices: Prices): LiveBasis =>
    Object.fromEntries(
        Object.entries(donor.series).map(([key, byPrices]) => [key, byPrices[prices]]),
    ) as Record<SeriesKey, (number | null)[]>;

/**
 * Holds the donor and the unit the page shows, and fetches a donor's figures from Search
 * in any unit counts.json does not hold. A pick shows at once when its figures are at
 * hand. Otherwise the previous figures stay on screen while the picked price basis loads
 * in as few requests as Search takes, after which the other basis of the same currency
 * loads in the background, so switching prices never waits or rescales. Figures are
 * cached per donor and unit for the session. A newer pick aborts every request it does
 * not need. A failed pick returns to the figures on screen, or to the new donor in US
 * dollars, and sets `failed`.
 */
export const LiveUnitsProvider = ({
    data,
    live,
    children,
}: {
    data: CountsData;
    live: LiveData;
    children: ReactNode;
}) => {
    const start: Shown = { donorId: DEFAULT_DONOR, unit: committedUnit(data) };
    const [picked, setPicked] = useState<Shown>(start);
    const [shown, setShown] = useState<Shown>(start);
    const [cache, setCache] = useState<ReadonlyMap<string, LiveBasis>>(new Map());
    const [failed, setFailed] = useState(false);
    // Requests in flight, by the cache key they fill.
    const inflight = useRef(
        new Map<string, { promise: Promise<LiveBasis>; controller: AbortController }>(),
    );
    // Mirrors `cache` for the async code, which must not read a stale render's copy.
    const cached = useRef(new Map<string, LiveBasis>());
    const latest = useRef(start);
    // The figures on screen, for the async code.
    const onScreen = useRef(start);

    const donorOf = (donorId: string): Donor => {
        const donor = findDonor(data, donorId) ?? data.donors[0];

        if (donor === undefined) {
            throw new Error('counts.json holds no donors');
        }

        return donor;
    };

    const available = (donorId: string, unit: Unit): boolean =>
        isCommitted(unit, data) || cached.current.has(basisKey(donorId, unit));

    const fetchBasis = (donorId: string, unit: Unit): Promise<LiveBasis> => {
        const key = basisKey(donorId, unit);
        const running = inflight.current.get(key);

        if (running !== undefined) {
            return running.promise;
        }

        const controller = new AbortController();
        const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]);
        const promise = Promise.all(
            resolveRequests(live, donorId, unit).map(async ({ keys, body }) => {
                const response = await fetch(live.resolve, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
                    body: JSON.stringify(body),
                    signal,
                });

                if (
                    !response.ok ||
                    !response.headers.get('content-type')?.includes('event-stream')
                ) {
                    throw new Error(`Search answered ${response.status}`);
                }

                return seriesFromEvents(
                    streamEvents(await response.text()),
                    keys,
                    data.years,
                    unit.currency,
                );
            }),
        )
            .then((parts) => {
                const basis = Object.assign({}, ...parts) as LiveBasis;

                cached.current.set(key, basis);
                setCache(new Map(cached.current));

                return basis;
            })
            .finally(() => inflight.current.delete(key));

        inflight.current.set(key, { promise, controller });

        return promise;
    };

    /** Loads the other price basis of the shown unit's currency, quietly. */
    const prefetchSibling = (target: Shown) => {
        const sibling = withPrices(
            target.unit,
            target.unit.prices === 'current' ? 'constant' : 'current',
        );

        if (!available(target.donorId, sibling)) {
            fetchBasis(target.donorId, sibling).catch(() => {
                // A sibling that fails loads again when the reader picks it.
            });
        }
    };

    const show = (target: Shown) => {
        onScreen.current = target;
        setShown(target);
    };

    const choose = (target: Shown) => {
        latest.current = target;
        setPicked(target);
        setFailed(false);

        // Keep only the requests the target needs: its basis and the other basis of its pair.
        const keep = new Set(
            (['current', 'constant'] as const).map((prices) =>
                basisKey(target.donorId, withPrices(target.unit, prices)),
            ),
        );

        for (const [key, { controller }] of inflight.current) {
            if (!keep.has(key)) {
                controller.abort();
                inflight.current.delete(key);
            }
        }

        if (available(target.donorId, target.unit)) {
            show(target);
            prefetchSibling(target);

            return;
        }

        fetchBasis(target.donorId, target.unit).then(
            () => {
                if (sameShown(latest.current, target)) {
                    show(target);
                    prefetchSibling(target);
                }
            },
            (error: unknown) => {
                if (!sameShown(latest.current, target)) {
                    return;
                }

                console.error('ODA counts: could not convert the figures live', error);

                // Back to the figures on screen, or to the new donor in US dollars.
                const fallback: Shown =
                    onScreen.current.donorId === target.donorId
                        ? onScreen.current
                        : {
                              donorId: target.donorId,
                              unit: {
                                  ...committedUnit(data),
                                  prices: target.unit.prices,
                              },
                          };

                latest.current = fallback;
                setPicked(fallback);
                show(fallback);
                setFailed(true);
            },
        );
    };

    const donor = donorOf(shown.donorId);
    const basisOf = (prices: Prices): LiveBasis | undefined => {
        const unit = withPrices(shown.unit, prices);

        return isCommitted(unit, data)
            ? committedBasis(donor, prices)
            : cache.get(basisKey(shown.donorId, unit));
    };
    const view = isCommitted(withPrices(shown.unit, 'constant'), data)
        ? donor
        : liveDonor(donor, { current: basisOf('current'), constant: basisOf('constant') });

    return (
        <Context
            value={{
                offer: live.offer,
                picked,
                shown,
                donor: view,
                pending: !sameShown(picked, shown),
                failed,
                pickDonor: (donorId) => choose({ donorId, unit: picked.unit }),
                pickUnit: (unit) => choose({ donorId: picked.donorId, unit }),
            }}
        >
            {children}
        </Context>
    );
};
