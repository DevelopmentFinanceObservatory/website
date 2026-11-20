/**
 * The Graph Explorer's paths: its three screens. The section's root lives
 * in signIn.ts, which the proxy loads without imports.
 */
import { GRAPH_EXPLORER_PATH } from './signIn.ts';

/** The Explore screen. */
export const EXPLORE_PATH = GRAPH_EXPLORER_PATH;

/** The Seed a dataset screen. */
export const SEED_PATH = `${GRAPH_EXPLORER_PATH}/seed`;

/** The Check a sheet screen, which is the Seed a dataset page opened at its check step. */
export const CHECK_SHEET_PATH = `${GRAPH_EXPLORER_PATH}/check-sheet`;

/** The section's three screens. */
export type GraphExplorerScreen = 'explore' | 'seed' | 'check-sheet';

/** The screen a path inside the section belongs to. Any other path is Explore's. */
export const screenOf = (path: string): GraphExplorerScreen => {
    if (path.startsWith(SEED_PATH)) return 'seed';
    if (path.startsWith(CHECK_SHEET_PATH)) return 'check-sheet';
    return 'explore';
};
