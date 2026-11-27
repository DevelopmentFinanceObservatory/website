'use client';

import classNames from 'classnames';

import LiveNote from '../canvas/LiveNote';
import Whiteboard from '../canvas/Whiteboard';
import CanvasBackdrop from './CanvasBackdrop';
import DownloadDataModal from './DownloadDataModal';
import { whiteboardProps } from './whiteboardProps';
import GuestWall from '../GuestWall';
import { useStudioModel } from '../hooks/studioContext';
import StudioLanding from '../landing/StudioLanding';
import CardInfoPanel from '../modals/CardInfoPanel';
import StudioModals from '../modals/StudioModals';
import styles from '../Studio.module.scss';
import ChatPanel from '../workspace/ChatPanel';
import WorkspaceToolbar from '../workspace/WorkspaceToolbar';

import Button from '@/components/atoms/Button/Button';
import FeedbackWidget from '@/components/organisms/FeedbackWidget/FeedbackWidget';
import Header from '@/components/organisms/Header/Header';
import { sharedCardAddress } from '@/lib/studio/cardDownload';
import { themeVars } from '@/lib/studio/theme';

/**
 * The classic layout: the landing that morphs into the workspace, with the
 * chat column on the left, the whiteboard on the right and the tools row
 * above, drawn from the Studio's model (useStudioModel).
 */
