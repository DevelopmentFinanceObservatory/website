import NotFound from '@/components/organisms/NotFound/NotFound';

/** What a gallery URL shows while the gallery is unpublished. */
const GalleryOffline = () => (
    <NotFound
        code={null}
        title="The gallery is offline"
        lead="We’re rebuilding it. In the meantime, start from the home page or search the data."
    />
);

export default GalleryOffline;
