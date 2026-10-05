'use client';

import CustomizePanel from './CustomizePanel';
import EditTitleModal from './EditTitleModal';
import NoteModal from './NoteModal';
import ShareModal, { type ShareDatum } from './ShareModal';
import TextCardModal from './TextCardModal';
import type { StudioModalsState } from './useStudioModals';
import { widgetTitle } from '../canvas/layout';
import type { CanvasDocument } from '../hooks/useCanvasDocument';

import type { ShareKind } from '@/lib/chat/shareStore';
import type { Widget } from '@/lib/chat/widgets';

type StudioModalsProps = {
    modals: StudioModalsState;
    doc: CanvasDocument;
    // The cards currently on the sheet (the title/note modals look theirs up).
    visibleWidgets: Widget[];
    // The conversation's display title and the first prompt (title reset).
    title: string;
    firstPrompt: string;
    shareData: ShareDatum[];
    createShare: (kind: ShareKind, cardId?: string) => Promise<string | null>;
};

/**
 * Every Studio dialog, wired to the canvas document: Customize (theme),
 * Text Card (add/edit), Edit Title (a card's, the conversation's), Note,
 * Share. Each is keyed per OPENING (modals.seq) so its fields start from the
 * right prefill and the node survives its close animation.
 */
const StudioModals = ({
    modals,
    doc,
    visibleWidgets,
    title,
    firstPrompt,
    shareData,
    createShare,
}: StudioModalsProps) => {
    const { seq } = modals;
    const editingText = modals.textCard.editingId
        ? doc.textCards.find((card) => card.id === modals.textCard.editingId)
        : undefined;
    const editingTitleWidget = modals.cardTitle.editingId
        ? visibleWidgets.find((widget) => widget.id === modals.cardTitle.editingId)
        : undefined;

    return (
        <>
            <CustomizePanel
                open={modals.customize.open}
                onOpenChange={modals.customize.setOpen}
                theme={doc.theme}
                onChange={doc.setTheme}
            />
            <TextCardModal
                key={`text-${seq}`}
                open={modals.textCard.open}
                onOpenChange={modals.textCard.setOpen}
                initial={
                    editingText ? { title: editingText.title, body: editingText.body } : undefined
                }
                onSubmit={(cardTitle, body) =>
                    doc.upsertTextCard(modals.textCard.editingId, cardTitle, body)
                }
            />
            <EditTitleModal
                key={`card-title-${seq}`}
                open={modals.cardTitle.open && !!editingTitleWidget}
                onOpenChange={(open) => {
                    if (!open) {
                        modals.cardTitle.setOpen(false);
                    }
                }}
                current={
                    editingTitleWidget
                        ? (doc.titles[editingTitleWidget.id] ?? widgetTitle(editingTitleWidget))
                        : ''
                }
                original={editingTitleWidget ? widgetTitle(editingTitleWidget) : ''}
                onSubmit={(next) => {
                    if (editingTitleWidget) {
                        doc.setTitle(editingTitleWidget.id, next);
                    }
                }}
            />
            <EditTitleModal
                key={`conversation-title-${seq}`}
                open={modals.title.open}
                onOpenChange={(open) => {
                    if (!open) {
                        modals.title.setOpen(false);
                    }
                }}
                current={title}
                // Reset = back to the first prompt (a restored conversation's
                // display title may already be a rename).
                original={firstPrompt}
                onSubmit={doc.setConversationTitle}
            />
            <NoteModal
                key={`note-${seq}`}
                open={modals.note.open && !!modals.note.editingId}
                onOpenChange={(open) => {
                    if (!open) {
                        modals.note.setOpen(false);
                    }
                }}
                initial={modals.note.editingId ? doc.notes[modals.note.editingId] : undefined}
                onSubmit={(note) => {
                    if (modals.note.editingId) {
                        doc.setNote(modals.note.editingId, note);
                    }
                }}
            />
            <ShareModal
                key={`share-${seq}`}
                open={modals.share.open}
                onOpenChange={modals.share.setOpen}
                scope={modals.share.scope}
                title={title}
                data={shareData}
                createShare={createShare}
            />
        </>
    );
};

export default StudioModals;
