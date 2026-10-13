'use client';

import { createContext } from 'react';

/**
 * The dialog content element a HoverPopup inside a dialog renders its popup
 * into, which the house Modal provides. A dialog's scroll lock cancels
 * wheel and touch-move events on anything outside its content, so a popup
 * portalled to the body could not scroll. Null outside a dialog, where the
 * popup goes to the body.
 */
export const PopupContainer = createContext<HTMLElement | null>(null);
