/**
 * The cards an answer produced, as the chat lists them under it: each card's
 * title and whether it is still on the canvas.
 */
export type TurnCardRow = { id: string; title: string; added: boolean };

/** The collapsed row's label: "6 cards", or "6 cards, 2 removed" once some
 *  are off the canvas. */
export const cardsSummary = (rows: TurnCardRow[]): string => {
    const removed = rows.filter((row) => !row.added).length;
    const count = `${rows.length} card${rows.length === 1 ? '' : 's'}`;

    return removed > 0 ? `${count}, ${removed} removed` : count;
};

/** What "Remove all" takes off the canvas: the cards still on it. */
export const removableIds = (rows: TurnCardRow[]): string[] =>
    rows.filter((row) => row.added).map((row) => row.id);
