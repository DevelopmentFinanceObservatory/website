import classNames from 'classnames';

import styles from './Card.module.scss';
import CardChrome from './CardChrome';
import CardHead from './CardHead';
import type { CardExtras } from './types';

import type { KeyNumberWidget } from '@/lib/chat/widgets';
import { keyNumberFace } from '@/lib/studio/statFace';

// The stat card: one big number (a per cent sign lighter after it), one
// muted caption close under it (unit, price basis, period, change), then
// the source.
const KeyNumberCard = ({ widget, ...extras }: { widget: KeyNumberWidget } & CardExtras) => {
    const { amount, suffix, caption } = keyNumberFace(widget);

    return (
        <article className={classNames(styles.card, styles.cardStat)}>
            <CardHead {...extras} />
            <div className={styles.keyFace}>
                <p className={styles.keyNumber}>
                    {amount}
                    {suffix && <span className={styles.keySuffix}>{suffix}</span>}
                </p>
                {caption && <p className={styles.keyContext}>{caption}</p>}
            </div>
            <CardChrome
                source={widget.source}
                note={extras.note}
                info={widget.info}
                onInfo={extras.onInfo}
            />
        </article>
    );
};

export default KeyNumberCard;
