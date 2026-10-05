/**
 * `payload.ts`'s readers against real captured frames: the resolved
 * revision envelope, the older `stored_intent` shape an earlier harness
 * sends, and the edge cases in between.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { payloadFrameRef, payloadNoteText, payloadProvenance, payloadTitle } from '../payload.ts';
import { envelopeCreated } from './fixtures/envelope-created.ts';
import { envelopeRevised } from './fixtures/envelope-revised.ts';
import { noteNarration } from './fixtures/note-narration.ts';
import { oldCreated } from './fixtures/old-created.ts';

test('payloadFrameRef: reads the envelope provenance input', () => {
    assert.deepEqual(payloadFrameRef(envelopeCreated), {
        spec_id: 'spec_209b19f3a7a50d137f034615f4695fe7',
        content_version: 'cv_bbd438aa1d8becf601443e1f4006d74c',
    });
});

test('payloadFrameRef: reads a revised frame the same way', () => {
    assert.deepEqual(payloadFrameRef(envelopeRevised), {
        spec_id: 'spec_36ee4aaed40c7c8ee7a0a6869b1fc80e',
        content_version: 'cv_f51f1a22b6af86e0cd281cbf93b3ec6c',
    });
});

test('payloadFrameRef: falls back to the old payload stored_intent.frame_ref', () => {
    assert.deepEqual(payloadFrameRef(oldCreated), {
        spec_id: 'spec_0002907ee44bf25fc98f343372614a84',
        content_version: 'cv_bec21df8ebf432401c160f10858e61fb',
    });
});

test('payloadFrameRef: a note has no frame ref (empty provenance.inputs, no stored_intent)', () => {
    assert.equal(payloadFrameRef(noteNarration), undefined);
});

test('payloadFrameRef: undefined on a missing payload', () => {
    assert.equal(payloadFrameRef(undefined), undefined);
    assert.equal(payloadFrameRef(null), undefined);
    assert.equal(payloadFrameRef({}), undefined);
});

test('payloadFrameRef: ignores a provenance input missing spec_id or content_version', () => {
    assert.equal(
        payloadFrameRef({ provenance: { inputs: [{ spec_id: 'spec_only' }] } }),
        undefined,
    );
    assert.equal(
        payloadFrameRef({ stored_intent: { frame_ref: { content_version: 'cv_only' } } }),
        undefined,
    );
});

test('payloadTitle: reads the envelope component.title.text', () => {
    assert.equal(payloadTitle(envelopeCreated), 'Life Expectancy in Nigeria (1960–2023)');
});

test('payloadTitle: falls back to the old payload stored_intent.title', () => {
    assert.equal(
        payloadTitle(oldCreated),
        'Current Health Expenditure Per Capita in Kenya (2000-2023)',
    );
});

test('payloadTitle: a note has no title', () => {
    assert.equal(payloadTitle(noteNarration), undefined);
});

test('payloadTitle: a blank title text is treated as missing', () => {
    assert.equal(payloadTitle({ component: { title: { text: '   ' } } }), undefined);
    assert.equal(payloadTitle({ stored_intent: { title: '' } }), undefined);
});

test('payloadTitle: undefined on a missing payload', () => {
    assert.equal(payloadTitle(undefined), undefined);
    assert.equal(payloadTitle({}), undefined);
});

test('payloadNoteText: reads the envelope component.text', () => {
    assert.equal(
        payloadNoteText(noteNarration),
        'Malaria grant disbursements to Ethiopia held broadly steady from 2019 to 2024, after a dip in 2018.',
    );
});

test('payloadNoteText: falls back to the old payload stored_intent.text', () => {
    assert.equal(payloadNoteText({ stored_intent: { text: 'a note' } }), 'a note');
});

test('payloadNoteText: falls back to a bare top-level text', () => {
    assert.equal(payloadNoteText({ text: 'a bare note' }), 'a bare note');
});

test('payloadNoteText: undefined when no shape carries text', () => {
    assert.equal(payloadNoteText(envelopeCreated), undefined);
    assert.equal(payloadNoteText(undefined), undefined);
    assert.equal(payloadNoteText({}), undefined);
});

test('payloadNoteText: an empty string is treated as missing', () => {
    assert.equal(
        payloadNoteText({ component: { text: '' }, stored_intent: { text: '' }, text: '' }),
        undefined,
    );
});

test('payloadProvenance: reads a source ref beside its minted id, null when absent', () => {
    const [source] = envelopeCreated.provenance.sources;
    const read = (sources: Record<string, unknown>[]) =>
        payloadProvenance({ provenance: { ...envelopeCreated.provenance, sources } })?.sources.map(
            (entry) => [entry.id, entry.ref],
        );

    assert.deepEqual(read([source]), [[source.id, null]]);
    assert.deepEqual(read([{ ...source, ref: 'dc/base/WorldDevelopmentIndicators' }]), [
        [source.id, 'dc/base/WorldDevelopmentIndicators'],
    ]);
});
