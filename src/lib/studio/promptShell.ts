/**
 * The Prompt layout's shell state: whether the session panel shows, focus
 * mode, the panel's page trail, the card the pointer rests on, and the
 * reader's choice for the reply sheet. Pure, so the rules run under
 * `node --test`.
 */

/** A page of the session panel. The overview is the empty trail. */
export type PanelPage =
    | { kind: 'turn'; turn: number }
    | { kind: 'stage'; turn: number }
    | { kind: 'plan'; turn: number }
    | { kind: 'card'; id: string }
    | { kind: 'source'; id: string };

/** The reply sheet: `auto` follows the reply, the others are the reader's choice. */
export type Sheet = 'auto' | 'open' | 'folded' | 'thread';

export type ShellState = {
    /** The reader's own panel choice, null until they make one. */
    panelChoice: boolean | null;
    focus: boolean;
    /** Panel pages, the one shown last. */
    trail: PanelPage[];
    pointedCard: string | null;
    /** The page turn of the plan whose cards the panel lights on the canvas
     *  (a plan line under the pointer or focus), null for none. */
    litPlan: number | null;
    sheet: Sheet;
    /** The question turn `sheet` was chosen for; a choice holds only on its
     *  own turn. */
    sheetTurn: number | null;
};

export type ShellAction =
    /** The `Session panel` button; `shown` is whether the panel shows now. */
    | { type: 'panel.toggle'; shown: boolean }
    /** Closes the panel that overlays the canvas without recording a choice,
     *  so a wider window opens it by the card rule again. */
    | { type: 'panel.dismiss' }
    /** Pushes a page, opens the panel and leaves focus mode. */
    | { type: 'panel.show'; page: PanelPage }
    /** Swaps the page on top (a card replaced by a new id). */
    | { type: 'panel.replace'; page: PanelPage }
    | { type: 'panel.back' }
    | { type: 'panel.home' }
    | { type: 'focus.set'; on: boolean }
    | { type: 'point'; card: string | null }
    | { type: 'plan.light'; turn: number | null }
    /** The reader's sheet choice for the question at `turn`. */
    | { type: 'sheet.set'; sheet: Sheet; turn?: number }
    /** A new question: the sheet follows the reply again. An open panel
     *  page stays. */
    | { type: 'question.sent' }
    | { type: 'session.reset' };

export const initialShell: ShellState = {
    panelChoice: null,
    focus: false,
    trail: [],
    pointedCard: null,
    litPlan: null,
    sheet: 'auto',
    sheetTurn: null,
};

/** Escape handler orders: the shell calls the highest registered order first. */
export const ESCAPE_PICKER = 40;
export const ESCAPE_CARD_PAGE = 30;
export const ESCAPE_PANEL_PAGE = 20;
export const ESCAPE_DOCK_SHEET = 10;
/** Below PANEL_OVERLAY_BELOW: closes the panel that overlays the canvas. */
export const ESCAPE_OVERLAY_PANEL = 5;

/** The panel's width and the gutter around the regions, in CSS px. */
export const PANEL_WIDTH = 280;
export const SHELL_GUTTER = 10;

/** Below this window width the panel overlays the canvas instead of narrowing it. */
export const PANEL_OVERLAY_BELOW = 1100;

export const samePage = (a: PanelPage, b: PanelPage): boolean => {
    if (a.kind !== b.kind) return false;

    return 'id' in a ? 'id' in b && a.id === b.id : 'turn' in b && a.turn === b.turn;
};

