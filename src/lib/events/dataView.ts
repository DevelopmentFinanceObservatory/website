// No db or server-only imports, so src/lib/test/events-data-view.test.ts can
// run it under plain node.

import type { RecordSlot } from '../chat/apisShares.ts';
import { MAX_LIST_IDS, NO_ID, TOKEN_PATTERN } from './limits.ts';

/** Where the viewer's page got the data it rendered. The website records
 *  data.view only for an embed it serves, which draws a share. */
export type DataViewVia = 'share';

/**
 * The props of a `data.view`: an embed the site served (/embed/<id>) that
 * draws DFO data. `internal_eng` is added by track().
 */
export type DataViewProps = {
    // One entry per distinct frame the embed's data cards show, and one per
    // slot whose frame dfo-apis did not record, in slot order, the two lists
    // parallel and cut to MAX_LIST_IDS. A spec id or content version that
    // fails TOKEN_PATTERN, or an unrecorded frame, is NO_ID.
    specIds: string[];
    contentVersions: string[];
    via: DataViewVia;
    // The hostname of the page the iframe sits on, absent when unknown.
    host?: string;
    // The viewer's `ip:<32 hex>` digest (requestCaller), the key the proxy
    // names the caller by to dfo-apis. Null when no client address resolves.
    caller: string | null;
};

const tokenOr = (value: string): string => (TOKEN_PATTERN.test(value) ? value : NO_ID);

/**
 * The data.view of an embed showing `shownSlots` (the 1-based slots of its
 * data cards) of a share whose slots are `slots`, or null when it shows no
 * data card. Each shown slot gives its frame's spec id and content version.
 * A frame shown by several cards counts once; each slot with no recorded
 * frame counts once. Each list stops at MAX_LIST_IDS, the length the export keeps.
 */
export const embedDataView = ({
    slots,
    shownSlots,
    host,
    caller,
}: {
    slots: readonly RecordSlot[];
    shownSlots: Iterable<number>;
    host: string | null;
    caller: string | null;
}): DataViewProps | null => {
    const shown = new Set(shownSlots);
    const parts = new Map<string, [string, string]>();

    for (const { slot, card } of slots.toSorted((a, b) => a.slot - b.slot)) {
        if (!shown.has(slot) || !card) {
            continue;
        }

        if (card.frame) {
            const part: [string, string] = [
                tokenOr(card.frame.spec_id),
                tokenOr(card.frame.content_version),
            ];

            parts.set(part.join(' '), part);
        } else {
            // No frame to compare, so each such slot keeps its own entry.
            parts.set(`slot ${slot}`, [NO_ID, NO_ID]);
        }
    }

    if (parts.size === 0) {
        return null;
    }

    return {
        specIds: [...parts.values()].map(([specId]) => specId).slice(0, MAX_LIST_IDS),
        contentVersions: [...parts.values()].map(([, version]) => version).slice(0, MAX_LIST_IDS),
        via: 'share',
        ...(host !== null && TOKEN_PATTERN.test(host) && { host }),
        caller,
    };
};
