import type { CardView } from '../layout';

import type { CardLive } from '@/lib/studio/liveCards';
import type { UnitChoice, UnitOffer } from '@/lib/studio/wire';

// Everything a card renders besides its widget: its on-canvas state and the
// actions the pin + kebab expose. Assembled per slot by the Whiteboard.
export type CardExtras = {
    pinned: boolean;
    title: string;
    // null = the stat card (a single number has nothing to re-visualise).
    view: CardView | null;
    // Which views this card's data honestly supports (line needs ≥2 points);
    // empty hides the switcher entirely.
    viewChoices: CardView[];
    onPin: () => void;
    onRemove: () => void;
    onAsk: () => void;
    // The units the card can move to, and the menu's Change unit sending a
    // pick. Null (or absent) on a card whose frame offers no other unit and
    // on a sheet where no turn can run, and the row is hidden.
    unitOffer?: UnitOffer | null;
    onChangeUnit?: ((unit: UnitChoice) => void) | null;
    // Why the card's changes wait (changesHeld), or null when they can go.
    // While set, the menu's Change unit row says why and opens nothing.
    unitHeld?: string | null;
    // Opens the Download Data dialog; null when the card has no rows to
    // give (a text card), and the download menu offers the image alone.
    onDownload: (() => void) | null;
    // Writes the card itself to a PNG. Null on a read-only sheet, where the
    // controls are gone anyway, and on a card still fading out. With both
    // null the download button is hidden.
    onDownloadImage: (() => void) | null;
    // Opens the edit modal — "Edit Card" (title + body) for text cards,
    // "Edit Title" for every other card.
    onEdit: () => void;
    editLabel: string;
    // Opens the card's More Info panel from its attribution line; null on a
    // card with no frame behind it (a text card).
    onInfo?: (() => void) | null;
    // The user's note on this card (data cards only) and its menu actions:
    // null = no note UI (text cards).
    note?: string;
    onNote: (() => void) | null;
    onRemoveNote: (() => void) | null;
    onView: (view: CardView) => void;
    // Opens the Share modal for this card (link / embed) — null on a
    // read-only sheet.
    onShare: (() => void) | null;
    // Opens the research plan that made the card; the menu's first row.
    // Absent on a card no plan made, and in the classic layout.
    onViewPlan?: (() => void) | null;
    // Hears the card menu and the download menu open and close.
    onMenuOpenChange?: (open: boolean) => void;
    // The menu takes its longest row's width, so no row wraps.
    menuFit?: boolean;
    // A shared/embedded sheet: no pin, no menu, no drag or resize.
    readOnly?: boolean;
    // A data card of a live share: the share's id and creation time, and
    // whether this card is loading, drawn on current data, or failed (with
    // the code). Absent on a text card and on every card of a snapshot.
    live?: CardLive;
};
