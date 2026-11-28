import classNames from 'classnames';

import { useStudioModel } from '../hooks/studioContext';
import styles from '../Studio.module.scss';

import GridPattern from '@/components/atoms/GridPattern/GridPattern';

/**
 * The grid behind the Studio and its drifting cell fills. `className` places
 * the clip box; the inner layer stays screen-sized, so the grid holds still
 * while the box docks.
 */
const CanvasBackdrop = ({ className }: { className?: string }) => {
    const { gridCell, gridScale, fills } = useStudioModel().stage;

    return (
        <div className={classNames(styles.canvas, className)} aria-hidden="true">
            <div className={styles.canvasInner}>
                <GridPattern variant="light" cell={gridCell} />
                {fills.map(({ id, x, y, w, h, shade, leaving }) => (
                    <span
                        key={id}
                        className={classNames(styles.fill, leaving && styles.fillOut)}
                        style={{
                            left: x * gridScale,
                            top: y * gridScale,
                            width: w * gridScale,
                            height: h * gridScale,
                            backgroundColor: shade,
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

export default CanvasBackdrop;
