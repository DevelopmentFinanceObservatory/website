import Link from 'next/link';

import styles from './PrototypeList.module.scss';

import { prototypes } from '../../registry';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

/** Every prototype in the registry, newest first. */
const PrototypeList = () => {
    if (prototypes.length === 0) {
        return <p className={styles.empty}>The first prototype lands on 16 November 2026.</p>;
    }

    return (
        <ul className={styles.list}>
            {prototypes.map((item) => (
                <li key={item.slug} className={styles.item}>
                    <Link className={styles.link} href={`/${item.slug}/`}>
                        <time className={styles.date} dateTime={item.date}>
                            {dateFormat.format(new Date(item.date))}
                        </time>
                        <span className={styles.title}>{item.title}</span>
                        <span className={styles.summary}>{item.summary}</span>
                    </Link>
                </li>
            ))}
        </ul>
    );
};

export default PrototypeList;
