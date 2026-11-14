/**
 * The Graph API's schema documents, as served under /api/graph/schema, and
 * a guard per response that refuses an unexpected shape.
 *
 * Members keep the server's snake case and Data Commons nouns: `types` is
 * `typeOf`, `sub_class_of` is `subClassOf`, and so on. Each guard checks
 * every member of every node, pattern, term and finding, so a response
 * with a different shape fails at the point it enters, before any screen
 * reads it. A member drawn from a fixed list that may grow (`declared_by`,
 * a finding's `field`, `subject`, `severity` and `code`) passes as any
 * string, and the screens read a value they do not know with plain words.
 */
import { asRecord } from '../asRecord.ts';

/**
 * The origins that declare a node, by the origin ids the Graph API uses
 * elsewhere: DFO, base Data Commons, or the UN System Data Commons.
 */
export const DECLARERS = ['dfo', 'base', 'un_system'] as const;

export type Declarer = (typeof DECLARERS)[number];

/** True for an origin this page has words for. The server may send others. */
export const isDeclarer = (value: string): value is Declarer =>
    (DECLARERS as readonly string[]).includes(value);

/** The members of an enumeration Class. */
export type SchemaEnumeration = {
    /** The dcids of the members read, sorted. */
    members: string[];
    /**
     * True when `members` is every member the graph holds. False for a base
     * Data Commons enumeration, whose list holds only the members the DFO
     * code index names, and for a list whose read stopped at its cap.
     */
    complete: boolean;
};

/** One value of an open property: a node by its dcid, or a literal. */
export type OpenValue = { readonly dcid: string } | { readonly value: string };

/**
 * Every outgoing property of a node besides the named fields, by property
 * dcid, each with its values sorted. Empty for a node with none.
 */
export type OtherProperties = Readonly<Record<string, readonly OpenValue[]>>;

/** One node of the schema document. Every list is sorted. */
export type SchemaNode = {
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
    /**
     * The origin declaring the node: one of DECLARERS, or an origin the
     * server names that DECLARERS lacks. Null when the graph names no
     * declaring provenance for the node.
     */
    declared_by: string | null;
    /** Set on an enumeration Class, null on every other node. */
    enumeration: SchemaEnumeration | null;
    other_properties: OtherProperties;
};

/** GET /api/graph/schema: the instance's model. */
export type SchemaDocument = {
    /** Null when the server has no generation to name. */
    generation: string | null;
    nodes: SchemaNode[];
};

/** One Class or Property on the graph. */
export type SchemaTerm = {
    dcid: string;
    name: string | null;
    types: ('Class' | 'Property')[];
    provenances: string[];
    /** As on a schema node: one of DECLARERS, another origin, or null. */
    declared_by: string | null;
};

/** GET /api/graph/schema/terms: every Class and Property on the graph. */
export type SchemaTerms = {
    generation: string | null;
    terms: SchemaTerm[];
};

