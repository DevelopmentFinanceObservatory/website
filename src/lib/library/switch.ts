/**
 * The LIBRARY_ENABLED value that shows the Library to everyone: exactly
 * `true`. Unset, empty or any other value keeps it off.
 */
export const readLibraryEnabled = (value: string | undefined): boolean => value === 'true';
