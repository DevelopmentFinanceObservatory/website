/**
 * dfo-apis' component read for the share slot tests, built from a pair of the
 * recording (`wire-pairs.json`, through `recorded-wire.ts`) with only the ids
 * and frame a test names swapped in, so it keeps the service's shape.
 */
import { bodyOf, frameOfAnswer } from './recorded-wire.ts';

export const APIS = 'https://apis.example';

type Frame = { spec_id: string; content_version: string };

// The frames of the recording: a dataset card read at its stored frame, and
// the one the dataset moved to.
export const DATASET_FRAME: Frame = bodyOf('component_read.at_revision')['stored_intent'].frame_ref;
export const MOVED_FRAME: Frame = frameOfAnswer('frame_refresh.moved');

const isDerived = (frame: Frame | null): boolean => frame?.spec_id.startsWith('ops_') ?? false;

/** dfo-apis' component read of one revision whose stored intent names
 *  `frame`: the recorded read of a dataset card, or of a derived card for an
 *  `ops_` frame. */
export const componentRead = (componentId: string, revision: number, frame: Frame | null) => {
    const body = bodyOf(
        isDerived(frame) ? 'render.derived_card_with_anchor_warning' : 'component_read.at_revision',
    );

    body['component_id'] = componentId;
    body['revision'] = revision;
    body['resolved_payload'].component_id = componentId;
    body['resolved_payload'].revision = revision;
    body['resolved_payload'].provenance.refreshed_from = null;

    if (frame) {
        body['stored_intent'].frame_ref = frame;
        body['resolved_payload'].provenance.inputs = [frame];
    } else {
        delete body['stored_intent'].frame_ref;
        body['resolved_payload'].provenance.inputs = [];
    }

    return body;
};
