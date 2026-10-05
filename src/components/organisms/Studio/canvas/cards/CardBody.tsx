import ChartCard from './ChartCard';
import KeyNumberCard from './KeyNumberCard';
import TableCard from './TableCard';
import TextCard from './TextCard';
import type { CardExtras } from './types';
import type { CardView } from '../layout';

import { type ChartWidget, tableFromChart, type Widget } from '@/lib/chat/widgets';
import type { ThemeDerived } from '@/lib/studio/theme';

type CardBodyProps = {
    widget: Widget;
    // The resolved view + the chartable form of the data (see layout.ts).
    view: CardView | null;
    chartSource: ChartWidget | null;
    scale: number;
    theme: ThemeDerived;
    // Text cards report the rows their content needs.
    widthCells: number;
    onFit: (rows: number) => void;
    extras: CardExtras;
};

/**
 * The card for a widget in its current visualisation. The switcher can
 * re-visualise the card: chart↔table both ways (a table only charts when
 * its data supports it). Keyed by the active view, so switching remounts the
 * card from scratch instead of morphing its guts.
 */
const CardBody = ({
    widget,
    view,
    chartSource,
    scale,
    theme,
    widthCells,
    onFit,
    extras,
}: CardBodyProps) => {
    if (widget.kind === 'key_number') {
        return <KeyNumberCard widget={widget} {...extras} />;
    }

    if (widget.kind === 'text') {
        return <TextCard widget={widget} widthCells={widthCells} onFit={onFit} {...extras} />;
    }

    if (view === 'chart-table') {
        const asTable = widget.kind === 'table' ? widget : tableFromChart(widget);

        return <TableCard key={view} widget={asTable} {...extras} />;
    }

    if (view && chartSource) {
        return (
            <ChartCard
                key={view}
                widget={chartSource}
                line={view === 'chart-line'}
                scale={scale}
                theme={theme}
                {...extras}
            />
        );
    }

    // A table whose data can't chart falls back to itself.
    return widget.kind === 'table' ? <TableCard widget={widget} {...extras} /> : null;
};

export default CardBody;
