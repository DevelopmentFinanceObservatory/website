'use client';

import classNames from 'classnames';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './Button.module.scss';

import Icon, { IconProps } from '@/components/atoms/Icon/Icon';

const SWAP_MS = 1000;
// The arrow's flight (out one side, the ghost in from the other). The
// label's word-roll is detached — the swap is arrows-only.
const ARROW_MS = 750;
// Pointer must rest on the button this long before the swap fires (skips fly-bys).
const HOVER_INTENT_MS = 150;

/** A Button with `href` renders Next's Link, an anchor that navigates, with
 *  the same look and hover; without it, a `<button>`. */
export type ButtonProps = {
    variant?: 'light' | 'dark' | 'outline' | 'bordered' | 'plain' | 'paper';
    wide?: boolean;
    full?: boolean;
    small?: boolean;
    icon?: IconProps['name'];
    children?: React.ReactNode;
    className?: string;
    // A Radix trigger (asChild) hands the rendered element its own ref.
    ref?: React.Ref<HTMLElement>;
} & (
    | ({ href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>)
);

const Button = ({
    variant = 'light',
    wide,
    full,
    small,
    icon,
    children,
    className,
    style,
    ref,
    ...rest
}: ButtonProps) => {
    // Plain buttons skip the word-roll machinery — they only dim on hover.
    const words = variant !== 'plain' && typeof children === 'string' ? children.split(' ') : null;

    // One-shot swap (arrow + label words): hover starts it, it always plays to
    // the end. Hover is watched on the closest [data-button-zone] ancestor when
    // present (whole-card triggers), otherwise on the button itself.
    const [swapping, setSwapping] = useState(false);
    const swappingRef = useRef(false);
    // The rendered <button> or <a>, held in state so the hover effect
    // rebinds when the element changes.
    const [element, setElement] = useState<HTMLElement | null>(null);
    const timeoutRef = useRef(0);
    const intentRef = useRef(0);
    const suppressUntilRef = useRef(0);

    // The element state and a caller's ref (a Radix asChild trigger) both
    // get the node.
    const setNode = useCallback(
        (node: HTMLElement | null) => {
            setElement(node);

            if (typeof ref === 'function') {
                ref(node);
            } else if (ref) {
                ref.current = node;
            }
        },
        [ref],
    );

    // A programmatic label change (e.g. "Download CSV" → "Download PARQUET")
    // must not fire the roll: cancel anything in flight and ignore the hover
    // re-entry that closing a menu over the button tends to produce.
    const label = typeof children === 'string' ? children : null;

    useEffect(() => {
        suppressUntilRef.current = performance.now() + 600;
        window.clearTimeout(intentRef.current);
        window.clearTimeout(timeoutRef.current);
        swappingRef.current = false;

        const frame = requestAnimationFrame(() => setSwapping(false));

        return () => cancelAnimationFrame(frame);
    }, [label]);

    const animates = !!icon?.startsWith('arrow');

    useEffect(() => {
        if (!element || !animates) {
            return;
        }

        const target = element.closest('[data-button-zone]') ?? element;

        const handleMouseEnter = () => {
            if (swappingRef.current || performance.now() < suppressUntilRef.current) {
                return;
            }

            intentRef.current = window.setTimeout(() => {
                swappingRef.current = true;
                setSwapping(true);
                timeoutRef.current = window.setTimeout(() => {
                    swappingRef.current = false;
                    setSwapping(false);
                }, ARROW_MS);
            }, HOVER_INTENT_MS);
        };

        const handleMouseLeave = () => {
            window.clearTimeout(intentRef.current);
        };

        target.addEventListener('mouseenter', handleMouseEnter);
        target.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            target.removeEventListener('mouseenter', handleMouseEnter);
            target.removeEventListener('mouseleave', handleMouseLeave);
            window.clearTimeout(timeoutRef.current);
            window.clearTimeout(intentRef.current);
        };
    }, [animates, element]);

    const shared = {
        className: classNames(
            styles.button,
            styles[variant],
            wide && styles.wide,
            full && styles.full,
            small && styles.small,
            swapping && styles.swapping,
            className,
        ),
        style: {
            // Single source for the SCSS animation timings — the JS timeout
            // that ends the swap must match them exactly.
            '--swap-duration': `${SWAP_MS}ms`,
            '--arrow-duration': `${ARROW_MS}ms`,
            ...style,
        } as React.CSSProperties,
    };

    const content = (
        <>
            {children && (
                <span className={styles.label}>
                    {words
                        ? words.map((word, index) => (
                              <span
                                  key={`${word}-${index}`}
                                  className={styles.word}
                                  style={{ '--wi': index } as React.CSSProperties}
                              >
                                  <span className={styles.wordInner} data-word={word}>
                                      {word}
                                  </span>
                              </span>
                          ))
                        : children}
                </span>
            )}
            {icon && (
                <span className={styles.icon} data-icon={icon}>
                    <span className={styles.mover}>
                        <Icon name={icon} />
                        {icon.startsWith('arrow') && (
                            <span className={styles.ghost} aria-hidden="true">
                                <Icon name={icon} />
                            </span>
                        )}
                    </span>
                </span>
            )}
        </>
    );

    if (rest.href !== undefined) {
        return (
            <Link ref={setNode} {...shared} {...rest}>
                {content}
            </Link>
        );
    }

    return (
        <button ref={setNode} type="button" {...shared} {...rest}>
            {content}
        </button>
    );
};

export default Button;
