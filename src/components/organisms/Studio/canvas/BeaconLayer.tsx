import classNames from 'classnames';
import { useEffect, useState } from 'react';

import styles from './BeaconLayer.module.scss';
import type { Beacon } from './beacons';

// The arrow glyph (shaft + head), spun straight toward the card.
const Arrow = ({ deg }: { deg: number }) => (
    <svg
        className={styles.beaconArrow}
        style={{ rotate: `${deg}deg` }}
        viewBox="0 0 10 10"
        aria-hidden="true"
    >
        <path d="M1.5 5h7M5.5 2 8.5 5l-3 3" />
    </svg>
);

const EDGE_CLASS = {
    left: styles.beaconLeft,
    right: styles.beaconRight,
    top: styles.beaconTop,
    bottom: styles.beaconBottom,
};

/**
 * Zero-size sticky anchor pinned to the view's corner — beacons inside are
 * positioned in VIEW space, so scrolling/panning never moves them.
 * Collapsed: an arrow in a circle; hover expands to the list, one clickable
 * row per card. A finger has no hover: its first tap opens the list, a
 * row's tap flies (two taps, always), a tap anywhere else closes it.
 */
const BeaconLayer = ({
    beacons,
    onFly,
}: {
    beacons: Beacon[];
    onFly: (cx: number, cy: number) => void;
}) => {
    const [openKey, setOpenKey] = useState<string | null>(null);

    useEffect(() => {
        if (!openKey) {
            return;
        }

        // A press outside any beacon closes; presses inside are the beacon's
        // own (its second tap flies, a row's tap flies).
        const close = (event: PointerEvent) => {
            if (!(event.target as HTMLElement).closest('[data-beacon]')) {
                setOpenKey(null);
            }
        };

        document.addEventListener('pointerdown', close, { capture: true });

        return () => document.removeEventListener('pointerdown', close, { capture: true });
    }, [openKey]);

    return (
        <div className={styles.beaconLayer}>
            {beacons.map((beacon) => (
                <div
                    key={beacon.key}
                    data-beacon=""
                    className={classNames(
                        styles.beacon,
                        EDGE_CLASS[beacon.edge],
                        beacon.align === 'start' && styles.beaconStart,
                        beacon.align === 'end' && styles.beaconEnd,
                        openKey === beacon.key && styles.beaconOpen,
                    )}
                    style={{ left: beacon.x, top: beacon.y, translate: beacon.translate }}
                    // The pointer must never leak to the board — a press on any
                    // part of a beacon is a click, not the start of a pan.
                    onPointerDown={(event) => event.stopPropagation()}
                    // Decided per pointer (not by media query — a finger on a
                    // hybrid device is still a finger): a touch opens the
                    // list first; a mouse click flies straight away.
                    onPointerUp={(event) => {
                        if ((event.target as HTMLElement).closest('button')) {
                            return;
                        }

                        if (event.pointerType === 'touch' && openKey !== beacon.key) {
                            setOpenKey(beacon.key);

                            return;
                        }

                        setOpenKey(null);
                        onFly(beacon.cx, beacon.cy);
                    }}
                >
                    <span className={styles.beaconBadge}>
                        <Arrow deg={beacon.deg} />
                        {beacon.items.length > 1 && (
                            <span className={styles.beaconCount}>{beacon.items.length}</span>
                        )}
                    </span>
                    <div className={styles.beaconPanel}>
                        {beacon.items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={styles.beaconRow}
                                onPointerUp={(event) => {
                                    event.stopPropagation();
                                    setOpenKey(null);
                                    onFly(item.cx, item.cy);
                                }}
                            >
                                <Arrow deg={item.deg} />
                                <span className={styles.beaconTitle}>{item.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default BeaconLayer;
