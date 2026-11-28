import classNames from 'classnames';
import { useRef, useState } from 'react';

import { useStudioModel } from '../../hooks/studioContext';
import { usePromptShell } from './shellContext';
import styles from './TopBar.module.scss';

import Icon from '@/components/atoms/Icon/Icon';

/** The id of the session panel's frame, which `Session panel` controls. */
export const PANEL_ID = 'studio-session-panel';

/**
 * The session title after `Studio` in the top bar, renamed in place: Enter
 * and blur commit, Escape cancels, and a blank name keeps the old one.
 * `compact` (a phone) drops the slash and lets the title take two lines.
 */
export const TopBarTitle = ({ compact = false }: { compact?: boolean }) => {
    const { title, doc } = useStudioModel();
    const [draft, setDraft] = useState<string | null>(null);
    const pencil = useRef<HTMLButtonElement>(null);
    // Whether the open field has finished. Enter and Escape remove the
    // focused field, and the blur that removal can fire must not commit a
    // second time or move focus.
    const finished = useRef(false);

    // `refocus` returns focus to the pencil once the field has gone (Enter
    // and Escape). A blur leaves focus where the reader sent it.
    const finish = (commit: boolean, refocus: boolean) => {
        if (finished.current) return;

        finished.current = true;

        const next = draft?.trim();

        if (commit && next && next !== title) {
            doc.setConversationTitle(next);
        }

        setDraft(null);

        if (refocus) requestAnimationFrame(() => pencil.current?.focus());
    };

    return (
        <div className={classNames(styles.session, compact && styles.compact)}>
            {!compact && (
                <span className={styles.slash} aria-hidden="true">
                    /
                </span>
            )}
            {draft === null ? (
                <>
                    <span className={styles.title} title={title}>
                        {title}
                    </span>
                    <button
                        ref={pencil}
                        type="button"
                        className={styles.rename}
                        aria-label="Rename"
                        onClick={() => {
                            finished.current = false;
                            setDraft(title);
                        }}
                    >
                        <Icon name="edit-title" />
                    </button>
                </>
            ) : (
                <input
                    className={styles.input}
                    aria-label="Session title"
                    value={draft}
                    // The pencil press that opens the field puts the caret in it.
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setDraft(event.target.value.replace(/\n/g, ' '))}
                    onBlur={() => finish(true, false)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            finish(true, true);
                        } else if (event.key === 'Escape') {
                            // Handled here: the shell's Escape listener skips a
                            // prevented key.
                            event.preventDefault();
                            finish(false, true);
                        }
                    }}
                />
            )}
        </div>
    );
};

/** `Focus canvas` and `Session panel`, then the rule before `New Session`. */
export const TopBarTools = () => {
    const { state, dispatch, panelOpen, overlay, report } = usePromptShell();
    const focusName = state.focus ? 'Exit focus' : 'Focus canvas';

    return (
        <>
            <button
                type="button"
                className={styles.icon}
                aria-pressed={state.focus}
                aria-label={focusName}
                title={focusName}
                onClick={() => {
                    dispatch({ type: 'focus.set', on: !state.focus });
                    report('studio.focus', { on: !state.focus, how: 'button' });
                }}
            >
                <Icon name={state.focus ? 'focus-contract' : 'focus-expand'} />
            </button>
            <button
                type="button"
                className={styles.icon}
                aria-pressed={panelOpen}
                aria-expanded={panelOpen}
                aria-controls={PANEL_ID}
                aria-label="Session panel"
                title="Session panel"
                onClick={() => {
                    // Closing an overlay records no choice for wider windows.
                    dispatch(
                        overlay && panelOpen
                            ? { type: 'panel.dismiss' }
                            : { type: 'panel.toggle', shown: panelOpen },
                    );
                    report('studio.panel', { action: panelOpen ? 'close' : 'open', how: 'button' });
                }}
            >
                <Icon name="session-panel" />
            </button>
            <span className={styles.rule} aria-hidden="true" />
        </>
    );
};
