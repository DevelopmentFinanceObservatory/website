/**
 * The test documents: cut-down copies of the Graph API's schema, terms and
 * usage responses, and of the base and UN System usage documents, read fresh
 * for each caller so a test may alter its copy.
 */
import { readFileSync } from 'node:fs';

const read = (name: string): unknown =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

export const schemaBody = (): unknown => read('schema');
export const termsBody = (): unknown => read('terms');
export const usageBody = (): unknown => read('usage');
export const baseUsageBody = (): unknown => read('usage-base');
export const unUsageBody = (): unknown => read('usage-un');
