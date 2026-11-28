import { createContext, useContext } from 'react';

import type { PanelPage } from '@/lib/studio/promptShell';

/** What a page of the session panel needs from the panel around it. */
export type PanelNav = {
    /** Opens `page` over the current one. `opener` names the control that
     *  opened it (its `data-sp-key`), which takes focus when the reader comes
     *  back. */
    show: (page: PanelPage, opener?: string) => void;
    /** Back one page. */
    back: () => void;
    /** The title of the page behind this one, `Session` over the overview. */
    backLabel: string;
    /** Moves the canvas to the card. */
    fly: (id: string) => void;
};

export const PanelNavContext = createContext<PanelNav | null>(null);

export const usePanelNav = (): PanelNav => {
    const nav = useContext(PanelNavContext);

    if (!nav) {
        throw new Error('usePanelNav needs the session panel above it');
    }

    return nav;
};
