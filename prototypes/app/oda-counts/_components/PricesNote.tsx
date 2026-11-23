'use client';

import { useLiveUnits } from './LiveUnits';

import { BUILT_CURRENCY, currencyNoun } from '../_lib/live.ts';

/** The Notes line on prices, naming the exchange rates when the figures are in another currency. */
export const PricesNote = () => {
    const { offer, shown } = useLiveUnits();
    const { currency } = shown.unit;

    return currency === BUILT_CURRENCY ? (
        <>Constant prices use the OECD DAC deflators, from ONE&apos;s conversion tables.</>
    ) : (
        <>
            Figures in {currencyNoun(offer, currency)} use ONE&apos;s exchange rates, and constant
            prices the OECD DAC deflators, both from ONE&apos;s conversion tables.
        </>
    );
};
