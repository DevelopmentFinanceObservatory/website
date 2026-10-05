'use client';

import classNames from 'classnames';

import styles from './CustomizePanel.module.scss';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';
import {
    DEFAULT_THEME,
    resolveTokens,
    StudioTheme,
    THEME_PRESETS,
    ThemeTokens,
} from '@/lib/studio/theme';

const CUSTOM_ROWS: { key: keyof ThemeTokens; label: string }[] = [
    { key: 'accent', label: 'Accent' },
    { key: 'card', label: 'Card Surface' },
    { key: 'text', label: 'Text' },
];

/**
 * The Customize drawer: preset tiles (five swatches + name) and three Custom
 * token rows (label · hex · colour well). Presets swap the whole theme;
 * a Custom edit overrides one token on top of the active preset. Reset
 * returns to Default.
 */
const CustomizePanel = ({
    open,
    onOpenChange,
    theme,
    onChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    theme: StudioTheme;
    onChange: (theme: StudioTheme) => void;
}) => {
    const tokens = resolveTokens(theme);
    // A Custom edit steps off the preset — no tile reads as selected until
    // one is picked again (which also clears the overrides).
    const customised = Object.keys(theme.overrides).length > 0;

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Customize"
            fit
            actions={
                <Button variant="paper" onClick={() => onChange(DEFAULT_THEME)}>
                    Reset
                </Button>
            }
        >
            <p className={styles.sectionLabel}>Presets</p>
            <div className={styles.presets}>
                {THEME_PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        className={classNames(
                            styles.preset,
                            !customised && preset.id === theme.preset && styles.presetActive,
                        )}
                        onClick={() => onChange({ preset: preset.id, overrides: {} })}
                    >
                        <span className={styles.swatches}>
                            {preset.swatches.map((swatch, index) => (
                                <span
                                    key={index}
                                    className={styles.swatch}
                                    style={{ backgroundColor: swatch }}
                                />
                            ))}
                        </span>
                        <span className={styles.presetName}>{preset.label}</span>
                    </button>
                ))}
            </div>

            <p className={styles.sectionLabel}>Custom</p>
            <div className={styles.rows}>
                {CUSTOM_ROWS.map(({ key, label }) => (
                    <label key={key} className={styles.row}>
                        <span className={styles.rowLabel}>{label}</span>
                        <span className={styles.rowHex}>
                            <span className={styles.hash}>#</span>
                            {tokens[key].replace('#', '').toUpperCase()}
                        </span>
                        <span className={styles.well} style={{ backgroundColor: tokens[key] }}>
                            <input
                                type="color"
                                className={styles.wellInput}
                                value={tokens[key]}
                                aria-label={`${label} colour`}
                                onChange={(event) =>
                                    onChange({
                                        ...theme,
                                        overrides: {
                                            ...theme.overrides,
                                            [key]: event.target.value,
                                        },
                                    })
                                }
                            />
                        </span>
                    </label>
                ))}
            </div>
        </Modal>
    );
};

export default CustomizePanel;
