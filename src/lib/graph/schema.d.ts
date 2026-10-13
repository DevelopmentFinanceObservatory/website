// Generated from src/lib/graph/graph-api-schema.json by `pnpm graph:types`.
// Do not edit by hand.

export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * HealthResponse
         * @description `GET /healthz`'s own response body, shared across every surface.
         */
        health_response: {
            /**
             * Build
             * @description the commit sha the image was built from, the same value the x-dfo-commit response header carries, "unknown" on a checkout run with no DFO_BUILD_COMMIT set
             */
            build: string;
            /**
             * Capability Version
             * @description this surface's own capability_version token
             */
            capability_version: string;
            /**
             * Status
             * @description always "ok" for a 200 response
             * @constant
             */
            status: 'ok';
        };
        /**
         * GraphAvailabilitySource
         * @description A source that holds the variable: its provenance, labelled with the catalogue's name.
         */
        AvailabilitySource: {
            /**
             * Documentation
             * @description the path of the provenance's source document
             */
            documentation: string;
            /** Label */
            label: string | null;
            /** Ref */
            ref: string;
        };
        /**
         * GraphCodeItem
         * @description A code in a `codes` or `children` list, with its code and its parent's dcid.
         */
        CodeItem: {
            /** Code */
            code: string;
            /** Label */
            label: string | null;
            /**
             * Parent
             * @description the parent code's dcid; null for a top-level code
             */
            parent: string | null;
            /** Ref */
            ref: string;
        };
        /**
         * GraphFacetItem
         * @description One facet of a variable, as the `facets` list relation serves it. `ref` is the facet id,
         *     which hashes the facet's metadata.
         */
        FacetItem: {
            /** First Year */
            first_year: string | null;
            /**
             * Label
             * @default null
             */
            label: null;
            /** Last Year */
            last_year: string | null;
            measurement_method: components['schemas']['NodeRef'] | null;
            /** Observation Period */
            observation_period: string | null;
            /** Observations */
            observations: number;
            /**
             * Places
             * @description null for a role-bearing variable
             */
            places: number | null;
            /** Ref */
            ref: string;
            /** Scaling */
            scaling: string | null;
            source: components['schemas']['AvailabilitySource'];
            unit: components['schemas']['NodeRef'] | null;
        };
        /**
         * GraphMemberItem
         * @description One item of a list: its dcid and the owner's label for it, `null` where the owner holds
         *     no name.
         */
        MemberItem: {
            /** Label */
            label: string | null;
            /** Ref */
            ref: string;
        };
        /**
         * GraphNodeRef
         * @description A graph reference. `label` is `null` when the target is not held, carries no `name`, or
         *     carries only a `name` equal to its own dcid.
         */
        NodeRef: {
            /** Label */
            label: string | null;
            /** Ref */
            ref: string;
        };
        /**
         * Projection
         * @description A named cut of a membership by member class.
         * @enum {string}
         */
        Projection: 'countries' | 'other_states' | 'territories' | 'former_states' | 'institutions';
        /**
         * GraphMembersPage
         * @description One page of `GET /api/graph/node/{dcid}/members`.
         */
        members_response: {
            /**
             * As Of
             * @description the date membership was read at; null for today
             */
            as_of: string | null;
            /**
             * Built From
             * @description the build of each table the list read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Complete
             * @description whether the walk reached the end of a list the owner holds in full
             */
            complete: boolean;
            /**
             * Gaps
             * @description the code of each way the list is partial
             */
            gaps: string[];
            /** Items */
            items: (
                | components['schemas']['CodeItem']
                | components['schemas']['FacetItem']
                | components['schemas']['MemberItem']
            )[];
            /**
             * Next Cursor
             * @description the cursor for the next page; null when this page ends the list
             */
            next_cursor: string | null;
            /** @description the membership projection listed; null for a relation that takes none */
            projection: components['schemas']['Projection'] | null;
            /**
             * Ref
             * @description the node whose list this is
             */
            ref: string;
            /**
             * Relation
             * @enum {string}
             */
            relation:
                | 'codes'
                | 'children'
                | 'datasets'
                | 'variables'
                | 'members'
                | 'countries'
                | 'facets';
            /**
             * Total
             * @description the list's length; null where the list is partial
             */
            total: number | null;
        };
        /** AggregateNode */
        AggregateNode: {
            aggregate: components['schemas']['PartyBlock'];
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'aggregate';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphMembershipAuthority
         * @description Where a membership's rows come from, with the data version that reproduces them.
         */
        Authority: {
            /** Name */
            name: string;
            /** Version */
            version: string;
        };
        /**
         * GraphAvailability
         * @description Where DFO holds observations of a variable. `sources: []` means it verifiably holds
         *     none.
         */
        Availability: {
            /** @description null when no facet dispatches a request naming nothing */
            default: components['schemas']['AvailabilityDefault'] | null;
            /**
             * More Sources
             * @description the sources past the first ten
             */
            more_sources: number;
            /**
             * Scope
             * @default dfo
             * @constant
             */
            scope: 'dfo';
            /** Sources */
            sources: components['schemas']['SourceAvailability'][];
            summary: components['schemas']['AvailabilitySummary'];
        };
        /**
         * GraphAvailabilityDefault
         * @description What a data request naming no place, years or facet receives.
         */
        AvailabilityDefault: {
            /**
             * Facets
             * @description the facet ids the request is served, in order
             */
            facets: string[];
            /** First Year */
            first_year: string | null;
            /** Last Year */
            last_year: string | null;
            measurement_method: components['schemas']['NodeRef'] | null;
            /** Observation Period */
            observation_period: string | null;
            /**
             * Places
             * @description null for a role-bearing variable
             */
            places: number | null;
            source: components['schemas']['AvailabilitySource'] | null;
            unit: components['schemas']['NodeRef'] | null;
            /**
             * Without Data
             * @description the places, or parties, holding the variable that the default leaves without data
             */
            without_data: number;
        };
        /**
         * GraphAvailabilitySummary
         * @description The variable across every source.
         */
        AvailabilitySummary: {
            /**
             * Entities
             * @description the entities covered per graph role; null for any other variable
             */
            entities: {
                [key: string]: components['schemas']['EntityCounts'];
            } | null;
            /** Facets */
            facets: number;
            /** First Year */
            first_year: string | null;
            /** Last Year */
            last_year: string | null;
            /**
             * Places
             * @description the places covered by kind; null for a role-bearing variable, and while the places' kinds are unread (a transient gap)
             */
            places: {
                [key: string]: number;
            } | null;
            /** Sources */
            sources: number;
        };
        /**
         * GraphAvailabilityBinding
         * @description The `scope.facets` values that request a series from Datasets, in its leading unit.
         */
        Binding: {
            /** Measurementmethod */
            measurementMethod: string | null;
            /** Provenance */
            provenance: string;
            /** Unit */
            unit: string | null;
        };
        /**
         * GraphCodeBlock
         * @description A code's detail block.
         */
        CodeBlock: {
            /** Code */
            code: string;
            /** @description the system's graph node, such as `CRSPurposeCodeEnum` */
            code_system: components['schemas']['NodeRef'] | null;
            /** @description the code it specialises; null for a root */
            parent: components['schemas']['NodeRef'] | null;
            /**
             * Property
             * @description the constraint property the code is a value of
             */
            property: string;
            /** Synonyms */
            synonyms: string[];
        };
        /** CodeNode */
        CodeNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            code: components['schemas']['CodeBlock'];
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'code';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphCodeSystemBlock
         * @description A code system's detail block.
         */
        CodeSystemBlock: {
            /**
             * Code Count
             * @description how many codes the code index holds for the system
             */
            code_count: number;
            declarations: components['schemas']['CodeSystemDeclarations'];
            /**
             * Plain Name
             * @description the property's plain name, such as `sector`
             */
            plain_name: string;
            /**
             * Property
             * @description the constraint property the system governs
             */
            property: string;
        };
        /**
         * GraphCodeSystemDeclarations
         * @description The rules a code system declares (`code_index.types.CodeSystemDeclaration`).
         */
        CodeSystemDeclarations: {
            /**
             * Absent Reading
             * @description how a variable that does not declare the property reads
             * @enum {string}
             */
            absent_reading: 'not_declared' | 'aggregate';
            /**
             * Disjoint From Children
             * @description whether a parent code's records sit apart from its children's, so a parent's total is its own records plus its descendants' (CRS purposes); false where a parent row already totals its children (DAC1 aid types)
             */
            disjoint_from_children: boolean;
            /**
             * Hierarchical
             * @description whether its codes nest through specializationOf
             */
            hierarchical: boolean;
            /**
             * Summable
             * @description whether sibling values can rebuild a parent total
             */
            summable: boolean;
        };
        /** CodeSystemNode */
        CodeSystemNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            code_system: components['schemas']['CodeSystemBlock'];
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'code_system';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphDefinitionConstraint
         * @description One constraint: the property and the value the variable fixes it at.
         */
        Constraint: {
            property: components['schemas']['NodeRef'];
            value: components['schemas']['NodeRef'];
        };
        /** ContinentNode */
        ContinentNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            continent: components['schemas']['PlaceBlock'];
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'continent';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /** ContinentalUnionNode */
        ContinentalUnionNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            continental_union: components['schemas']['PlaceBlock'];
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'continental_union';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /** CountryNode */
        CountryNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            country: components['schemas']['PlaceBlock'];
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'country';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphDataCommonsRef
         * @description The Data Commons that serves a fact. `id` is the wire enum; `label` its display name.
         */
        DataCommonsRef: {
            /**
             * Id
             * @enum {string}
             */
            id: 'dfo' | 'base' | 'un_system';
            /** Label */
            label: string;
        };
        /** DatasetNode */
        DatasetNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            dataset: components['schemas']['SourceBlock'];
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'dataset';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphDefinitionText
         * @description The graph's prose for one part of a definition.
         */
        DefinitionText: {
            /** @description the part the text defines */
            of: components['schemas']['NodeRef'];
            /** Text */
            text: string;
        };
        /**
         * GraphAvailabilityEntityCounts
         * @description The distinct entities in one role, split by their kind in the code index.
         */
        EntityCounts: {
            /**
             * Parties
             * @description entities with figures of their own
             */
            parties: number;
            /**
             * Residual
             * @description entities holding figures no other entity does
             */
            residual: number;
            /**
             * Totals
             * @description entities that hold other entities' figures
             */
            totals: number;
            /**
             * Unclassified
             * @description entities the code index does not list
             */
            unclassified: number;
        };
        /**
         * Freshness
         * @description A source's own refresh cadence, read from DCP provenance arcs that imports populate
         *     unevenly: `dc/base/WHO_COVID19` carries both `sourceReleaseFrequency` and
         *     `automaticRefreshType`, `dc/base/BIS_CentralBankPolicyRate` only the second, and
         *     `dc/base/WHO_GHO` neither. Nullability is the contract.
         *
         *     `release_frequency` is the raw `sourceReleaseFrequency` ISO 8601 duration (`P1M`);
         *     `release_frequency_label` is `materialise.cadence.cadence_label`'s display label for it
         *     (`Monthly`), or the raw token when that module does not recognise it.
         *
         *     `refresh_type` is `automaticRefreshType`'s value: how this deployment refreshes the
         *     source, such as `GCPCloudRunAutomaticRefresh`, or the sentinel `NoAutomaticRefresh`.
         */
        Freshness: {
            /** Refresh Type */
            refresh_type: string | null;
            /** Release Frequency */
            release_frequency: string | null;
            /** Release Frequency Label */
            release_frequency_label: string | null;
        };
        /** GroupNode */
        GroupNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            group: components['schemas']['MembershipBlock'];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'group';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphDefinitionMeasure
         * @description What the variable counts or sums, as the code index names it.
         */
        Measure: {
            /**
             * Label
             * @description the measure's noun phrase, such as `net disbursements`
             */
            label: string;
        };
        /**
         * GraphMembershipBlock
         * @description A group's or region's membership under its declared authority.
         */
        MembershipBlock: {
            /**
             * As Of
             * @description the date the read asked for; null for today
             */
            as_of: string | null;
            authority: components['schemas']['Authority'];
            /**
             * Effective Date
             * @description the latest membership change on or before the date; null for an undated membership
             */
            effective_date: string | null;
            /** Projections */
            projections: components['schemas']['ProjectionCount'][];
        };
        /**
         * GraphAvailabilityNationalCurrency
         * @description The units that are each covered place's own currency.
         */
        NationalCurrency: {
            /** Currencies */
            currencies: number;
            /** Places */
            places: number;
        };
        /** OrganisationNode */
        OrganisationNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'organisation';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            organisation: components['schemas']['PartyBlock'];
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * OtherNode
         * @description A node no other kind fits. `types` and `description` carry what the graph holds.
         */
        OtherNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'other';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphPartyBlock
         * @description An organisation's or aggregate's detail block.
         */
        PartyBlock: {
            /**
             * Roles
             * @description the role properties a node of these types can fill, by the role ranges the graph declares (rangeIncludes and its subClassOf closure); null when that read failed
             */
            roles: string[] | null;
        };
        /**
         * GraphPlaceBlock
         * @description A place's detail block. `membership` is set for a region the membership policy holds.
         */
        PlaceBlock: {
            /**
             * Contained In
             * @description the containedInPlace targets
             */
            contained_in: components['schemas']['NodeRef'][];
            membership: components['schemas']['MembershipBlock'] | null;
        };
        /** PlaceOtherNode */
        PlaceOtherNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'place_other';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            place_other: components['schemas']['PlaceBlock'];
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphPriceBasis
         * @description Current or constant prices, with the base year of constant prices when known.
         */
        PriceBasisWords: {
            /** Base Year */
            base_year: number | null;
            /**
             * Prices
             * @enum {string}
             */
            prices: 'current' | 'constant';
        };
        /**
         * GraphProjectionCount
         * @description One projection of a membership and its member count at the block's date.
         */
        ProjectionCount: {
            /**
             * Complete
             * @description false when the authority does not record the projection, or is known to hold it only in part (`membership_incomplete`)
             */
            complete: boolean;
            /**
             * Count
             * @description members under the projection; null when the authority does not record it
             */
            count: number | null;
            projection: components['schemas']['Projection'];
        };
        /** ProvenanceNode */
        ProvenanceNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'provenance';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            provenance: components['schemas']['SourceBlock'];
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphAvailabilitySeries
         * @description A source's facets sharing a measurement method, period and scaling.
         */
        Series: {
            binding: components['schemas']['Binding'];
            /** First Year */
            first_year: string | null;
            /** Last Year */
            last_year: string | null;
            /** @description null when no facet states a method: no stated method */
            measurement_method: components['schemas']['NodeRef'] | null;
            /** Observation Period */
            observation_period: string | null;
            /** Observations */
            observations: number;
            /**
             * Places
             * @description null for a role-bearing variable
             */
            places: number | null;
            /** Scaling */
            scaling: string | null;
            units: components['schemas']['UnitsFold'];
        };
        /**
         * GraphAvailabilitySourceEntry
         * @description One source's facets of the variable, and their series.
         */
        SourceAvailability: {
            /**
             * Entities
             * @description the entities covered per graph role; null for any other variable
             */
            entities: {
                [key: string]: components['schemas']['EntityCounts'];
            } | null;
            /** Facets */
            facets: number;
            /** First Year */
            first_year: string | null;
            /** Last Year */
            last_year: string | null;
            /**
             * Places
             * @description the places covered by kind; null for a role-bearing variable, and while the places' kinds are unread (a transient gap)
             */
            places: {
                [key: string]: number;
            } | null;
            /** Series */
            series: components['schemas']['Series'][];
            source: components['schemas']['AvailabilitySource'];
        };
        /**
         * GraphSourceBlock
         * @description A Source, Dataset or Provenance's detail block. `documentation` is the path of the
         *     node's source document on this API.
         */
        SourceBlock: {
            /** @description the Data Commons serving this provenance, from the origin catalogue; null for a provenance the catalogue does not admit, a Dataset, or a Source */
            data_commons: components['schemas']['DataCommonsRef'] | null;
            /**
             * Description Url
             * @description the descriptionUrl arc's value
             */
            description_url: string | null;
            /**
             * Documentation
             * @description the path of the node's source document
             */
            documentation: string;
            /**
             * Earliest Observation Date
             * @description the earliestObservationDate arc's value
             */
            earliest_observation_date: string | null;
            freshness: components['schemas']['Freshness'];
            /**
             * Last Data Refresh Date
             * @description the lastDataRefreshDate arc's value
             */
            last_data_refresh_date: string | null;
            /**
             * Latest Observation Date
             * @description the latestObservationDate arc's value
             */
            latest_observation_date: string | null;
            /** License */
            license: string | null;
            /** License Type */
            license_type: string | null;
            /**
             * Next Data Refresh Date
             * @description the nextDataRefreshDate arc's value
             */
            next_data_refresh_date: string | null;
            /** @description the isPartOf arc's target; null when the node has no parent Dataset */
            parent: components['schemas']['NodeRef'] | null;
            /** @description the source arc's target; null when the node carries no source arc */
            publisher: components['schemas']['NodeRef'] | null;
            /**
             * Source Data Url
             * @description the sourceDataUrl arc's value
             */
            source_data_url: string | null;
            /**
             * Transformation Logic Url
             * @description the dataTransformationLogic arc's value: a URL to the transformation code
             */
            transformation_logic_url: string | null;
            /** Url */
            url: string | null;
        };
        /** SourceNode */
        SourceNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'source';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            source: components['schemas']['SourceBlock'];
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphStatVarBlock
         * @description A variable's detail block: what it measures and where DFO holds observations of it.
         */
        StatVarBlock: {
            /** @description where DFO holds observations of the variable; null, and named in gaps, when its read failed or the coverage index is not loaded */
            availability: components['schemas']['Availability'] | null;
            definition: components['schemas']['VariableDefinition'];
        };
        /** StatVarNode */
        StatVarNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'stat_var';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            stat_var: components['schemas']['StatVarBlock'];
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /** SubregionNode */
        SubregionNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'subregion';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            subregion: components['schemas']['PlaceBlock'];
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
        };
        /**
         * GraphUnitBlock
         * @description A unit's detail block: the words `unit_words` names it by.
         */
        UnitBlock: {
            /**
             * Changes Magnitude
             * @description whether the unit changes what a number means, so a heading states it
             */
            changes_magnitude: boolean;
            /**
             * Currency
             * @description its ISO 4217 code when it is a currency
             */
            currency: string | null;
            /**
             * Currency Noun
             * @description the plural noun a currency reads as, such as `US dollars`
             */
            currency_noun: string | null;
            /** @description the price basis the unit itself states; null when it states none */
            price_basis: components['schemas']['PriceBasisWords'] | null;
            /** @description currency, purchasing_power, percent, or other (`unit_words.unit_class`) */
            unit_class: components['schemas']['UnitKind'];
        };
        /**
         * GraphAvailabilityUnit
         * @description One unit of a series. `ref` is `null` for facets that state no unit.
         */
        UnitCount: {
            /** Label */
            label: string | null;
            /**
             * Places
             * @description the places its facets cover; null for a role-bearing variable
             */
            places: number | null;
            /** Ref */
            ref: string | null;
        };
        /** @enum {string} */
        UnitKind: 'currency' | 'purchasing_power' | 'percent' | 'other' | 'none';
        /** UnitNode */
        UnitNode: {
            /**
             * Built From
             * @description the build of each table the response read
             */
            built_from: {
                [key: string]: string;
            };
            /**
             * Description
             * @description the node's prose in the graph; null when it has none
             */
            description: string | null;
            /**
             * Gaps
             * @description the member path of every value this door cannot know
             */
            gaps: string[];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: 'unit';
            /**
             * Label
             * @description the node's name; for a Provenance, its parent Dataset's name where it has one. Null, and named in gaps, when the graph gives none
             */
            label: string | null;
            /**
             * Links
             * @description each list relation the node has, mapped to its route; empty when none
             */
            links: {
                [key: string]: string;
            };
            /**
             * Ref
             * @description the node's dcid
             */
            ref: string;
            /**
             * Types
             * @description the node's typeOf values, as the graph holds them
             */
            types: string[];
            unit: components['schemas']['UnitBlock'];
        };
        /**
         * GraphAvailabilityUnits
         * @description A series' units: how many, the two covering the most places, and how many more.
         */
        UnitsFold: {
            /** Count */
            count: number;
            /** Leading */
            leading: components['schemas']['UnitCount'][];
            /** More */
            more: number;
            /** @description the units that are their places' national currency; null when none is */
            national_currency: components['schemas']['NationalCurrency'] | null;
        };
        /**
         * GraphVariableDefinition
         * @description What a variable measures, part by part.
         *
         *     `constraints` are ordered by property dcid: the code index holds a variable's constraints
         *     as a mapping with no declared order, and the graph's `constraintProperties` arc has none.
         */
        VariableDefinition: {
            /**
             * Constraints
             * @description each constraint the measure does not state, ordered by property dcid; null when the read of a variable's constraint values failed
             */
            constraints: components['schemas']['Constraint'][] | null;
            /**
             * Definitions
             * @description the graph's prose per part: the variable's own, then the measure's, then each constraint value's, in constraint order; a part with none is left out
             */
            definitions: components['schemas']['DefinitionText'][];
            /** @description the measure the code index names; null when it names none */
            measure: components['schemas']['Measure'] | null;
            /** @description the measuredProperty; null when the variable declares none */
            measured_property: components['schemas']['NodeRef'] | null;
            /** @description the populationType; null when the variable declares none */
            population_type: components['schemas']['NodeRef'] | null;
            /**
             * Roles
             * @description the entity roles the variable's observations carry, from its declared observationProperties, defaulting to observationAbout when it declares none
             */
            roles: string[];
            /**
             * Source Indicator Codes
             * @description the sourceIndicatorCode arc's values: the codes naming the source series, as the publisher codes it (IMF WEO GDP carries NGDP and NGDPD); empty when it has none
             */
            source_indicator_codes: string[];
            /** @description the statType; null when the variable declares none or its read failed */
            stat_type: components['schemas']['NodeRef'] | null;
        };
        node_response:
            | components['schemas']['StatVarNode']
            | components['schemas']['CodeSystemNode']
            | components['schemas']['CodeNode']
            | components['schemas']['GroupNode']
            | components['schemas']['CountryNode']
            | components['schemas']['ContinentNode']
            | components['schemas']['SubregionNode']
            | components['schemas']['ContinentalUnionNode']
            | components['schemas']['PlaceOtherNode']
            | components['schemas']['OrganisationNode']
            | components['schemas']['AggregateNode']
            | components['schemas']['UnitNode']
            | components['schemas']['SourceNode']
            | components['schemas']['DatasetNode']
            | components['schemas']['ProvenanceNode']
            | components['schemas']['OtherNode'];
        /**
         * GraphNodesRequest
         * @description `dcids`: 1 to `NODES_MAX_DCIDS` node dcids read as one batch, in one DCP-read
         *     executor job. Each dcid matches the GET route's `{dcid}` path syntax and its 512-character
         *     ceiling.
         */
        nodes_request: {
            /** Dcids */
            dcids: string[];
        };
        /**
         * GraphNotHeldEntry
         * @description A batch entry for a dcid where `GET /api/graph/node/{dcid}` answers 404
         *     `node_not_held`.
         */
        NotHeldEntry: {
            /** Ref */
            ref: string;
            /**
             * Status
             * @default not_held
             * @constant
             */
            status: 'not_held';
        };
        /**
         * NodesResponse
         * @description `nodes` is index-aligned with the request's `dcids`: a repeated dcid repeats its
         *     entry. Each entry is the body `GET /api/graph/node/{dcid}` returns for that dcid, or a
         *     `not_held` entry where that route answers 404.
         */
        nodes_response: {
            /** Nodes */
            nodes: (
                | (
                      | components['schemas']['StatVarNode']
                      | components['schemas']['CodeSystemNode']
                      | components['schemas']['CodeNode']
                      | components['schemas']['GroupNode']
                      | components['schemas']['CountryNode']
                      | components['schemas']['ContinentNode']
                      | components['schemas']['SubregionNode']
                      | components['schemas']['ContinentalUnionNode']
                      | components['schemas']['PlaceOtherNode']
                      | components['schemas']['OrganisationNode']
                      | components['schemas']['AggregateNode']
                      | components['schemas']['UnitNode']
                      | components['schemas']['SourceNode']
                      | components['schemas']['DatasetNode']
                      | components['schemas']['ProvenanceNode']
                      | components['schemas']['OtherNode']
                  )
                | components['schemas']['NotHeldEntry']
            )[];
        };
        /**
         * GraphResolveRequest
         * @description `texts`: 1 to 25 strings resolved as one batch. Each is stripped of surrounding
         *     whitespace and must then be 1 to 200 characters.
         *
         *     `kinds` admits only candidates of those kinds. It defaults to `DEFAULT_RESOLVE_KINDS`, so a
         *     request that omits it equals one naming those eight. `code` searches the code index's labels
         *     and synonyms, and `code_system` narrows codes to one system's graph id
         *     (`CRSPurposeCodeEnum`); naming `code_system` without `code` in `kinds` is refused at
         *     `/code_system`. `expand: ["members"]` inlines a group's or region's members.
         */
        resolve_request: {
            /**
             * Code System
             * @default null
             */
            code_system: string | null;
            /**
             * Expand
             * @default []
             */
            expand: 'members'[];
            /**
             * Kinds
             * @default [
             *       "country",
             *       "continent",
             *       "subregion",
             *       "continental_union",
             *       "organisation",
             *       "aggregate",
             *       "place_other",
             *       "group"
             *     ]
             */
            kinds: (
                | 'country'
                | 'continent'
                | 'subregion'
                | 'continental_union'
                | 'organisation'
                | 'aggregate'
                | 'place_other'
                | 'group'
                | 'code'
                | 'other'
            )[];
            /** Texts */
            texts: string[];
        };
        /**
         * GraphResolveEntity
         * @description A reference with its kind. `kind` is `null` only for a `not_held` entity, which the
         *     graph holds no node to classify.
         */
        EntityRef: {
            /** Kind */
            kind:
                | (
                      | 'country'
                      | 'continent'
                      | 'subregion'
                      | 'continental_union'
                      | 'place_other'
                      | 'aggregate'
                      | 'organisation'
                      | 'group'
                      | 'stat_var'
                      | 'code_system'
                      | 'code'
                      | 'unit'
                      | 'source'
                      | 'dataset'
                      | 'provenance'
                      | 'other'
                  )
                | null;
            /** Label */
            label: string;
            /** Ref */
            ref: string;
        };
        /**
         * GraphResolveMatched
         * @description The listed text the input matched, and whether it is the entity's name, an alias, or a
         *     code. A phrase naming a group's members ("EU countries") matches as `alias`.
         */
        Matched: {
            /**
             * As
             * @enum {string}
             */
            as: 'name' | 'alias' | 'code';
            /** Text */
            text: string;
        };
        /**
         * GraphResolveResult
         * @description One text's outcome. `input` echoes the text; fields a status does not use are `null`.
         *
         *     - `resolved`: `entity`, `matched` and `reading`. A group or region adds `projection`,
         *       `member_count` and `members`: the list route's link, or the members inline (at most
         *       256) when the request expanded them. The three are `null` for a region the membership
         *       policy does not hold.
         *     - `ambiguous`: `candidates`, in the resolver's order.
         *     - `not_found`: `near_matches`, hints for a person; a program should pick none by id.
         *     - `not_held`: `entity`, the id the resolver named, which does not open on the node route.
         *
         *     `reading` is `members` when the text names a group's members ("EU countries"), else
         *     `entity`.
         */
        ResolveResult: {
            /**
             * Candidates
             * @default null
             */
            candidates: components['schemas']['EntityRef'][] | null;
            /** @default null */
            entity: components['schemas']['EntityRef'] | null;
            /** Input */
            input: string;
            /** @default null */
            matched: components['schemas']['Matched'] | null;
            /**
             * Member Count
             * @default null
             */
            member_count: number | null;
            /**
             * Members
             * @default null
             */
            members: string | components['schemas']['NodeRef'][] | null;
            /**
             * Near Matches
             * @default null
             */
            near_matches: components['schemas']['EntityRef'][] | null;
            /** @default null */
            projection: components['schemas']['Projection'] | null;
            /**
             * Reading
             * @default null
             */
            reading: ('members' | 'entity') | null;
            /**
             * Status
             * @enum {string}
             */
            status: 'resolved' | 'ambiguous' | 'not_found' | 'not_held';
        };
        /**
         * GraphResolveResponse
         * @description `results` is index-aligned with the request's `texts`.
         */
        resolve_response: {
            /** Results */
            results: components['schemas']['ResolveResult'][];
        };
        /**
         * GraphRootEntry
         * @description A place to start listing from, with the length of its list.
         */
        RootEntry: {
            /**
             * Count
             * @description codes for a code system, members under the default projection for a group or region, Datasets for a source
             */
            count: number;
            /** Label */
            label: string | null;
            /** Ref */
            ref: string;
        };
        /**
         * GraphRoots
         * @description `GET /api/graph/roots`: where to start listing. Each list is ordered by dcid.
         */
        roots_response: {
            /**
             * Built From
             * @description the build of each table the document read
             */
            built_from: {
                [key: string]: string;
            };
            /** Code Systems */
            code_systems: components['schemas']['RootEntry'][];
            /** Groups */
            groups: components['schemas']['RootEntry'][];
            /** Regions */
            regions: components['schemas']['RootEntry'][];
            /** Sources */
            sources: components['schemas']['RootEntry'][];
        };
        /**
         * DatasetEntry
         * @description A Dataset and the admitted provenances that belong to it. A provenance with
         *     no Dataset forms its own entry, keyed by the provenance, so `ref` and `label`
         *     are the provenance's and `provenances` holds that one provenance.
         *
         *     The card facts (`description`, `license_type`, `update_cadence`,
         *     `years_covered`, `source_url`) equal the same members of
         *     `GET /api/graph/documentation/{ref}` for the graph the loaded catalogue
         *     build read. They are null on UN System Data Commons entries.
         */
        DatasetEntry: {
            /**
             * Description
             * @description its sole Provenance's description, as `details.description`; null when it has several
             */
            description: string | null;
            /** Label */
            label: string;
            /**
             * License Type
             * @description licence label every Provenance agrees on, as `license.type`; null when they disagree or one has none
             */
            license_type: string | null;
            /** Provenances */
            provenances: components['schemas']['ProvenanceEntry'][];
            /** Ref */
            ref: string;
            /**
             * Source Url
             * @description the publication's page, as `details.source_url`: the Dataset's url, else its sole Provenance's
             */
            source_url: string | null;
            /**
             * Update Cadence
             * @description release cadence label every Provenance agrees on, as `license.update_cadence`; null when they disagree or one has none
             */
            update_cadence: string | null;
            /**
             * Years Covered
             * @description `YYYY` or `YYYY-YYYY` span of its Provenances' observation dates, as `scope_and_units.years_covered`; null when either end is unknown
             */
            years_covered: string | null;
        };
        /**
         * Exclusion
         * @description A provenance a base source holds that this deployment does not admit, because
         *     another Data Commons supersedes it.
         */
        Exclusion: {
            /**
             * Reason
             * @description superseded_by_dfo: an upstream copy of a dataset DFO imports. superseded_by_un_system: a UN System Data Commons agency's series replace it
             * @enum {string}
             */
            reason: 'superseded_by_dfo' | 'superseded_by_un_system';
            /** Ref */
            ref: string;
        };
        /**
         * ProvenanceEntry
         * @description One admitted provenance: its dcid and the provenance table's name for it.
         */
        ProvenanceEntry: {
            /** Label */
            label: string;
            /** Ref */
            ref: string;
        };
        /**
         * SourceCatalogueEntry
         * @description One source on one Data Commons, with the datasets this deployment
         *     admits under it and the provenances it excludes. DFO provenances and UN
         *     agencies exclude nothing here.
         */
        SourceCatalogueEntry: {
            data_commons: components['schemas']['DataCommonsRef'];
            /** Datasets */
            datasets: components['schemas']['DatasetEntry'][];
            /** Exclusions */
            exclusions: components['schemas']['Exclusion'][];
            source: components['schemas']['SourceNodeRef'];
        };
        /**
         * GraphSourceNodeRef
         * @description A Data Commons `Source` node (`dc/s/*`). On the UN System Data Commons, where every
         *     agency sits under one source, it is the agency provenance (`undata/p/*`).
         */
        SourceNodeRef: {
            /** Label */
            label: string;
            /** Ref */
            ref: string;
        };
        /**
         * SourceCatalogue
         * @description The full `GET /api/graph/sources` response: DFO's sources, then the
         *     origin registry's base Data Commons entries and UN System Data Commons
         *     agencies in registry order, each with the provenances the request's
         *     origin catalogue admits under it, grouped by Dataset. UN agencies are left
         *     out when the UN origin is off. The response has no count and no pagination.
         */
        source_catalogue_response: {
            /** Sources */
            sources: components['schemas']['SourceCatalogueEntry'][];
        };
        /**
         * ChangeEntry
         * @description One change in a release.
         */
        ChangeEntry: {
            /**
             * Kind
             * @description the Keep a Changelog group the change sits under
             * @enum {string}
             */
            kind: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security';
            /**
             * Note
             * @description the change, as CommonMark
             */
            note: string;
        };
        /**
         * DocumentErrorEntry
         * @description A Markdown document the source carries that this door could not serve.
         *     The member it fills is empty and named in `gaps`.
         */
        DocumentErrorEntry: {
            /**
             * Line
             * @description 1-based line in the decoded document where the problem starts, or null
             */
            line: number | null;
            /**
             * Member
             * @description the wire path the document fills
             * @enum {string}
             */
            member:
                'transformation_log' | 'version_history' | 'methodology.description' | 'data_notes';
            /**
             * Reason
             * @description the template rule the document breaks
             * @enum {string}
             */
            reason:
                | 'undecodable'
                | 'empty_document'
                | 'content_outside_section'
                | 'unexpected_heading_level'
                | 'heading_not_plain_text'
                | 'empty_heading'
                | 'empty_section'
                | 'disallowed_block'
                | 'raw_html'
                | 'hard_break'
                | 'invalid_release_heading'
                | 'missing_release_title'
                | 'release_dates_not_descending'
                | 'duplicate_release_date'
                | 'unknown_change_kind'
                | 'duplicate_change_kind'
                | 'not_single_bullet_list'
                | 'list_item_not_single_paragraph'
                | 'document_too_large'
                | 'nesting_too_deep'
                | 'conflicting_values';
        };
        /** Methodology */
        Methodology: {
            /**
             * Description
             * @description how the publisher collects and compiles the data, as CommonMark
             * @default null
             */
            description: string | null;
        };
        /**
         * ScopeAndUnits
         * @description `countries` is always `[]`. `years_covered` is filled where the graph
         *     has it. `currencies` lists every currency unit the coverage index gives the
         *     source's Provenances, sorted, and `granularity` is filled where it gives
         *     one period and axis pair for the source.
         */
        ScopeAndUnits: {
            /** Countries */
            countries: string[];
            /** Currencies */
            currencies: string[];
            /**
             * Granularity
             * @default null
             */
            granularity: string | null;
            /**
             * Years Covered
             * @default null
             */
            years_covered: string | null;
        };
        /** SourceDetails */
        SourceDetails: {
            /**
             * Citation
             * @description the source's `licenseAttribution` text
             */
            citation: string | null;
            /** @description the Data Commons serving the documented Provenances, null unless the origin catalogue admits every one of them and they share one */
            data_commons: components['schemas']['DataCommonsRef'] | null;
            /** Description */
            description: string | null;
            /** Name Of Source */
            name_of_source: string | null;
            /** Publisher */
            publisher: string | null;
            /** @description the origin registry's source for the documented Provenances, null unless the origin catalogue admits every one of them and they share one */
            source: components['schemas']['SourceNodeRef'] | null;
            /**
             * Source Data Url
             * @description the file the pipeline downloads, the source's `sourceDataUrl`
             */
            source_data_url: string | null;
            /** Source Url */
            source_url: string | null;
        };
        /** SourceLicense */
        SourceLicense: {
            /** Last Update */
            last_update: string | null;
            /** Next Expected Update */
            next_expected_update: string | null;
            /** Type */
            type: string | null;
            /** Update Cadence */
            update_cadence: string | null;
            /**
             * Url
             * @description the licence text on the publisher's site, the source's `license`
             */
            url: string | null;
        };
        /**
         * TransformationLogEntry
         * @description One step of the pipeline's transformations, in pipeline order.
         */
        TransformationLogEntry: {
            /**
             * Description
             * @description what the step does, as CommonMark
             */
            description: string;
            /**
             * Transformation
             * @description the step title, plain text
             */
            transformation: string;
        };
        /**
         * Usage
         * @description `api_access`/`python` are `None` for every source -- an absent
         *     member, not a stand-in object -- named in `gaps` alongside
         *     every other absent member. Built by `graph_api.usage.usage_document`,
         *     never constructed inline at a call site.
         */
        Usage: {
            /** @default null */
            api_access: components['schemas']['UsageEntry'] | null;
            /** @default null */
            python: components['schemas']['UsageEntry'] | null;
        };
        /**
         * UsageEntry
         * @description The shape a non-null `Usage.api_access`/`.python` entry takes. Both
         *     of its own members are always `None`, and no dcid produces an entry at
         *     all -- `graph_api.usage`'s own docstring is the record of why.
         */
        UsageEntry: {
            /**
             * Code
             * @default null
             */
            code: string | null;
            /**
             * Documentation Url
             * @default null
             */
            documentation_url: string | null;
        };
        /**
         * VersionHistoryEntry
         * @description One release of the pipeline's changelog, newest first.
         */
        VersionHistoryEntry: {
            /**
             * Changes
             * @description every change, group by group in order
             */
            changes: components['schemas']['ChangeEntry'][];
            /**
             * Date
             * @description the release date, YYYY-MM-DD
             */
            date: string;
            /**
             * Title
             * @description the release title, plain text
             */
            title: string;
        };
        /**
         * SourceDocumentation
         * @description The full `GET /api/graph/documentation/{dcid}` response.
         */
        source_documentation_response: {
            /**
             * Data Notes
             * @description one caveat per entry, as CommonMark
             */
            data_notes: string[];
            details: components['schemas']['SourceDetails'];
            /**
             * Document Errors
             * @description each Markdown document the source carries but this door could not serve
             */
            document_errors: components['schemas']['DocumentErrorEntry'][];
            /**
             * Gaps
             * @description every member path that is null or empty for this source, in spec order, e.g. 'details.citation', 'scope_and_units.countries'
             */
            gaps: string[];
            license: components['schemas']['SourceLicense'];
            methodology: components['schemas']['Methodology'];
            scope_and_units: components['schemas']['ScopeAndUnits'];
            /** Transformation Log */
            transformation_log: components['schemas']['TransformationLogEntry'][];
            usage: components['schemas']['Usage'];
            /** Version History */
            version_history: components['schemas']['VersionHistoryEntry'][];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
