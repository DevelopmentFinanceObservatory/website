import RouteMove from '@/components/atoms/RouteMove/RouteMove';
import FeedbackWidget from '@/components/organisms/FeedbackWidget/FeedbackWidget';
import Footer from '@/components/organisms/Footer/Footer';
import Header from '@/components/organisms/Header/Header';

// Site chrome (nav + footer) wraps every page except the standalone Studio.
// The whole site, header included, is the layer Studio slides over when
// Get Data moves a question there (RouteMove).
const SiteLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
    return (
        <RouteMove layer="under">
            <Header />
            {children}
            <Footer />
            <FeedbackWidget />
        </RouteMove>
    );
};

export default SiteLayout;
