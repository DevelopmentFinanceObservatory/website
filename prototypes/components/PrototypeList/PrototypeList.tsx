import styles from './PrototypeList.module.scss';

import { prototypes } from '../../registry';

import Button from '@/components/atoms/Button/Button';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

/** Every prototype in the registry, newest first, in the row style of
 *  Insights → Publications without the cover. */
const PrototypeList = () =>
    prototypes.length > 0 && (
        <ul className={styles.list}>
            {prototypes.map((item) => (
                <li key={item.slug} className={styles.row}>
                    <h2 className={styles.title}>{item.title}</h2>
                    <time className={styles.date} dateTime={item.date}>
                        {dateFormat.format(new Date(item.date))}
                    </time>
                    <p className={styles.summary}>{item.summary}</p>
                    <Button icon="arrow" href={`/${item.slug}/`}>
                        Open
                    </Button>
                </li>
            ))}
        </ul>
    );

export default PrototypeList;
