import { Linked } from './Linked';

import type { Context } from '../_data/types.ts';
import { ARREARS_NOTE, odaNote, SOURCES } from '../_lib/copy.ts';
import { listOf } from '../_lib/format.ts';
import { debtAboveOdaCount, FLOW_YEAR, inIds } from '../_lib/profile.ts';

/** How many contexts paid more in debt service than they received in ODA in 2024. */
export const DebtAboveOda = ({ contexts }: { contexts: Context[] }) => (
    <>{debtAboveOdaCount(contexts, FLOW_YEAR)}</>
);

/** The contexts outside the World Bank's International Debt Statistics, in prose. */
export const WithoutIds = ({ contexts }: { contexts: Context[] }) => (
    <>{listOf(contexts.filter((context) => !inIds(context)).map((context) => context.name))}</>
);

/** That ODA here counts every provider, with the 2024 total from the data. */
export const OdaNote = ({ contexts }: { contexts: Context[] }) => (
    <Linked words={odaNote(contexts)} />
);

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
