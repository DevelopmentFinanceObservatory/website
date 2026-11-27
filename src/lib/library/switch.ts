/**
 * The LIBRARY_ENABLED value that shows the Library to everyone: exactly
 * `true`. Unset, empty or any other value keeps it off.
 */
export const readLibraryEnabled = (value: string | undefined): boolean => value === 'true';

export type LibraryView = 'open' | 'preview' | null;

/**
 * What a viewer sees of the Library: `open` while it is enabled, `preview`
 * for an admin while it is not, and `null` (the 404) for anyone else.
 */
export const libraryViewOf = (enabled: boolean, isAdmin: boolean): LibraryView => {
    if (enabled) {
        return 'open';
    }

    return isAdmin ? 'preview' : null;
};
