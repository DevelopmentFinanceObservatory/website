/**
 * The Graph Explorer's paths: its three screens and the Google sheet
 * handler. The section's root lives in signIn.ts, which the proxy loads
 * without imports.
 */
import { GRAPH_EXPLORER_PATH } from './signIn.ts';

/** The Explore screen. */
export const EXPLORE_PATH = GRAPH_EXPLORER_PATH;

/** The Start a sheet screen. */
export const NEW_SHEET_PATH = `${GRAPH_EXPLORER_PATH}/new-sheet`;

/** The Check a sheet screen. */
export const CHECK_SHEET_PATH = `${GRAPH_EXPLORER_PATH}/check-sheet`;

/** Where the Google sheet handler answers. */
export const SHEETS_ROUTE = `${GRAPH_EXPLORER_PATH}/api/sheets`;

/** The section's three screens. */
export type GraphExplorerScreen = 'explore' | 'new-sheet' | 'check-sheet';

/** The screen a path inside the section belongs to. Any other path is Explore's. */
export const screenOf = (path: string): GraphExplorerScreen => {
    if (path.startsWith(NEW_SHEET_PATH)) return 'new-sheet';
    if (path.startsWith(CHECK_SHEET_PATH)) return 'check-sheet';
    return 'explore';
};
