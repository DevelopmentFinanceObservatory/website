import type { DataCommonsRef } from '../search/types.ts';

/** The fields of a source card the Sources page's filters read
 *  (lib/sources/search.ts). */
export type Filterable = {
    title: string;
    /** the publisher's dcid */
    family: string;
    publisher: string | null;
    dataCommons: DataCommonsRef;
};
