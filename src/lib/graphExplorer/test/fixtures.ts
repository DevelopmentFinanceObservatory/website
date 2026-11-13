/**
 * The test documents: cut-down copies of the Graph API's ontology, terms and
 * provenances responses, read fresh for each caller so a test may alter its copy.
 */
import { readFileSync } from 'node:fs';

const read = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

export const ontologyBody = (): unknown => read('ontology');
export const termsBody = (): unknown => read('terms');
export const provenancesBody = (): unknown => read('provenances');
