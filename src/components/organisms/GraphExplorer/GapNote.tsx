import type { ListGap } from '@/lib/graphExplorer/nodeView';

/** What each gap means for the list beside it. */
const GAP_TEXT: Readonly<Record<ListGap, string>> = {
    capped: 'Cut short. The graph holds more links than one view reads.',
    descendants:
        'Counts over narrower kinds leave some out. The graph holds more of them than one view reads.',
    unresolved: 'Its links on the graph are not loaded, so this list may leave some out.',
};

/** The line beside a list drawn from a centre's model that may hold less than the graph. */
export const GapNote = ({ gaps, className }: { gaps: readonly ListGap[]; className?: string }) =>
    gaps.length === 0 ? null : (
        <p className={className} role="status">
            {gaps.map((gap) => GAP_TEXT[gap]).join(' ')}
        </p>
    );