export const shellReducer = (state: ShellState, action: ShellAction): ShellState => {
    switch (action.type) {
        case 'panel.toggle':
            // The button in focus mode leaves focus and opens the panel.
            if (state.focus) return { ...state, focus: false, panelChoice: true };

            return { ...state, panelChoice: !action.shown };
        case 'panel.dismiss':
            return state.panelChoice === null ? state : { ...state, panelChoice: null };
        case 'panel.show': {
            const top = state.trail.at(-1);
            const trail =
                top && samePage(top, action.page) ? state.trail : [...state.trail, action.page];

            return { ...state, trail, panelChoice: true, focus: false };
        }
        case 'panel.replace':
            if (state.trail.length === 0) return state;

            return { ...state, trail: [...state.trail.slice(0, -1), action.page] };
        case 'panel.back':
            if (state.trail.length === 0) return state;

            return { ...state, trail: state.trail.slice(0, -1) };
        case 'panel.home':
            return state.trail.length === 0 ? state : { ...state, trail: [] };
        case 'focus.set':
            return state.focus === action.on ? state : { ...state, focus: action.on };
        case 'point':
            return state.pointedCard === action.card
                ? state
                : { ...state, pointedCard: action.card };
        case 'sheet.set': {
            const sheetTurn = action.turn ?? state.sheetTurn;

            return state.sheet === action.sheet && state.sheetTurn === sheetTurn
                ? state
                : { ...state, sheet: action.sheet, sheetTurn };
        }
        case 'plan.light':
            return state.litPlan === action.turn ? state : { ...state, litPlan: action.turn };
        case 'question.sent':
            return state.sheet === 'auto' && state.sheetTurn === null
                ? state
                : { ...state, sheet: 'auto', sheetTurn: null };
        case 'session.reset':
            return initialShell;
    }
};

/**
 * Whether the session panel shows: closed in focus mode, else the reader's
 * choice when they made one, else open once the canvas holds a card. A
 * panel that overlays the canvas (`overlay`, a narrow window) opens only
 * when the reader or a card asks for it.
 */
export const panelShows = (state: ShellState, cardCount: number, overlay = false): boolean => {
    if (state.focus) return false;

    return state.panelChoice ?? (!overlay && cardCount > 0);
};

/** The card whose page is on top of the panel's trail. */
export const heldCard = (state: ShellState): string | null => {
    const top = state.trail.at(-1);

    return top?.kind === 'card' ? top.id : null;
};

export type Box = { left: number; top: number; width: number; height: number };

/**
 * Where the prompt box rests on arrival from the landing, in px from the
 * window's top left: 52 design px tall, `min(600, canvas width - 40)` wide,
 * centred on the canvas frame, 30 above the window's foot. The canvas frame
 * runs from the left gutter to `panelSpace` from the right. `unit` is px
 * per design px (the root font size over 16).
 */
export const dockArrival = ({
    width,
    height,
    panelSpace,
    unit,
}: {
    width: number;
    height: number;
    panelSpace: number;
    unit: number;
}): Box => {
    const canvasLeft = SHELL_GUTTER * unit;
    const canvasWidth = width - canvasLeft - panelSpace;
    const boxWidth = Math.max(0, Math.min(600 * unit, canvasWidth - 40 * unit));
    const boxHeight = 52 * unit;

    return {
        left: canvasLeft + (canvasWidth - boxWidth) / 2,
        top: height - 30 * unit - boxHeight,
        width: boxWidth,
        height: boxHeight,
    };
};

/** A plan as litCards reads it: its page turn and its cards on the canvas. */
type LitPlan = { turn: number; cards: readonly string[] };

/**
 * The cards the canvas outlines as one plan's: the pointed card's plan
 * siblings (the pointed card takes no outline), and, while the panel shows,
 * the cards of the plan on its page or under the pointer in its overview.
 */
export const litCards = ({
    state,
    panelOpen,
    planOf,
    plans,
}: {
    state: ShellState;
    panelOpen: boolean;
    planOf: (cardId: string) => LitPlan | null;
    plans: readonly LitPlan[];
}): string[] => {
    const lit = new Set<string>();
    const pointed = state.pointedCard;

    if (pointed) {
        for (const id of planOf(pointed)?.cards ?? []) {
            if (id !== pointed) lit.add(id);
        }
    }

    const top = state.trail.at(-1);
    const panelPlan = !panelOpen ? null : top?.kind === 'plan' ? top.turn : state.litPlan;

    for (const id of plans.find((plan) => plan.turn === panelPlan)?.cards ?? []) {
        lit.add(id);
    }

    return [...lit];
};

/**
 * Where the Prompt canvas's view goes to centre board point (`cx`, `cy`) in a
 * view of `view`'s size, held inside the scroll range (`max`, the largest
 * scroll position on each axis) so a glide sent towards an edge eases all
 * the way to it.
 */
export const flyTarget = ({
    cx,
    cy,
    view,
    max,
}: {
    cx: number;
    cy: number;
    view: { width: number; height: number };
    max: { left: number; top: number };
}): { left: number; top: number } => ({
    left: Math.max(0, Math.min(cx - view.width / 2, max.left)),
    top: Math.max(0, Math.min(cy - view.height / 2, max.top)),
});
