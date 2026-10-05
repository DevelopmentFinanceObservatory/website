import type { Metadata } from 'next';

import About from '@/components/organisms/About/About';

export const metadata: Metadata = {
    title: 'About — DFO',
    description:
        'The Development Finance Observatory is a shared platform bringing development finance data together in one place.',
};

const AboutPage = () => (
    <main>
        <About />
    </main>
);

export default AboutPage;
