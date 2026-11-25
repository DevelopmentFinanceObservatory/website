// No db, server-only or path-alias imports, so db/event-export.ts and
// node --test import it directly.

import type { ShareMode } from '../chat/shareMode.ts';
import type { ShareKind } from '../chat/sharePrune.ts';

/**
 * What a `share.copy` put on the clipboard:
 * - `link`: a share's `/s/<id>` link, from the Studio Share dialog or the
 *   search Share box.
 * - `embed_code`: a share's `<iframe>` snippet, from the Studio Share
 *   dialog's Canvas or Embed tab.
 * - `download_link`: a search share's download link for its datasets.
 * - `query_link`: a search's `/data?q=` link, from the Share button of a
 *   result with no dataset to share. No share stands behind it.
 */
export const SHARE_COPIED = ['link', 'embed_code', 'download_link', 'query_link'] as const;

export type ShareCopied = (typeof SHARE_COPIED)[number];

export type ShareCopyProps = {
    kind: ShareKind;
    copied: ShareCopied;
    shareId?: string;
    mode?: ShareMode;
};

/**
 * The props of `share.copy`, sent once the clipboard holds the text. A
 * `share` names the minted share and its mode at the moment of the copy; a
 * `query_link` has none.
 */
export const shareCopyProps = ({
    kind,
    copied,
    share,
}: {
    kind: ShareKind;
    copied: ShareCopied;
    share: { id: string; mode: ShareMode } | null;
}): ShareCopyProps => ({
    kind,
    copied,
    ...(share && { shareId: share.id, mode: share.mode }),
});