/** One distinct way a provenance's StatVars use the model. */
export type SchemaPattern = {
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
export type SchemaValueCount = {
    value: string;
    stat_var_count: number;
};

/** The values one constraint property takes over a provenance's StatVars. */
export type SchemaConstraintValues = {
    property: string;
    values: SchemaValueCount[];
};

/** The facet facts of a provenance's coverage series. */
export type SchemaFacets = {
    units: string[];
    scaling_factors: string[];
    measurement_methods: string[];
    observation_periods: string[];
    currencies: string[];
};

/** How one provenance's StatVars use the model. */
export type ProvenanceUsage = {
    dcid: string;
    label: string | null;
    description: string | null;
    stat_var_count: number;
    /** Sorted by StatVar count, largest first. */
    patterns: SchemaPattern[];
    constraint_values: SchemaConstraintValues[];
    facets: SchemaFacets;
};

/** GET /api/graph/schema/usage: how each provenance uses the model. */
export type SchemaUsage = {
    provenances: ProvenanceUsage[];
};

/** A constraint value as sent: a node dcid, or a literal or null the check flags. */
export type CheckConstraintValue = string | number | boolean | null;

/** One candidate StatisticalVariable definition. An empty string counts as absent. */
export type SchemaCheckRow = {
    dcid?: string | null;
    population_type?: string | null;
    measured_property?: string | null;
    stat_type?: string | null;
    measurement_qualifier?: string | null;
    measurement_denominator?: string | null;
    constraint_properties?: Record<string, CheckConstraintValue>;
    observation_properties?: string[];
};

/** The most rows one check request carries. */
export const CHECK_MAX_ROWS = 2000;

/** The most constraint properties one check row names. */
export const CHECK_MAX_CONSTRAINT_PROPERTIES = 16;

/** The most observation properties one check row names. */
export const CHECK_MAX_OBSERVATION_PROPERTIES = 4;

/**
 * The longest string a check row may send: a definition field, an
 * observation property, a constraint property name or a constraint value.
 */
export const CHECK_MAX_STRING_LENGTH = 512;

/** How long the Graph API works on one check request before it answers 503 or 504. */
export const CHECK_DEADLINE_MS = 30_000;

/** POST /api/graph/schema/check: 1 to CHECK_MAX_ROWS rows. */
export type SchemaCheckRequest = {
    rows: readonly SchemaCheckRow[];
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
    'origin_not_served',
    'not_a_node',
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

/** True for a code this page has a message for. The server may send others. */
export const isFindingCode = (code: string): code is FindingCode =>
    (FINDING_CODES as readonly string[]).includes(code);

/** The row members a finding's `field` names. */
export const CHECK_FIELDS = [
    'dcid',
    'population_type',
    'measured_property',
    'stat_type',
    'measurement_qualifier',
    'measurement_denominator',
    'constraint_properties',
    'observation_properties',
] as const;

export type CheckField = (typeof CHECK_FIELDS)[number];

/** True for a row member this page has words for. The server may name others. */
export const isCheckField = (field: string): field is CheckField =>
    (CHECK_FIELDS as readonly string[]).includes(field);

/** A finding's value as sent, or as served on `definition_differs`. */
export type FindingValue = CheckConstraintValue | string[];

/** One fault in one checked row. */
export type SchemaFinding = {
    /** The row's index in the request's `rows`. */
    row: number;
    /** One of CHECK_FIELDS, or a row member the server names that CHECK_FIELDS lacks. */
    field: string;
    /** The constraint or observation property the finding is about, else null. */
    property: string | null;
    /**
     * `property` when the finding judges the property itself, else `value`.
     * Any other value reads as `value`.
     */
    subject: string;
    /** What was sent for the judged cell: the property dcid when `subject` is `property`. */
    value: FindingValue;
    /** The served value on `definition_differs`, null otherwise. */
    served: FindingValue;
    /** One of FINDING_CODES, or a code the server sends that FINDING_CODES lacks. */
    code: string;
    /** `error` or `warning`. Any other value reads as a warning. */
    severity: string;
};

/**
 * The answer to a check request. The rows checked are the first
 * `rows_checked` sent; the caller resumes at `rows_checked` when it is less
 * than the rows sent.
 */
export type SchemaCheckResponse = {
    generation: string | null;
    rows_checked: number;
    findings: SchemaFinding[];
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

/** An open property's value: an object holding exactly one of `dcid` and `value`, a string. */
const openValue: Check = (value, path) => {
    const record = asRecord(value);
    const keys = record ? Object.keys(record) : [];
    const [key] = keys;
    if (keys.length !== 1 || (key !== 'dcid' && key !== 'value')) {
        return fail(path, 'an object with exactly one of dcid and value');
    }
    str(record?.[key], `${path}.${key}`);
};

const openValues = list(openValue);

/** A map from property dcid to a list of open values. */
const openMap: Check = (value, path) => {
    const record = asRecord(value);
    if (!record) return fail(path, 'an object');
    for (const [property, values] of Object.entries(record))
        openValues(values, `${path}.${property}`);
};

const schemaDocument = obj({
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
            declared_by: nullable(str),
            enumeration: nullable(obj({ members: strList, complete: bool })),
            other_properties: openMap,
        }),
    ),
});

const schemaTerms = obj({
    generation: nullable(str),
    terms: list(
        obj({
            dcid: str,
            name: nullable(str),
            types: list(oneOf(['Class', 'Property'])),
            provenances: strList,
            declared_by: nullable(str),
        }),
    ),
});

const schemaUsage = obj({
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

const index: Check = (value, path) => {
    if (!Number.isInteger(value) || (value as number) < 0) fail(path, 'a whole number');
};

const schemaCheckResponse = obj({
    generation: nullable(str),
    rows_checked: index,
    findings: list(
        obj({
            row: index,
            field: str,
            property: nullable(str),
            subject: str,
            value: findingValue,
            served: findingValue,
            code: str,
            severity: str,
        }),
    ),
});

/** Refuses a list of entries that names one dcid twice, naming the repeat. */
const onePerDcid = (entries: readonly { readonly dcid: string }[], path: string): void => {
    const seen = new Set<string>();
    for (const [at, { dcid }] of entries.entries()) {
        if (seen.has(dcid)) {
            throw new WireShapeError(`${path}[${at}].dcid: ${dcid} is listed twice`);
        }
        seen.add(dcid);
    }
};

// Each guard runs its checks, then narrows. The checks make the cast true.

/**
 * The schema document, or a WireShapeError naming the first member out of
 * shape or the first dcid listed twice.
 */
export const readSchema = (body: unknown): SchemaDocument => {
    schemaDocument(body, 'schema');
    const document = body as SchemaDocument;
    onePerDcid(document.nodes, 'schema.nodes');
    return document;
};

/**
 * The terms list, or a WireShapeError naming the first member out of shape
 * or the first dcid listed twice.
 */
export const readTerms = (body: unknown): SchemaTerms => {
    schemaTerms(body, 'terms');
    const document = body as SchemaTerms;
    onePerDcid(document.terms, 'terms.terms');
    return document;
};

/**
 * The usage document, or a WireShapeError naming the first member out of
 * shape or the first dcid listed twice.
 */
export const readUsage = (body: unknown): SchemaUsage => {
    schemaUsage(body, 'usage');
    const document = body as SchemaUsage;
    onePerDcid(document.provenances, 'usage.provenances');
    return document;
};

/** A check response, or a WireShapeError naming the first member out of shape. */
export const readCheckResponse = (body: unknown): SchemaCheckResponse => {
    schemaCheckResponse(body, 'check');
    return body as SchemaCheckResponse;
};
