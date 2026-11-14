/**
 * Models over the test documents changed for the cases the documents do not
 * hold as read: one pattern's population type, or party classes that list
 * their instances.
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

/**
 * The model with two of `financingProvider`'s five range classes listing
 * their instances: Grouping (DAC members, coded G2, and G20) and
 * DACUnspecifiedParty (Unspecified donor, and G20 again). Country,
 * IDSUnidentifiedCreditor and Organization list none.
 */
export const withListedParties = (complete = true): Model => {
    const body = schemaBody() as { nodes: Record<string, unknown>[] };
    const template = body.nodes.find((node) => node.ref === 'CurrencyEUR');
    const member = (ref: string, label: string, types: string[], code: string[] = []) =>
        body.nodes.push({
            ...template,
            ref,
            label,
            types,
            classification_code: code,
            other_properties: {},
        });
    member('DACMembers', 'DAC members', ['Grouping'], ['G2']);
    member('G20', 'G20', ['Grouping', 'DACUnspecifiedParty']);
    member('UnspecifiedDonor', 'Unspecified donor', ['DACUnspecifiedParty']);
    for (const [ref, refs] of [
        ['Grouping', ['DACMembers', 'G20']],
        ['DACUnspecifiedParty', ['UnspecifiedDonor', 'G20']],
    ] as const) {
        const node = body.nodes.find((each) => each.ref === ref);
        if (node === undefined) throw new Error(`no ${ref}`);
        node.instances = { refs, complete };
    }
    return buildModel(readSchema(body), readUsage(usageBody()));
};
