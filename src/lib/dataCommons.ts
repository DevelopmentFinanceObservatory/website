/**
 * Where data comes from: the Observatory's own imports (`dfo`), Data Commons
 * by Google (`base`) or the UN System Data Commons (`un_system`). The APIs
 * send each as `{id, label}`. Search results credit upstream data with "via"
 * and its label, and DFO's own with nothing. The Sources pages credit every
 * source, DFO's own as "via DFO" (sourceOriginLine).
 */

import type { DataCommonsRef } from './search/types.ts';

/** "via Data Commons by Google", or null for the Observatory's own data and
 *  for a provenance the origin catalogue does not list. */
export const viaLabel = (dataCommons: DataCommonsRef | null | undefined): string | null =>
    dataCommons?.label && dataCommons.id !== 'dfo' ? `via ${dataCommons.label}` : null;

/**
 * The line crediting a titled item's data: "World Bank via Data Commons by
 * Google", the publisher alone for DFO's own data, or the origin alone when
 * the title already names the publisher. A title names it when the titled
 * node is the publisher's own node (a UN agency provenance is both its
 * Source and its Dataset) or when its label equals the title. Null when
 * nothing is left to say.
 */
export const originLine = (
    titleRef: string | null | undefined,
    publisher: { ref?: string | null; label?: string | null } | null | undefined,
    dataCommons: DataCommonsRef | null | undefined,
    title?: string | null,
): string | null => {
    const same = (a?: string | null, b?: string | null) =>
        !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
    const named = (!!titleRef && publisher?.ref === titleRef) || same(publisher?.label, title);

    return (
        [named ? null : publisher?.label, viaLabel(dataCommons)].filter(Boolean).join(' ') || null
    );
};

/** A provenance's short name: "DFO" for the Observatory's own imports, else
 *  the Data Commons' label. */
export const provenanceName = (dataCommons: DataCommonsRef): string =>
    dataCommons.id === 'dfo' ? 'DFO' : dataCommons.label;

/** originLine for the Sources pages, which credit DFO's own imports too:
 *  "OECD via DFO". */
export const sourceOriginLine = (
    titleRef: string | null | undefined,
    publisher: { ref?: string | null; label?: string | null } | null | undefined,
    dataCommons: DataCommonsRef | null | undefined,
    title?: string | null,
): string | null => {
    const line = originLine(titleRef, publisher, dataCommons, title);

    return dataCommons?.id === 'dfo' ? [line, 'via DFO'].filter(Boolean).join(' ') : line;
};

/** The label for a source's last import date (`lastDataRefreshDate`), naming
 *  the Data Commons that imported it: "Last refreshed by DFO" or "Last
 *  refreshed by Data Commons by Google". */
export const refreshedByLabel = (dataCommons: DataCommonsRef | null | undefined): string =>
    dataCommons?.label ? `Last refreshed by ${provenanceName(dataCommons)}` : 'Last refreshed';
