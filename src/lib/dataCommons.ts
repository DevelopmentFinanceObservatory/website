/**
 * Where data comes from: the Observatory's own imports (`dfo`), Data Commons
 * by Google (`base`) or the UN System Data Commons (`un_system`). The APIs
 * send each as `{id, label}`. The site credits upstream data with "via" and
 * its label, and DFO's own with nothing.
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
