/** The text with its first character in upper case: "a step" reads "A step". */
export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
