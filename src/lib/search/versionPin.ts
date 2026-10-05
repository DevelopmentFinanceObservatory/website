import 'server-only';

/**
 * Pins a downloaded version once per instance (server only). The pin needs
 * the site's own principal (DFO_PRINCIPAL) and is skipped silently without it.
 * `/api/download-pin` pins through this after the search
 * page's own download, and `/s/<id>/download` after a share's live link.
 */

// The versions this instance has pinned or is pinning, so a repeat call
// makes no upstream request. A failure removes the version so a later call
// can retry.
const MAX_REMEMBERED = 10_000;
const pinnedVersions = new Set<string>();

const versionKey = ({ specId, contentVersion }: { specId: string; contentVersion: string }) =>
    `${specId}/${contentVersion}`;

/**
 * Whether pinVersionOnce would pin the version: this instance holds the
 * principal and has not pinned (or started pinning) it. A route checks this
 * before it reads the configuration a pin needs, so a call that pins nothing
 * stays quiet.
 */
export const needsPin = (version: { specId: string; contentVersion: string }): boolean =>
    !!process.env.DFO_PRINCIPAL && !pinnedVersions.has(versionKey(version));

/**
 * Runs `pin` with the principal unless this instance has already pinned (or
 * is pinning) the version. Resolves false when it skipped, true when `pin`
 * resolved, and rethrows what `pin` threw after forgetting the version.
 */
export const pinVersionOnce = async (
    version: { specId: string; contentVersion: string },
    pin: (principal: string) => Promise<unknown>,
): Promise<boolean> => {
    const principal = process.env.DFO_PRINCIPAL;
    const key = versionKey(version);

    if (!principal || !needsPin(version)) {
        return false;
    }

    if (pinnedVersions.size >= MAX_REMEMBERED) {
        pinnedVersions.clear();
    }

    pinnedVersions.add(key);

    try {
        await pin(principal);

        return true;
    } catch (error) {
        pinnedVersions.delete(key);
        throw error;
    }
};
