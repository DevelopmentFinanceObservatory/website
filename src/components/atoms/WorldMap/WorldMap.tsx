import classNames from 'classnames';

import styles from './WorldMap.module.scss';

/**
 * The world-map line drawing behind the heroes, the 404 and the footer.
 * The 68 KB drawing is a hashed static asset used as a CSS mask, so the
 * browser fetches and caches it once. Inlined, it would sit in every page
 * and again in the RSC payload. It lives in src/assets/masks/, which the
 * svgr rule in next.config.ts skips. The lines take the element's `color`.
 * The caller sets that, the box, and the crop.
 */
const WorldMap = ({ className }: { className?: string }) => (
    <div className={classNames(styles.map, className)} aria-hidden="true" />
);

export default WorldMap;
