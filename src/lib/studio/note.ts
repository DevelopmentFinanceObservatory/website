/**
 * Strip the italic markdown wrapping a transcript note carries (`_${text}_`)
 * to get its plain-text status form. Only the leading and trailing
 * underscore are removed — an underscore anywhere inside the note's own
 * text, including one the user typed, is kept.
 */
export const plainTextFromNote = (note: string): string => note.replace(/^_|_$/g, '');
