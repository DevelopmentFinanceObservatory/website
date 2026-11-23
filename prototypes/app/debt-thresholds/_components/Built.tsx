// The page's server components, which take the build's read of DFO (_lib/build.ts) from
// .build-data/debt-thresholds.json (lib/buildData.ts), put it together with the committed 2024
// view, and hand it to the client components and the page's prose.
import { DebtThresholds } from './DebtThresholds';
import { FdlMatch, GroupCount } from './Counts';

import { debtBuild, pageThresholds, pageTransfers } from '../_lib/build.ts';
import type { Group } from '../_lib/thresholds.ts';

import { readBuilt } from '#lib/buildData.ts';

const read = () => readBuilt(debtBuild);

/** The interactive part of the page, on both views and the net transfers. */
export const BuiltDebtThresholds = async () => {
    const built = await read();

    return <DebtThresholds data={pageThresholds(built)} transfers={pageTransfers(built)} />;
};

/** The number of countries in one group for a base year, under assessed capacity. */
export const BuiltGroupCount = async ({
    year,
    group,
}: {
    year: number;
    group: Exclude<Group, 'nodata'>;
}) => <GroupCount data={pageThresholds(await read())} year={year} group={group} />;

/** "51 of 58": countries where the rebuild of 2024 lands in FDL's published group. */
export const BuiltFdlMatch = async () => <FdlMatch data={pageThresholds(await read())} />;

/** When the build read DFO, in UTC, at the newest versions it stores. */
export const Retrieved = async () => {
    const { thresholds } = await read();
    const [date, time = ''] = thresholds.retrieved.split('T');

    return (
        <>
            {date} at {time.slice(0, 5)} UTC
        </>
    );
};
