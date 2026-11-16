import styles from './page.module.scss';

import PrototypeList from '../components/PrototypeList/PrototypeList';

import PageHero from '@/components/molecules/PageHero/PageHero';

export const metadata = {
    title: { absolute: 'Prototypes · Development Finance Observatory' },
};

/** The index: the site's dark page hero, as on Insights → Publications, then
 *  one row per prototype. */
const Index = () => (
    <>
        <PageHero tone="dark" boxMinHeight={260}>
            <h1 className={styles.title}>Prototypes</h1>
            <p className={styles.lead}>
                Tools and apps built on the Development Finance Observatory infrastructure.
            </p>
        </PageHero>
        <PrototypeList />
    </>
);

export default Index;
