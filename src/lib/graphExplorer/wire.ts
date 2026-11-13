/**
 * The Graph API's ontology documents, as served under /api/graph/ontology,
 * and a guard per response that refuses a changed shape.
 *
 * Members keep the server's snake case and Data Commons nouns: `types` is
 * `typeOf`, `sub_class_of` is `subClassOf`, and so on. Each guard checks
 * every member of every node, pattern, term and finding, so a response
 * whose shape has moved fails at the point it enters, before any screen
 * reads it.
 */
import { asRecord } from '../asRecord.ts';

/** Who declares a node: base when every declaring provenance is a base Data Commons one. */
export type DeclaredBy = 'instance' | 'base';

/** The members of an enumeration Class. */
export type OntologyEnumeration = {
    /** The dcids of the members read, sorted. */
    members: string[];
    /** True when the member read stopped at its cap. */
    truncated: boolean;
};

/** One node of the ontology document. Every list is sorted. */
export type OntologyNode = {
    dcid: string;
    /** Null when the graph names the node only by its dcid. */
    name: string | null;
    description: string | null;
    /** The node's `typeOf` values. */
    types: string[];
    alternate_name: string[];
    sub_class_of: string[];
    sub_property_of: string[];
    specialization_of: string[];
    domain_includes: string[];
    range_includes: string[];
    classification_code: string[];
    /** The provenances declaring the node's `typeOf` arc. */
    provenances: string[];
    /** Null when the graph declares no type for the node. */
    declared_by: DeclaredBy | null;
    /** Set on an enumeration Class, null on every other node. */
    enumeration: OntologyEnumeration | null;
};

/** GET /api/graph/ontology: the instance's model. */
export type OntologyDocument = {
    /** Null when the server has no generation to name. */
    generation: string | null;
    nodes: OntologyNode[];
};

/** One Class or Property on the graph. */
export type OntologyTerm = {
    dcid: string;
    name: string | null;
    types: ('Class' | 'Property')[];
    provenances: string[];
    declared_by: DeclaredBy;
};

/** GET /api/graph/ontology/terms: every Class and Property on the graph. */
export type OntologyTerms = {
    generation: string | null;
    terms: OntologyTerm[];
};

/** One distinct way a provenance's StatVars use the model. */
export type OntologyPattern = {
    population_type: string | null;
    measured_property: string;
    stat_type: string | null;
    measurement_qualifier: string | null;
    measurement_denominator: string | null;
    constraint_properties: string[];
    observation_properties: string[];
    stat_var_count: number;
    /** Up to three StatVar dcids that follow the pattern. */
    examples: string[];
};

/** One value a constraint property takes, and how many StatVars take it. */
export type OntologyValueCount = {
    value: string;
    stat_var_count: number;
};

/** The values one constraint property takes over a provenance's StatVars. */
export type OntologyConstraintValues = {
    property: string;
    values: OntologyValueCount[];
};

/** The facet facts of a provenance's coverage series. */
export type OntologyFacets = {
    units: string[];
    scaling_factors: string[];
    measurement_methods: string[];
    observation_periods: string[];
    currencies: string[];
};

/** How one provenance's StatVars use the model. */
export type OntologyProvenance = {
    dcid: string;
    label: string | null;
    description: string | null;
    stat_var_count: number;
    /** Sorted by StatVar count, largest first. */
    patterns: OntologyPattern[];
    constraint_values: OntologyConstraintValues[];
    facets: OntologyFacets;
};

/** GET /api/graph/ontology/provenances: how each provenance uses the model. */
export type OntologyProvenances = {
    provenances: OntologyProvenance[];
};

/** A constraint value as sent: a node dcid, or a literal or null the check refuses. */
export type CheckConstraintValue = string | number | boolean | null;

/** One candidate StatisticalVariable definition. */
export type OntologyCheckRow = {
    /** The caller's label, echoed on its findings. */
    ref?: string | null;
    dcid?: string | null;
    population_type?: string | null;
    measured_property: string;
    stat_type?: string | null;
    measurement_qualifier?: string | null;
    measurement_denominator?: string | null;
    constraint_properties?: Record<string, CheckConstraintValue>;
    observation_properties?: string[];
};

/** The most rows one check request carries. */
export const CHECK_MAX_ROWS = 2000;

/** POST /api/graph/ontology/check: 1 to CHECK_MAX_ROWS rows. */
export type OntologyCheckRequest = {
    rows: OntologyCheckRow[];
};

