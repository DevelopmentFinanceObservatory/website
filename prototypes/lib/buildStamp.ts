// The build stamp every page carries as `<meta name="dfo-build">`, which scripts/check-live.mts
// matches after a deploy. It names the commit and, when the build ran in CI, the run: a
// scheduled rebuild of an unchanged commit reads DFO again, so only the run tells its pages from
// the previous deploy's.

/** The stamp of a build of `commit`, as `<commit>+<run>` when `run` is given. */
export const buildStamp = ({ commit, run }: { commit: string; run?: string | null }): string =>
    run ? `${commit}+${run}` : commit;

/** The commit and run a stamp names; `run` is null for a stamp without one. */
export const parseBuildStamp = (stamp: string): { commit: string; run: string | null } => {
    const at = stamp.indexOf('+');

    return at === -1
        ? { commit: stamp, run: null }
        : { commit: stamp.slice(0, at), run: stamp.slice(at + 1) };
};

/** Whether a served stamp is the build expected: the same commit, and the same run when a run
 *  is expected. A null stamp, from a page with no marker, never matches. */
export const matchesBuild = (
    served: string | null,
    expected: { commit: string; run: string | null },
): boolean => {
    if (served === null) {
        return false;
    }

    const { commit, run } = parseBuildStamp(served);

    return commit === expected.commit && (expected.run === null || run === expected.run);
};
