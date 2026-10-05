'use client';

import SearchShare, { type CreateSearchShare } from './SearchShare';

import Modal from '@/components/molecules/Modal/Modal';

/**
 * The same share box in a dialog, for a result with no side panel to host
 * it (several datasets at once).
 */
const SearchShareModal = ({
    open,
    onOpenChange,
    createShare,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    createShare: CreateSearchShare;
}) => (
    <Modal open={open} onOpenChange={onOpenChange} title="Share" placement="center" fit>
        <SearchShare createShare={createShare} />
    </Modal>
);

export default SearchShareModal;
