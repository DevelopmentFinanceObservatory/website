'use client';

import { usePageFigures } from './Figures';
import { Linked } from './Linked';

import { ARREARS_NOTE, odaNote, PROSE_FIGURES, SOURCES } from '../_lib/copy.ts';

/** How many contexts paid more in debt service than they received in ODA in 2024. */
export const DebtAboveOda = () => <>{PROSE_FIGURES.debtAboveOda(usePageFigures().contexts)}</>;

/** How many fragile contexts the page covers. */
export const ContextCount = () => <>{PROSE_FIGURES.contextCount(usePageFigures().contexts)}</>;

/** The contexts outside the World Bank's International Debt Statistics, in prose. */
export const WithoutIds = () => <>{PROSE_FIGURES.withoutIds(usePageFigures().contexts)}</>;

/** That ODA here counts every provider, with the 2024 total from the data. */
export const OdaNote = () => <Linked words={odaNote(usePageFigures().contexts)} />;

export const ArrearsNote = () => <>{ARREARS_NOTE}</>;

/** Every source the page names, linked. */
export const SourceList = () => (
    <ul>
        {SOURCES.map((source) => (
            <li key={source.url}>
                <a href={source.url}>{source.name}</a>
            </li>
        ))}
    </ul>
);
