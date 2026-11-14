/**
 * Models over the test documents with one pattern's population type changed,
 * for the cases the documents do not hold as read.
 */
import { buildModel, type Model } from '../model.ts';
import { readSchema, readUsage } from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';

/** The model with pattern `index` of `dataset` about `classId` instead. */
export const withPatternClass = (dataset: string, index: number, classId: string | null): Model => {
    const provenances = readUsage(usageBody());
    const pattern = provenances.provenances.find((each) => each.ref === dataset)?.patterns[index];
    if (pattern === undefined) throw new Error(`no pattern ${index} in ${dataset}`);
    pattern.population_type = classId;
    return buildModel(readSchema(schemaBody()), provenances);
};
