import styles from './LibraryArtifact.module.scss';

import type { LibraryChartData as ChartData } from '@/lib/library/chartData';
import { formatPeriod, formatWindow } from '@/lib/studio/period';

export const LibraryChartData = ({ data }: { data: ChartData }): React.JSX.Element => (
    <>
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(data.dataset).replace(/</g, '\\u003c'),
            }}
        />
        <details className={styles.chartData}>
            <summary>Data ({formatWindow(data.window)})</summary>
            <a href={data.csvHref}>Download CSV</a>
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
        </details>
    </>
);