const ClassicShell = () => {
    const model = useStudioModel();
    const {
        shared,
        continuable,
        examples,
        readOnly,
        account,
        solo,
        guest,
        walled,
        phone,
        chat,
        doc,
        save,
        modals,
        landingHistory,
        mode: {
            current: mode,
            leaving,
            inWorkspace,
            begin,
            sendDraft,
            startNew,
            continueSession,
            forking,
        },
        stage: { sectionRef, theme: derivedTheme, filtersRow, chatShown },
        drafts: {
            query,
            setQuery,
            followDraft,
            setFollowDraft,
            inputRef,
            editTarget,
            setEditTarget,
        },
        view: {
            chatTab,
            setChatTab,
            chatCollapsed,
            setChatCollapsed,
            cardTabs: cardTabItems,
            cardsTab: activeCardsTab,
            setCardsTab,
            showFilters,
        },
        canvas: {
            widgets: visibleWidgets,
            live: liveCanvas,
            isOnCanvas,
            flyTo: flyToCard,
            add: addWidget,
            remove: removeCard,
        },
        panels: { infoCardId, setInfoCardId, infoWidget, infoCiteLink, citeInfoCard, shareData },
        title,
        firstPrompt,
    } = model;

    return (
        <section
            ref={sectionRef}
            className={classNames(
                styles.section,
                filtersRow && styles.filtersRow,
                chatShown && styles.chatShown,
            )}
        >
            {/* Docking starts with the stage-out, so the landing leaves in one
                continuous move. */}
            <CanvasBackdrop
                className={classNames(
                    mode !== 'start' && styles.canvasDocked,
                    mode !== 'start' && chatCollapsed && styles.canvasWide,
                    solo && styles.canvasSolo,
                )}
            />

            {/* Widgets ride ABOVE the clipped pattern, in the same docked
                region (a separate scroll layer so the grid stays a backdrop). */}
            {inWorkspace && (
                <div
                    className={classNames(
                        styles.canvasContent,
                        chatCollapsed && styles.canvasContentWide,
                        solo && styles.canvasContentSolo,
                    )}
                    style={themeVars(derivedTheme) as React.CSSProperties}
                >
                    <Whiteboard
                        {...whiteboardProps(model)}
                        onCardInfo={setInfoCardId}
                        focusedId={infoCardId}
                    />
                </div>
            )}

            <CardInfoPanel
                info={infoWidget?.info ?? null}
                widget={infoWidget}
                open={infoCardId !== null}
                onOpenChange={(next) => !next && setInfoCardId(null)}
                shared={infoWidget && sharedCardAddress(shared, infoWidget.id)}
                // A share row's `live` is set either way (sharedViewOfRecord).
                // A gallery canvas leaves it unset and has no share link.
                snapshot={
                    shared?.live === false
                        ? {
                              id: shared.id,
                              servedAt: infoWidget ? shared.servedAt?.[infoWidget.id] : undefined,
                          }
                        : undefined
                }
                canShare={!readOnly}
                citeLink={infoCiteLink}
                onCiteLink={citeInfoCard}
            />

            <DownloadDataModal />

            {inWorkspace && !readOnly && (
                <StudioModals
                    modals={modals}
                    doc={doc}
                    visibleWidgets={visibleWidgets}
                    title={title}
                    firstPrompt={firstPrompt}
                    shareData={shareData}
                    createShare={save.createShare}
                    guest={guest}
                />
            )}

            {/* The bar reads "Studio"; the conversation's title lives in the
                tools row over the canvas — except on a phone, where that row
                has no room for it and the bar keeps it. */}
            <Header
                variant="studio"
                title={inWorkspace && phone ? title : undefined}
                titleEditable={inWorkspace && phone && !readOnly}
                onEditTitle={modals.title.show}
                onBack={mode === 'start' || readOnly ? undefined : startNew}
                // A share is a plain read-only view with the logo and title
                // only, and no way back or account.
                back={!readOnly}
                account={!readOnly}
            >
                {inWorkspace && !readOnly && (
                    <>
                        <Button
                            variant="bordered"
                            className={styles.barExtra}
                            style={{ '--i': 0 } as React.CSSProperties}
                            onClick={startNew}
                        >
                            New Chat
                        </Button>
                        <Button
                            variant="bordered"
                            className={styles.barExtra}
                            style={{ '--i': 1 } as React.CSSProperties}
                            onClick={() => modals.customize.setOpen((prev) => !prev)}
                        >
                            Customize
                        </Button>
                        {account && (
                            <Button
                                variant="dark"
                                wide
                                icon="arrow-up-right"
                                className={styles.barExtra}
                                style={{ '--i': 2 } as React.CSSProperties}
                                onClick={() => modals.share.show({ kind: 'whole' })}
                            >
                                Share
                            </Button>
                        )}
                    </>
                )}
            </Header>

            {!inWorkspace && (
                <StudioLanding
                    query={leaving ? followDraft : query}
                    onQueryChange={leaving ? setFollowDraft : setQuery}
                    onBegin={leaving ? sendDraft : begin}
                    examples={examples}
                    inputRef={inputRef}
                    history={account ? landingHistory.history : null}
                    openingId={landingHistory.openingId}
                    onOpenHistory={landingHistory.openHistory}
                    leaving={leaving}
                    wall={walled ? <GuestWall /> : null}
                />
            )}

            {continuable && solo && (
                <div className={styles.continueBar}>
                    <Button onClick={continueSession} disabled={forking}>
                        {forking ? 'Opening…' : 'Continue this session'}
                    </Button>
                </div>
            )}

            {!readOnly && <FeedbackWidget />}

            {inWorkspace && (
                <div className={styles.workspace}>
                    <WorkspaceToolbar
                        chatTab={chatTab}
                        onChatTab={setChatTab}
                        chatCollapsed={chatCollapsed}
                        onChatCollapsed={setChatCollapsed}
                        cardTabs={showFilters ? cardTabItems : null}
                        cardsTab={activeCardsTab}
                        onCardsTab={setCardsTab}
                        solo={solo}
                        readOnly={readOnly}
                        title={title}
                        onEditTitle={modals.title.show}
                        phone={phone}
                        onNewChat={startNew}
                        onCustomize={() => modals.customize.setOpen((prev) => !prev)}
                        onShare={readOnly ? undefined : () => modals.share.show({ kind: 'whole' })}
                        note={liveCanvas ? <LiveNote live={liveCanvas} /> : undefined}
                    />
                    <ChatPanel
                        draft={followDraft}
                        onDraftChange={setFollowDraft}
                        editTarget={editTarget}
                        onClearEditTarget={() => setEditTarget(null)}
                        chat={chat}
                        tab={chatTab}
                        collapsed={chatCollapsed}
                        gone={solo}
                        readOnly={readOnly}
                        // The workspace follows the landing, whose prompt or drawer
                        // button has just unmounted. Focus moves to the follow-up
                        // field so a keyboard user does not land on the page body.
                        // Skipped on a phone, where focus opens the keyboard, and on
                        // a share, which opens straight on the workspace.
                        autoFocus={!shared && !phone}
                        wall={walled ? <GuestWall /> : null}
                        onContinue={continuable ? continueSession : null}
                        continuing={forking}
                        shareMarks={doc.shareMarks}
                        titles={doc.titles}
                        views={doc.views}
                        onCanvas={isOnCanvas}
                        onGo={flyToCard}
                        onAdd={addWidget}
                        onRemove={removeCard}
                    />
                </div>
            )}
        </section>
    );
};

export default ClassicShell;
