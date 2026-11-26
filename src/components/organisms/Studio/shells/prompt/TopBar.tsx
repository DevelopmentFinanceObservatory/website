import { useRef, useState } from 'react';

import { usePromptShell } from './shellContext';
import styles from './TopBar.module.scss';
import { useStudioModel } from '../../hooks/studioContext';

import Icon from '@/components/atoms/Icon/Icon';

/**
 * The session title after `Studio` in the top bar, renamed in place: Enter
 * and blur commit, Escape cancels, and a blank name keeps the old one.
 */
export const TopBarTitle = () => {
    const { title, doc, readOnly } = useStudioModel();
    const [draft, setDraft] = useState<string | null>(null);
    const pencil = useRef<HTMLButtonElement>(null);

    const finish = (commit: boolean) => {
        const next = draft?.trim();

        if (commit && next && next !== title) {
            doc.setConversationTitle(next);
        }

        setDraft(null);
        // The pencil returns once the input has gone.
        requestAnimationFrame(() => pencil.current?.focus());
    };

    return (
        <div className={styles.session}>
            <span className={styles.slash} aria-hidden="true">
                /
            </span>
            {draft === null ? (
                <>
                    <span className={styles.title} title={title}>
                        {title}
                    </span>
                    {!readOnly && (
                        <button
                            ref={pencil}
                            type="button"
                            className={styles.rename}
                            aria-label="Rename"
                            onClick={() => setDraft(title)}
                        >
                            <Icon name="edit-title" />
                        </button>
                    )}
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
                    onBlur={() => finish(true)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            finish(true);
                        } else if (event.key === 'Escape') {
                            // Handled here: the shell's Escape listener skips a
                            // prevented key.
                            event.preventDefault();
                            finish(false);
                        }
                    }}
                />
            )}
        </div>
    );
};

/** `Focus canvas` and `Session panel`, then the rule before `New Session`. */
export const TopBarTools = () => {
    const { state, dispatch, panelOpen } = usePromptShell();
    const focusName = state.focus ? 'Exit focus' : 'Focus canvas';

    return (
        <>
            <button
                type="button"
                className={styles.icon}
                aria-pressed={state.focus}
                aria-label={focusName}
                title={focusName}
                onClick={() => dispatch({ type: 'focus.set', on: !state.focus })}
            >
                <Icon name={state.focus ? 'focus-contract' : 'focus-expand'} />
            </button>
            <button
                type="button"
                className={styles.icon}
                aria-pressed={panelOpen}
                aria-expanded={panelOpen}
                aria-label="Session panel"
                title="Session panel"
                onClick={() => dispatch({ type: 'panel.toggle', shown: panelOpen })}
            >
                <Icon name="session-panel" />
            </button>
            <span className={styles.rule} aria-hidden="true" />
        </>
    );
};
