/**
 * The places an id may wrap: after each "/", "." and "_", and before a
 * capital that follows a lower-case letter.
 */
const BREAKS = /(?<=[/._])|(?<=[a-z])(?=[A-Z])/;

/**
 * An id, code or path cut where it may wrap: after each "/" of a path, "."
 * of a dotted code and "_" between the parts of a StatVar dcid, and between
 * the words of a camelCase name. "provenance/OECDDAC1" gives "provenance/",
 * "OECDDAC1"; "fixedCapitalConsumptionBasis" gives "fixed", "Capital",
 * "Consumption", "Basis".
 */
export const idPieces = (text: string): string[] => text.split(BREAKS);
