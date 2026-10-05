import FeedbackWidget from '@/components/organisms/FeedbackWidget/FeedbackWidget';
import Footer from '@/components/organisms/Footer/Footer';
import Header from '@/components/organisms/Header/Header';

// Site chrome (nav + footer) wraps every page except the standalone Studio.
const SiteLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
    return (
        <>
            <Header />
            {children}
            <Footer />
            <FeedbackWidget />
        </>
    );
};

export default SiteLayout;
