import { useStudioModel } from '../hooks/studioContext';
import CardDownload from '../modals/CardDownload';

import Modal from '@/components/molecules/Modal/Modal';
import { sharedCardAddress } from '@/lib/studio/cardDownload';

/** Download Data for the card the model names (`panels.downloadWidget`). */
const DownloadDataModal = () => {
    const {
        shared,
        panels: { downloadWidget, setDownloadCardId },
    } = useStudioModel();

    return (
        <Modal
            open={downloadWidget !== null}
            onOpenChange={(next) => !next && setDownloadCardId(null)}
            title="Download Data"
            fit
        >
            {downloadWidget && (
                <CardDownload
                    widget={downloadWidget}
                    details
                    shared={sharedCardAddress(shared, downloadWidget.id)}
                />
            )}
        </Modal>
    );
};

export default DownloadDataModal;
