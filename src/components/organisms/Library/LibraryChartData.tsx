import styles from './LibraryArtifact.module.scss';

import type { LibraryChartData as ChartData } from '@/lib/library/chartData';
import { formatPeriod, formatWindow } from '@/lib/studio/period';

const count = (n: number): string => n.toLocaleString('en-GB');

// "Showing 250 of 2,000 rows, 2016–2023.", and "Showing none of 2,000 rows."
// for a table the page has no rows left for.
const shownNote = ({ rows, totalRows, shownWindow }: ChartData): string =>
    shownWindow
        ? `Showing ${count(rows.length)} of ${count(totalRows)} rows, ${formatWindow(shownWindow)}.`
        : `Showing none of ${count(totalRows)} rows.`;

export const LibraryChartData = ({ data }: { data: ChartData }): React.JSX.Element => {
    // A table cut to fit the page says so under it, beside the link to the
    // full data.
    const cut = data.rows.length < data.totalRows;
    const download = (
        <a
            href={data.csvHref}
            aria-label={data.label ? `Download CSV of ${data.label}` : undefined}
        >
            Download CSV
        </a>
    );

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(data.dataset).replace(/</g, '\\u003c'),
                }}
            />
            <details className={styles.chartData}>
                <summary>
                    {data.label ? `Data for ${data.label}` : 'Data'} ({formatWindow(data.window)})
                </summary>
                {cut ? null : download}
                {data.rows.length ? (
                    <table>
                        <caption>{data.dataset.variableMeasured}</caption>
                        <thead>
                            <tr>
                                <th scope="col">{data.seriesHeading}</th>
                                <th scope="col">{data.periodHeading}</th>
                                <th scope="col">Value</th>
                                <th scope="col">Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map(({ series, period, value, unit }, index) => (
                                <tr key={index}>
                                    <th scope="row">{series}</th>
                                    <td>{formatPeriod(period)}</td>
                                    <td>{value}</td>
                                    <td>{unit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : null}
                {cut ? (
                    <p>
                        {shownNote(data)} {download}
                    </p>
                ) : null}
            </details>
        </>
    );
};
