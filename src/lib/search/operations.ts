/** The label of the button that hands a part's operations to Studio. */

import type { OperationVerb } from './types.ts';

const BUTTON_LABELS: Record<OperationVerb, string> = {
    rank: 'Rank in Studio',
    aggregate: 'Add up in Studio',
    growth: 'Work out the change in Studio',
    share_of: 'Work out the share in Studio',
    explain: 'Ask Studio why',
    forecast: 'Ask Studio for a forecast',
    report: 'Ask Studio for a report',
};

/** The Studio button, named for the verb of the operation it hands over. */
export function operationButtonLabel(verb: OperationVerb): string {
    return BUTTON_LABELS[verb];
}
