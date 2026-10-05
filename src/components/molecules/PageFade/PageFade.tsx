import styles from './PageFade.module.scss';

// The ground fading into the footer's dark — the last rem(200) (or so) of
// every content page.
const PageFade = ({ height }: { height?: number }) => (
    <div
        className={styles.fade}
        style={height ? { height: `${height / 16}rem` } : undefined}
        aria-hidden="true"
    />
);

export default PageFade;
