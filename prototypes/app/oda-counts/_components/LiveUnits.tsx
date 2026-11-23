'use client';

import { RateLimitError } from '@developmentfinance/client/errors';
import type { StoredVersionsJson } from '@developmentfinance/client/types';
import {
    createContext,
    use,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';

import { liveClient, pacer, pickLane } from '#lib/pacing.ts';
import { StoredCheckContext, useStoredCheck } from '#lib/useStoredCheck.ts';

import type { CountsData, Donor, LiveData, Offer, Prices, SeriesKey } from '../_data/types.ts';
import type { BuiltCounts } from '../_lib/derive.ts';
import { DEFAULT_DONOR, findDonor } from '../_lib/counts.ts';
import { loadRefresh } from '../_lib/refresh.ts';
import {
    basisKey,
    builtUnit,
    fetchBasis as fetchLiveBasis,
    isBuilt,
    liveDonor,
    resolveRequests,
    resumePick,
    withPrices,
    type LiveBasis,
    type Resolver,
    type Shown,
    type Unit,
} from '../_lib/live.ts';

/** How long one resolve request may take, from when it leaves the pick lane's queue, before the
 *  page gives up on it. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Entries per request for the basis a reader waits for. Nine one-entry requests sent
 * together answer in about 2.3 s cold, against 3.3 s for one six-entry and one three-entry
 * request. They run in the page's pick lane (lib/pacing.ts), apart from the stored reads, so
 * all nine go out together. The other basis loads afterwards at the most entries a request
 * takes, so a pick costs 11 requests. The website's gateway allows each address 120 requests a
 * minute on its `api` allowance, which Search resolve requests count against; the page's stored
 * reads count against the separate `datasets` allowance. That leaves room for 10 picks a minute.
 * Once the pacer reports fewer `api` requests left than a one-entry pick costs, picks take the
 * most entries a request holds (two requests for each basis).
 */
const PICKED_PER_REQUEST = 1;

let resolver: Resolver | undefined;

/** The page's client with no retries, so a refused or failed resolve request fails its pick at
 *  once and spends one request of the allowance. */
const resolverClient = (): Resolver => (resolver ??= liveClient().withOptions({ maxRetries: 0 }));

/** Why the last pick could not be fetched: the gateway's allowance was spent, or anything else. */
export type Failure = 'rate_limited' | 'error';

type LiveUnits = {
    /** the figures in US dollars, as the build read them or the page read them again */
    data: CountsData;
    /** the citation of the reads the figures come from */
    citation: string;
    offer: Offer;
    /** the donor and unit the controls show, which lead `shown` while a fetch runs */
    picked: Shown;
    /** the donor and unit whose figures are on screen */
    shown: Shown;
    /** the shown donor, its series in the shown unit */
    donor: Donor;
    /** the price basis the axes hold to, or null when they span both (see `donorTicks`) */
    lead: Prices | null;
    /** true while the picked figures are being fetched */
    pending: boolean;
    /** why the last pick could not be fetched, or null when it was */
    failed: Failure | null;
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

/** A donor's built series at one price basis. */
const builtBasis = (donor: Donor, prices: Prices): LiveBasis =>
    Object.fromEntries(
        Object.entries(donor.series).map(([key, byPrices]) => [key, byPrices[prices]]),
    ) as Record<SeriesKey, (number | null)[]>;

/** The key a donor's pair of price bases in one currency and base year shares. */
const pairKey = ({ donorId, unit }: Shown): string =>
    `${donorId} ${unit.currency} ${unit.baseYear}`;

/** Whether a rejection is an aborted request's: the client rejects with the signal's reason,
 *  an `AbortError` when the provider aborts it. */
const isAbort = (error: unknown): boolean =>
    error instanceof DOMException && error.name === 'AbortError';

/**
 * Holds the donor and the unit the page shows, and fetches a donor's figures from Search
 * in any unit the built figures do not hold. A pick shows at once when its figures are at
 * hand. Otherwise the previous figures stay on screen while the picked price basis loads
 * in one-entry requests through the page's pick lane (see PICKED_PER_REQUEST), after which the
 * other basis of the same currency loads in the background, so switching prices never
 * waits. A pick drawn before its other basis is in becomes the pair's `lead`: the axes
 * hold to it, and move once when the other basis lands only if a figure would fall off
 * them. Figures are cached per donor and unit for the session. A newer pick aborts every
 * request it does not need. A failed pick returns to the figures on screen, or to the new
 * donor in US dollars, and sets `failed`, which says whether the gateway refused it for
 * the address's `api` allowance (see PICKED_PER_REQUEST). A request the provider aborted
 * itself sets nothing.
 *
 * The figures in US dollars are the build's `counts`, read at `retrieved`, until a check after
 * paint finds DFO has stored newer data than `stored`, the build's check, and the read again
 * succeeds (lib/storedCheck.ts). When the counts change, before the browser paints them, the
 * provider drops every conversion and lead fetched for the old counts and aborts the requests
 * in flight, then resumes the reader's pick on the new counts (`resumePick`). Everything else on
 * the page, such as the year shown, stays.
 */
export const LiveUnitsProvider = ({
    counts,
    retrieved,
    stored,
    live,
    children,
}: {
    counts: BuiltCounts;
    retrieved: string;
    stored: StoredVersionsJson;
    live: LiveData;
    children: ReactNode;
}) => {
    const { value, ...checked } = useStoredCheck(counts, retrieved, stored, loadRefresh);
    const { data, citation } = value;
    const start: Shown = { donorId: DEFAULT_DONOR, unit: builtUnit(data) };
    const [picked, setPicked] = useState<Shown>(start);
    const [shown, setShown] = useState<Shown>(start);
    const [cache, setCache] = useState<ReadonlyMap<string, LiveBasis>>(new Map());
    // The lead basis of each pair drawn before its other basis was in, by `pairKey`.
    const [leads, setLeads] = useState<ReadonlyMap<string, Prices>>(new Map());
    const [failed, setFailed] = useState<Failure | null>(null);
    // Requests in flight, by the cache key they fill.
    const inflight = useRef(
        new Map<string, { promise: Promise<LiveBasis>; controller: AbortController }>(),
    );
    // Mirrors `cache` for the async code, which must not read a stale render's copy.
    const cached = useRef(new Map<string, LiveBasis>());
    const latest = useRef(start);
    // The figures on screen, for the async code.
    const onScreen = useRef(start);
    // The counts the cache and the requests belong to, and how many times they changed, so an
    // answer to a request made on older counts is dropped.
    const counted = useRef(data);
    const generation = useRef(0);

    const donorOf = (donorId: string): Donor => {
        const donor = findDonor(data, donorId) ?? data.donors[0];

        if (donor === undefined) {
            throw new Error('The built figures hold no donors');
        }

        return donor;
    };

    const available = (donorId: string, unit: Unit): boolean =>
        isBuilt(unit, data) || cached.current.has(basisKey(donorId, unit));

    const fetchBasis = (
        donorId: string,
        unit: Unit,
        perRequest: number,
    ): { promise: Promise<LiveBasis>; signal: AbortSignal } => {
        const key = basisKey(donorId, unit);
        const running = inflight.current.get(key);

        if (running !== undefined) {
            return { promise: running.promise, signal: running.controller.signal };
        }

        // A newer pick that does not need this basis aborts it, as a change of counts does.
        const controller = new AbortController();
        const made = generation.current;
        const promise: Promise<LiveBasis> = fetchLiveBasis({
            client: resolverClient(),
            lane: pickLane,
            live,
            donorId,
            unit,
            perRequest,
            years: data.years,
            timeoutMs: REQUEST_TIMEOUT_MS,
            signal: controller.signal,
        })
            .then((basis) => {
                if (generation.current === made) {
                    cached.current.set(key, basis);
                    setCache(new Map(cached.current));
                }

                return basis;
            })
            .finally(() => {
                // An aborted request settles after a newer one for the same key may have
                // taken its place, so it removes only its own entry.
                if (inflight.current.get(key)?.promise === promise) {
                    inflight.current.delete(key);
                }
            });

        inflight.current.set(key, { promise, controller });

        return { promise, signal: controller.signal };
    };

    /** Entries per request for `target`'s basis: one, unless the allowance the gateway last
     *  reported for `api` cannot pay for a one-entry pick and its sibling. */
    const pickedPerRequest = (target: Shown): number => {
        const left = pacer.allowance('api');
        const cost =
            resolveRequests(live, target.donorId, target.unit, PICKED_PER_REQUEST).length +
            resolveRequests(live, target.donorId, target.unit).length;

        return left !== null && left.remaining < cost ? live.maxEntries : PICKED_PER_REQUEST;
    };

    /** The other price basis of `target`'s currency. */
    const siblingOf = (target: Shown): Unit =>
        withPrices(target.unit, target.unit.prices === 'current' ? 'constant' : 'current');

    /** Loads the other price basis of the shown unit's currency, quietly. */
    const prefetchSibling = (target: Shown) => {
        const sibling = siblingOf(target);

        if (!available(target.donorId, sibling)) {
            fetchBasis(target.donorId, sibling, live.maxEntries).promise.catch(() => {
                // A sibling that fails loads again when the reader picks it.
            });
        }
    };

    const show = (target: Shown) => {
        const pair = pairKey(target);

        if (!available(target.donorId, siblingOf(target))) {
            setLeads((current) =>
                current.has(pair) ? current : new Map(current).set(pair, target.unit.prices),
            );
        }

        onScreen.current = target;
        setShown(target);
    };

    /** Shows `target`, at once when its figures are at hand, else once they are fetched. */
    const request = (target: Shown) => {
        if (available(target.donorId, target.unit)) {
            show(target);
            prefetchSibling(target);

            return;
        }

        const made = generation.current;
        const { promise, signal } = fetchBasis(
            target.donorId,
            target.unit,
            pickedPerRequest(target),
        );
        const current = () => generation.current === made && sameShown(latest.current, target);

        promise.then(
            () => {
                if (current()) {
                    show(target);
                    prefetchSibling(target);
                }
            },
            (error: unknown) => {
                // The provider aborted the request itself: a newer pick, new counts, or its
                // own unmount, as Strict Mode runs one.
                if (signal.aborted || isAbort(error) || !current()) {
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
                                  ...builtUnit(data),
                                  prices: target.unit.prices,
                              },
                          };

                latest.current = fallback;
                setPicked(fallback);
                show(fallback);
                setFailed(error instanceof RateLimitError ? 'rate_limited' : 'error');
            },
        );
    };

    const choose = (target: Shown) => {
        latest.current = target;
        setPicked(target);
        setFailed(null);

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

        request(target);
    };

    /** Aborts every request in flight and forgets it. */
    const abortAll = (running: Map<string, { controller: AbortController }>) => {
        for (const { controller } of running.values()) {
            controller.abort();
        }

        running.clear();
    };

    // New counts: drop what was fetched for the old ones and resume the reader's pick on them.
    const startOver = useEffectEvent(() => {
        if (counted.current === data) {
            return;
        }

        counted.current = data;
        generation.current += 1;
        abortAll(inflight.current);
        cached.current = new Map();
        setCache(new Map());
        setLeads(new Map());
        setFailed(null);

        const next = resumePick(latest.current, start, data);

        latest.current = next.picked;
        setPicked(next.picked);
        onScreen.current = next.shown;
        setShown(next.shown);

        if (!sameShown(next.picked, next.shown)) {
            request(next.picked);
        }
    });

    // Before paint, so no conversion of the old counts is drawn beside the new ones.
    useLayoutEffect(() => {
        startOver();
    }, [data]);

    useEffect(() => {
        const running = inflight.current;

        return () => abortAll(running);
    }, []);

    const donor = donorOf(shown.donorId);
    const basisOf = (prices: Prices): LiveBasis | undefined => {
        const unit = withPrices(shown.unit, prices);

        return isBuilt(unit, data)
            ? builtBasis(donor, prices)
            : cache.get(basisKey(shown.donorId, unit));
    };
    const view = isBuilt(withPrices(shown.unit, 'constant'), data)
        ? donor
        : liveDonor(donor, { current: basisOf('current'), constant: basisOf('constant') });

    return (
        <StoredCheckContext value={checked}>
            <Context
                value={{
                    data,
                    citation,
                    offer: live.offer,
                    picked,
                    shown,
                    donor: view,
                    lead: leads.get(pairKey(shown)) ?? null,
                    pending: !sameShown(picked, shown),
                    failed,
                    pickDonor: (donorId) => choose({ donorId, unit: picked.unit }),
                    pickUnit: (unit) => choose({ donorId: picked.donorId, unit }),
                }}
            >
                {children}
            </Context>
        </StoredCheckContext>
    );
};
