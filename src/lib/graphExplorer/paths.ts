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
