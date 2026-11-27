import type { WhiteboardProps } from '../canvas/Whiteboard';
import type { StudioModel } from '../hooks/useStudio';

/** The Whiteboard props every layout draws from the Studio's model. Each
 *  layout adds its own `onCardInfo` and the props only it uses. */
export type SharedWhiteboardProps = Omit<WhiteboardProps, 'onCardInfo' | 'focusedId'>;

export const whiteboardProps = ({
    shared,
    readOnly,
    doc,
    save,
    modals,
    stage,
    view,
    canvas,
    panels,
    chat,
}: StudioModel): SharedWhiteboardProps => ({
    widgets: canvas.widgets,
    filter: view.cardsTab,
    pinnedIds: doc.pinnedIds,
    onTogglePin: canvas.togglePin,
    onRemove: canvas.remove,
    onAskFollowUp: canvas.askFollowUp,
    onChangeUnit: readOnly ? undefined : canvas.changeUnit,
    changesHeld: chat.changesHeld,
    onEditText: modals.textCard.show,
    onEditTitle: modals.cardTitle.show,
    titles: doc.titles,
    notes: doc.notes,
    onEditNote: modals.note.show,
    onRemoveNote: doc.removeNote,
    initialLayout: save.openedLayout,
    onLayoutChange: save.handleLayoutChange,
    replacedIds: doc.replacedIds,
    flyToCardRef: canvas.flyToCardRef,
    theme: stage.theme,
    views: doc.views,
    onViewChange: doc.setView,
    ratios: doc.ratios,
    onRatioChange: doc.setRatio,
    onShare: readOnly
        ? undefined
        : (id) => modals.share.show({ kind: 'card', id, title: canvas.titleOf(id) }),
    onDownload: panels.setDownloadCardId,
    readOnly,
    // A viewer may resize a share's cards for themselves: the layout and
    // ratios stay in the page (a share has no conversation id, so
    // useConversationSave saves nothing).
    resizable: readOnly,
    centerSingle: shared?.kind === 'card',
    live: canvas.live,
});
