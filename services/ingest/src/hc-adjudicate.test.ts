import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adjudicate,
  buildPrompt,
  parseAdjudication,
  selectsForModel,
  textWindow,
  verifyEvidenceSpan,
  HEAD_CHARS,
  TAIL_CHARS,
} from './hc-adjudicate.ts';

const DOC =
  'IN THE HIGH COURT OF JUDICATURE AT PATNA. Civil Writ Jurisdiction Case No. 1234 of 2019. ' +
  'Heard learned counsel for the petitioner and learned counsel for the State. ' +
  'In view of the statement made, the writ petition is rendered infructuous and is accordingly disposed of.';

const input = {
  judgmentId: '11111111-1111-1111-1111-111111111111',
  disposalNature: 'DISPOSED OFF',
  caseNumber: 'CWJC/1234/2019',
  fullText: DOC,
};

describe('the gate — a model only ever sees what a rule refused', () => {
  it('selects the two methods that mean a rule declined to claim the row', () => {
    assert.equal(selectsForModel('unclassified_disposal:DISPOSED OFF'), true);
    assert.equal(selectsForModel('no_disposal_nature'), true);
  });

  it('REFUSES a row no rule has been run against — that is a backfill, not a hard case', () => {
    // The 3.6M rows measured 14 Aug 2026 with hc_class_method IS NULL. Sending
    // these to a model would pay tokens for what a regex answers exactly.
    assert.equal(selectsForModel(null), false);
    assert.equal(selectsForModel(undefined), false);
    assert.equal(selectsForModel(''), false);
  });

  it('refuses rows a rule already answered', () => {
    for (const m of ['disposal_nature_merits', 'disposal_nature_bail', 'below_stub_length']) {
      assert.equal(selectsForModel(m), false, m);
    }
  });
});

describe('span verification is the only correctness claim this module makes', () => {
  it('accepts a quote the document actually contains', () => {
    assert.equal(
      verifyEvidenceSpan(
        'the writ petition is rendered infructuous and is accordingly disposed of',
        DOC,
      ),
      'verified',
    );
  });

  it('accepts a quote whose whitespace the model normalised', () => {
    // PDF extraction keeps the original page's line breaks; a model asked to
    // quote will not. Rejecting these would discard good answers.
    assert.equal(
      verifyEvidenceSpan('the writ petition   is rendered\n\ninfructuous', DOC),
      'verified',
    );
  });

  it('REJECTS a fluent quote the document does not contain', () => {
    // The measured failure mode: 10.8% fabrication when the answer was absent.
    assert.equal(
      verifyEvidenceSpan('the appeal is allowed and the conviction is set aside', DOC),
      'span_not_found',
    );
  });

  it('accepts a quote whose word spacing the PDF or the model lost', () => {
    // Measured 14 Aug 2026: 1 of 8 refused spans was this checker's own fault —
    // "AllPetitionsaredisposedofintheseterms." The words were in the document.
    assert.equal(
      verifyEvidenceSpan('thewritpetitionisrenderedinfructuousandisaccordinglydisposedof', DOC),
      'verified',
    );
  });

  it('still rejects the 7-in-8 that were genuinely fabricated, spaces or not', () => {
    assert.equal(
      verifyEvidenceSpan(
        'theHighCourtisoftheopinionthatthesaidwritpetitionhasbecomeinfructuous',
        DOC,
      ),
      'span_not_found',
    );
  });

  it('rejects a quote too short to distinguish reading from guessing', () => {
    assert.equal(verifyEvidenceSpan('disposed of', DOC), 'span_too_short');
  });
});

describe('adjudicate refuses on every failure path, never falls back to a class', () => {
  it('keeps the class when the span verifies', () => {
    const raw = JSON.stringify({
      evidence: 'the writ petition is rendered infructuous and is accordingly disposed of',
      class: 'procedural_disposal',
      reasoning: 'The petition became infructuous, so nothing was decided on the merits.',
      confidence: 'high',
    });
    const out = adjudicate(input, raw);
    assert.equal(out.verdict, 'verified');
    assert.equal(out.documentClass, 'procedural_disposal');
  });

  it('DISCARDS the class when the span does not verify, even at high confidence', () => {
    // Confidence is recorded and never acted on: two of four measured
    // fabrications carried the model's own `high`.
    const raw = JSON.stringify({
      evidence: 'the appeal is allowed and the conviction is hereby set aside in full',
      class: 'decided',
      reasoning: 'The court allowed the appeal.',
      confidence: 'high',
    });
    const out = adjudicate(input, raw);
    assert.equal(out.verdict, 'span_not_found');
    assert.equal(out.documentClass, null, 'an unverified span must not leave a class behind');
    assert.equal(out.statedConfidence, 'high', 'the claim is still recorded, just not acted on');
  });

  it('treats cannot_determine as a real answer, not a failure', () => {
    const raw = JSON.stringify({
      evidence: 'x',
      class: 'cannot_determine',
      reasoning: 'silent',
      confidence: 'low',
    });
    const out = adjudicate(input, raw);
    assert.equal(out.verdict, 'cannot_determine');
    assert.equal(out.documentClass, null);
  });

  it('refuses a class that was never offered', () => {
    const raw = JSON.stringify({
      evidence: 'x'.repeat(40),
      class: 'interim_order',
      reasoning: '',
      confidence: 'high',
    });
    assert.equal(parseAdjudication(raw), null);
    assert.equal(adjudicate(input, raw).verdict, 'unparseable');
  });

  it('records a failed call as a failed call, not as an absent class', () => {
    assert.equal(adjudicate(input, null).verdict, 'call_failed');
  });

  it('parses JSON the model wrapped in a fenced block', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        evidence: 'a'.repeat(30),
        class: 'decided',
        reasoning: 'r',
        confidence: 'low',
      }) +
      '\n```';
    assert.equal(parseAdjudication(raw)?.documentClass, 'decided');
  });

  it('is stable: the same document hashes to the same key', () => {
    assert.equal(adjudicate(input, null).inputHash, adjudicate(input, null).inputHash);
    const other = adjudicate({ ...input, fullText: `${DOC} amended` }, null);
    assert.notEqual(adjudicate(input, null).inputHash, other.inputHash);
  });
});

describe('the text window shows the end, where the operative direction is', () => {
  it('sends a short document whole', () => {
    assert.equal(textWindow(DOC), DOC);
  });

  it('keeps BOTH ends of a long one — a head-only window never sees the outcome', () => {
    const long = `START${'x'.repeat(HEAD_CHARS + TAIL_CHARS + 5_000)}THE PETITION IS DISMISSED`;
    const w = textWindow(long);
    assert.ok(w.startsWith('START'));
    assert.ok(w.endsWith('THE PETITION IS DISMISSED'));
    assert.ok(w.length < long.length);
  });
});

describe('the prompt', () => {
  it('offers a way to say no — a prompt with no refusal asks for an invention', () => {
    assert.match(buildPrompt(input), /cannot_determine/);
    assert.match(buildPrompt(input), /CORRECT AND EXPECTED ANSWER/);
  });

  it('shows the registry word verbatim and says it is ambiguous', () => {
    assert.match(buildPrompt(input), /DISPOSED OFF/);
    assert.match(buildPrompt(input), /AMBIGUOUS/);
  });
});
