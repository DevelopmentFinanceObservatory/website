// The country search: accent-blind matching on the names the page prints.
import type { Country } from '../_data/types.ts';

const fold = (text: string): string =>
    text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

/**
 * Countries matching `query`, ignoring accents and case: names that start with it first,
 * then names with a word that starts with it, then names that contain it, each by name.
 * An empty query matches every country, by name.
 */
export const matchCountries = (countries: readonly Country[], query: string): Country[] => {
    const q = fold(query.trim());
    const rank = (name: string): number => {
        const folded = fold(name);

        if (folded.startsWith(q)) {
            return 0;
        }

        if (folded.split(/[\s'-]+/).some((word) => word.startsWith(q))) {
            return 1;
        }

        return folded.includes(q) ? 2 : 3;
    };

    return countries
        .map((country) => ({ country, score: rank(country.name) }))
        .filter(({ score }) => score < 3)
        .toSorted((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name))
        .map(({ country }) => country);
};