export const FINDING_CODES = [
    'node_not_held',
    'node_provisional',
    'node_untyped',
    'value_missing',
    'not_a_property',
    'not_a_class',
    'value_outside_range',
    'property_outside_domain',
    'definition_differs',
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

/** True for a code this page has a message for; the server may send others. */
export const isFindingCode = (code: string): code is FindingCode =>
    (FINDING_CODES as readonly string[]).includes(code);

/** One fault in one checked row. */
export type OntologyFinding = {
    ref: string | null;
    /** The row member, or `constraint_properties.<property>` for a constraint. */
    field: string;
    /** The value at fault; for `definition_differs`, the value the server holds. */
    value: CheckConstraintValue | string[];
    /** One of FINDING_CODES, or a code added on the server since. */
    code: string;
    severity: 'error' | 'warning';
};

/** How a finding's `field` names a constraint property. */
export const CONSTRAINT_PREFIX = 'constraint_properties.';

/** The constraint property a finding's field names, or null for a definition field. */
export const findingProperty = (finding: Pick<OntologyFinding, 'field'>): string | null =>
    finding.field.startsWith(CONSTRAINT_PREFIX)
        ? finding.field.slice(CONSTRAINT_PREFIX.length)
        : null;

/** The answer to a check request. */
export type OntologyCheckResponse = {
    generation: string | null;
    row_count: number;
    findings: OntologyFinding[];
};

/** A response whose shape differs from the one these types describe. */
export class WireShapeError extends Error {
    override name = 'WireShapeError';
}

type Check = (value: unknown, path: string) => void;

const fail = (path: string, expected: string): never => {
    throw new WireShapeError(`${path}: expected ${expected}`);
};

const str: Check = (value, path) => {
    if (typeof value !== 'string') fail(path, 'a string');
};

const num: Check = (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'a number');
};

const bool: Check = (value, path) => {
    if (typeof value !== 'boolean') fail(path, 'a boolean');
};

const nullable =
    (check: Check): Check =>
    (value, path) => {
        if (value !== null) check(value, path);
    };

const oneOf =
    (allowed: readonly string[]): Check =>
    (value, path) => {
        if (typeof value !== 'string' || !allowed.includes(value)) {
            fail(path, `one of ${allowed.join(', ')}`);
        }
    };

/** A list whose every element passes `item`. */
const list =
    (item: Check): Check =>
    (value, path) => {
        if (!Array.isArray(value)) return fail(path, 'a list');
        for (let at = 0; at < value.length; at += 1) item(value[at], `${path}[${at}]`);
    };

const obj =
    (members: Record<string, Check>): Check =>
    (value, path) => {
        const record = asRecord(value);
        if (!record) return fail(path, 'an object');
        for (const [key, check] of Object.entries(members)) {
            if (!(key in record)) fail(`${path}.${key}`, 'a member');
            check(record[key], `${path}.${key}`);
        }
    };

const strList = list(str);
const declaredBy = oneOf(['instance', 'base']);

const ontologyDocument = obj({
    generation: nullable(str),
    nodes: list(
        obj({
            dcid: str,
            name: nullable(str),
            description: nullable(str),
            types: strList,
            alternate_name: strList,
            sub_class_of: strList,
            sub_property_of: strList,
            specialization_of: strList,
            domain_includes: strList,
            range_includes: strList,
            classification_code: strList,
            provenances: strList,
            declared_by: nullable(declaredBy),
            enumeration: nullable(obj({ members: strList, truncated: bool })),
        }),
    ),
});

const ontologyTerms = obj({
    generation: nullable(str),
    terms: list(
        obj({
            dcid: str,
            name: nullable(str),
            types: list(oneOf(['Class', 'Property'])),
            provenances: strList,
            declared_by: declaredBy,
        }),
    ),
});

const ontologyProvenances = obj({
    provenances: list(
        obj({
            dcid: str,
            label: nullable(str),
            description: nullable(str),
            stat_var_count: num,
            patterns: list(
                obj({
                    population_type: nullable(str),
                    measured_property: str,
                    stat_type: nullable(str),
                    measurement_qualifier: nullable(str),
                    measurement_denominator: nullable(str),
                    constraint_properties: strList,
                    observation_properties: strList,
                    stat_var_count: num,
                    examples: strList,
                }),
            ),
            constraint_values: list(
                obj({
                    property: str,
                    values: list(obj({ value: str, stat_var_count: num })),
                }),
            ),
            facets: obj({
                units: strList,
                scaling_factors: strList,
                measurement_methods: strList,
                observation_periods: strList,
                currencies: strList,
            }),
        }),
    ),
});

const findingValue: Check = (value, path) => {
    if (Array.isArray(value)) return strList(value, path);
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        fail(path, 'a string, number, boolean, null or list of strings');
    }
};

const ontologyCheckResponse = obj({
    generation: nullable(str),
    row_count: num,
    findings: list(
        obj({
            ref: nullable(str),
            field: str,
            value: findingValue,
            code: str,
            severity: oneOf(['error', 'warning']),
        }),
    ),
});

// Each guard runs its checks, then narrows: the checks are what make the cast true.

/** The ontology document, or a WireShapeError naming the first member out of shape. */
export const readOntology = (body: unknown): OntologyDocument => {
    ontologyDocument(body, 'ontology');
    return body as OntologyDocument;
};

/** The terms list, or a WireShapeError naming the first member out of shape. */
export const readTerms = (body: unknown): OntologyTerms => {
    ontologyTerms(body, 'terms');
    return body as OntologyTerms;
};

/** The provenances document, or a WireShapeError naming the first member out of shape. */
export const readProvenances = (body: unknown): OntologyProvenances => {
    ontologyProvenances(body, 'provenances');
    return body as OntologyProvenances;
};

/** A check response, or a WireShapeError naming the first member out of shape. */
export const readCheckResponse = (body: unknown): OntologyCheckResponse => {
    ontologyCheckResponse(body, 'check');
    return body as OntologyCheckResponse;
};
