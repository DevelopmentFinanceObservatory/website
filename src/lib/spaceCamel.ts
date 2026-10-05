/** A camel-cased graph id as words: "USDollar" → "US Dollar",
 *  "PersonPerSquareKilometer" → "Person Per Square Kilometer". Text that
 *  is already spaced passes through unchanged. */
export const spaceCamel = (raw: string): string =>
    raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
