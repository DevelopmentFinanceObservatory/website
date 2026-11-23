/**
 * A card's unit change: the offer its card menu's Change unit opens on, the
 * `apply_unit` request a pick sends, the words the transcript and the chat
 * line show for it, and the harness's refusal of it. The offer comes on the
 * card's `component.created` frame (`unit_change`) and rides on the widget,
 * so a saved conversation reopens with it.
 */

import type { Widget } from '../chat/widgets.ts';
import type { StreamRefusal } from './studioClient.ts';
import { unitText } from './unitChoice.ts';
import type { ApplyUnit, UnitChoice, UnitOffer } from './wire.ts';

/** A pick in a card's Change unit panel, ready to send: the card's title as
 *  the canvas shows it, the offer the pick came from, and the request. */
export type CardUnitChange = { title: string; offer: UnitOffer; request: ApplyUnit };

/** The units `widget` can move to, or null for a card with no offer. */
export const cardUnitOffer = (widget: Widget): UnitOffer | null =>
    widget.kind === 'text' ? null : (widget.unitChange?.offer ?? null);

/** The change that moves `widget`, drawn in conversation turn `turn`, to
 *  `unit`, or null when the card has no offer or no turn to name. A current
 *  unit carries no base year. */
export const cardUnitChange = (
    widget: Widget & { turn: number },
    title: string,
    unit: UnitChoice,
): CardUnitChange | null => {
    const change = widget.kind === 'text' ? undefined : widget.unitChange;

    if (!change || widget.kind === 'text' || widget.turn < 1) {
        return null;
    }

    return {
        title,
        offer: change.offer,
        request: {
            component_id: widget.ref?.component_id ?? widget.id,
            spec_id: change.spec_id,
            turn: widget.turn,
            unit:
                unit.prices === 'constant'
                    ? { currency: unit.currency, prices: unit.prices, base_year: unit.base_year }
                    : { currency: unit.currency, prices: unit.prices },
        },
    };
};

/** The change in words: "Constant 2023 US dollars". */
export const changeUnitText = ({ offer, request }: CardUnitChange): string =>
    unitText(offer, request.unit);

/** The constraint id of the harness's refusal of a unit change whose card is
 *  gone or reads another spec. */
export const SCOPE_CHOICE_STALE = 'scope_choice_stale';

/** Whether the harness refused a unit change as stale: the card's offer is
 *  dead, so the card should stop offering it. */
export const unitRefusalStale = (refusal: StreamRefusal): boolean =>
    unitRefusalDetail(refusal) !== null && refusal.error?.constraint_id === SCOPE_CHOICE_STALE;

/** The `detail` of the harness's refusal of a unit change (422 with a
 *  pointer under `/apply_unit`), or null for any other refusal. */
export const unitRefusalDetail = (refusal: StreamRefusal): string | null =>
    refusal.status === 422 && refusal.error?.pointer?.startsWith('/apply_unit')
        ? refusal.error.detail
        : null;

/** The widgets without their unit offers, for a conversation reopened
 *  without its harness session, which holds none of the cards they move. */
export const withoutUnitChanges = <TWidget extends Widget>(widgets: TWidget[]): TWidget[] =>
    widgets.map((widget) =>
        widget.kind !== 'text' && widget.unitChange ? { ...widget, unitChange: undefined } : widget,
    );
