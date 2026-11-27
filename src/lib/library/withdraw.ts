import type { ArtifactShare } from './store.ts';

/**
 * Withdrawing an artifact once its share is settled, with the database reads
 * and writes and the dfo-apis take-down passed in (./admin.ts passes the real ones), so
 * a test can stand in for either.
 */

/** A share the Library made, with its owner token. */
export type TokenShare = { shareId: string; writeToken: string };

export type ShareSettling = {
    /** Answers `done` once dfo-apis holds no such share, else the failure's
     *  code (`takeDownTokenShare`). */
    takeDown: (share: TokenShare) => Promise<string>;
    /** Records the share in `share_cleanup` for an operator, and throws when
     *  the record does not commit (`keepShareForCleanup`). */
    keepForCleanup: (row: TokenShare & { userId: string; reason: string }) => Promise<void>;
};

export type WithdrawDeps = ShareSettling & {
    /** The artifact's slug and share, while its row holds the share token
     *  (`artifactShare`), else null. */
    share: (id: string) => Promise<ArtifactShare | null>;
    /** Withdraws and erases the row and drops its share token in one
     *  statement (`withdrawArtifact`). */
    withdraw: (id: string) => Promise<{ slug: string } | 'not_found'>;
};

/**
 * Takes down a share, or else records it in `share_cleanup` under `adminId`.
 * True once one of the two holds: dfo-apis confirmed the share is gone, or the
 * cleanup record committed. False when both failed, which logs
 * `share_cleanup_not_recorded` with the share id.
 */
export const settleShare = async (
    { takeDown, keepForCleanup }: ShareSettling,
    share: TokenShare,
    adminId: string,
): Promise<boolean> => {
    const removed = await takeDown(share);

    if (removed === 'done') {
        return true;
    }

    try {
        await keepForCleanup({ ...share, userId: adminId, reason: removed });

        return true;
    } catch (error) {
        console.error('share_cleanup_not_recorded', {
            share: share.shareId,
            reason: removed,
            error: String(error),
        });

        return false;
    }
};

/**
 * Settles artifact `id`'s share first (`settleShare`), then withdraws the
 * row. When the share is not settled, nothing changes: the artifact stays
 * published with its token, `settled` is false, and the Edit dialog's Delete
 * runs it all again. When the share is settled and the row write then
 * fails, the error is thrown, and the next call meets the share gone
 * (dfo-apis' `not_found` counts as done) or its cleanup record already kept,
 * and withdraws the row. Answers `not_found` for an id no artifact has, for a
 * withdrawn one, and when another call withdrew it meanwhile.
 */
export const withdraw = async (
    deps: WithdrawDeps,
    id: string,
    adminId: string,
): Promise<{ slug: string; settled: boolean } | 'not_found'> => {
    const share = await deps.share(id);

    if (!share) {
        return 'not_found';
    }

    const settled = await settleShare(
        deps,
        { shareId: share.shareId, writeToken: share.shareWriteToken },
        adminId,
    );

    if (!settled) {
        return { slug: share.slug, settled };
    }

    const withdrawn = await deps.withdraw(id);

    return withdrawn === 'not_found' ? withdrawn : { slug: withdrawn.slug, settled };
};
