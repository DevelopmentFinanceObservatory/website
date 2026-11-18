import type { ThresholdsData } from '../_data/types.ts';
import { fdlMatch, groupCounts, listOf, type Group } from '../_lib/thresholds.ts';

/**
 * The number of countries in one group for a base year under assessed capacity, as the
 * page's view switch shows it: FDL's published groups for 2024, the DFO's test otherwise.
 * For page copy, so a sentence follows the data.
 */
export const GroupCount = ({
    data,
    year,
    group,
}: {
    data: ThresholdsData;
    year: number;
    group: Exclude<Group, 'nodata'>;
}) => <>{groupCounts(data.countries, year, 'assessed')[group]}</>;

/** "51 of 58": countries where the DFO's rebuild of 2024 lands in FDL's published group. */
export const FdlMatch = ({ data }: { data: ThresholdsData }) => {
    const { matched, total } = fdlMatch(data.countries);

    return (
        <>
            {matched} of {total}
        </>
    );
};

/** The countries where the DFO's rebuild of 2024 differs from FDL, as a list in prose. */
export const FdlMismatches = ({ data }: { data: ThresholdsData }) => (
    <>{listOf(fdlMatch(data.countries).mismatches.map(({ country }) => country.name))}</>
);
