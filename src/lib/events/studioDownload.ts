// No db, server-only or path-alias imports, so db/event-export.ts and
// node --test import it directly.

import type { Widget } from '../chat/widgets.ts';
import type { DatasetFormat } from '../search/searchClient.ts';
import type { StudioVariant } from '../studio/variant.ts';

/**
 * Where a `studio.download` started:
 * - `card`: a card's Download Data sheet, on the canvas or on a share.
 * - `share_dialog`: the Data tab of the Studio Share dialog.
 */
export const STUDIO_DOWNLOAD_SOURCES = ['card', 'share_dialog'] as const;

export type StudioDownloadSource = (typeof STUDIO_DOWNLOAD_SOURCES)[number];

/** The props of `studio.download`, sent once the file is received. */
export type StudioDownloadProps = {
    format: DatasetFormat;
    bundle: boolean;
    kind: Widget['kind'];
    cardId: string;
    shared: boolean;
    source: StudioDownloadSource;
    variant: StudioVariant;
};
