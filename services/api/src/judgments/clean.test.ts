/**
 * Cleaning retrieved text — and the line it must never cross.
 *
 * The client lane rendered `operativeParagraph` on a device and reported that
 * non-empty was not the same as usable: marginal reference letters stranded at
 * line ends, bracketed page pinpoints, words split across hard wraps. They
 * declined to set it behind an oxblood rule as the court's own words, which was
 * the right call.
 *
 * So the cleaner has two obligations and the second matters more than the first:
 * remove typesetting, and **never remove language**. Every test below that starts
 * "leaves" is guarding the second one. A cleaner that mangles a judgment to look
 * tidy is worse than raw text, because raw text is visibly raw and a mangled
 * quotation is not.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleanExtractedText, locateParagraph, trimToSentenceStart } from './paragraphs.ts';

describe('cleanExtractedText', () => {
  it('strips marginal reference letters stranded at the end of wrapped prose', () => {
    const raw = [
      'and curtails the authority of Custom Officers D',
      'from exercising statutory power to arrest a person said',
      'to have committed a non-bailable offence by imposing a E',
    ].join('\n');
    const out = cleanExtractedText(raw);
    assert.ok(!/Officers D/.test(out), `margin letter survived: ${out}`);
    assert.ok(/authority of Custom Officers/.test(out));
    assert.ok(/imposing a$|imposing a\b/.test(out.trim()), out);
  });

  it('leaves a short line that genuinely ends in a capital', () => {
    // "Shri A" is a name, not typesetting. The length guard is what saves it.
    const raw = 'Shri A';
    assert.equal(cleanExtractedText(raw), 'Shri A');
  });

  it('leaves a sentence that ends in a capitalised word', () => {
    const raw =
      'The appellant was convicted under the provisions of the Act and sentenced by the High Court';
    assert.equal(cleanExtractedText(raw), raw);
  });

  it('removes reporter page pinpoints, which address paper and not law', () => {
    const raw = 'warranted by law. [Paras 63 and 64] [205,F; 205,D-E]';
    const out = cleanExtractedText(raw);
    assert.equal(out, 'warranted by law.');
  });

  it('repairs a word broken across a hard wrap', () => {
    const raw = 'the accused was granted condi-\ntional bail by the learned Sessions Judge';
    const out = cleanExtractedText(raw);
    assert.ok(/conditional bail/.test(out), out);
  });

  it('leaves a genuine hyphenated compound alone', () => {
    // Uppercase on the far side means it is a compound, not a wrap artefact.
    const raw = 'the Union-\nTerritory of Delhi was impleaded as a party to these proceedings';
    const out = cleanExtractedText(raw);
    assert.ok(/Union-\s*Territory/.test(out), out);
  });

  it('joins a wrapped sentence but keeps a real paragraph break', () => {
    const raw = [
      'The question that arises for consideration',
      'is whether the bail was rightly',
    ].join('\n');
    assert.equal(
      cleanExtractedText(raw),
      'The question that arises for consideration is whether the bail was rightly',
    );

    const twoSentences = 'The appeal is allowed.\nThe order is set aside.';
    // A line ending in a full stop keeps its break — these are separate statements.
    assert.ok(cleanExtractedText(twoSentences).includes('\n'), 'sentence break was swallowed');
  });

  it('drops whole-line furniture and extraction debris', () => {
    const raw = [
      'A B C D E F G H',
      '205',
      'SUPREME COURT REPORTS [2008] 13 S.C.R.',
      '-{',
      'Anticipatory bail means a bail in anticipation of arrest.',
    ].join('\n');
    assert.equal(
      cleanExtractedText(raw),
      'Anticipatory bail means a bail in anticipation of arrest.',
    );
  });

  it('never invents text — output is only ever a subset of the input words', () => {
    // The strongest guard available: cleaning may delete and may join, but no
    // rule may introduce a word that was not in the source.
    const raw = [
      'A B C',
      '12. The learned counsel for the appellant submitted that the convic- E',
      'tion cannot be sustained on the evidence of a single witness. [Paras 4, 5]',
      '206',
    ].join('\n');
    const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);
    const before = words(raw);
    for (const w of words(cleanExtractedText(raw))) {
      // `conviction` is legitimately formed by repairing `convic-\ntion`.
      if (w === 'conviction') continue;
      assert.ok(before.has(w), `cleaner introduced the word "${w}"`);
    }
  });
});

describe('locateParagraph', () => {
  const judgment = [
    'A B C D E F G H',
    'IN THE SUPREME COURT OF INDIA',
    '1. This appeal arises out of an order of the High Court refusing bail.',
    '2. The prosecution case is that the appellant was found in possession of',
    'a commercial quantity of a narcotic substance on the night in question.',
    '3. Having heard learned counsel, we are of the view that the appeal must',
    'succeed for the reasons that follow.',
  ].join('\n');

  it('maps a retrieved chunk back to the paragraph the court numbered', () => {
    const chunk =
      'prosecution case is that the appellant was found in possession of a commercial quantity';
    const p = locateParagraph(judgment, chunk);
    assert.ok(p, 'chunk should have been located');
    assert.equal(p!.paragraphNumber, 2);
    assert.ok(p!.text.includes('narcotic substance'));
  });

  it('returns null rather than guessing when the chunk is not in the text', () => {
    const p = locateParagraph(judgment, 'a passage that appears nowhere in this judgment at all');
    assert.equal(p, null);
  });

  it('returns null for a chunk too short to identify anything', () => {
    assert.equal(locateParagraph(judgment, 'bail'), null);
  });

  it('refuses a block too large to be a paragraph, because that is a failed segmentation', () => {
    // A judgment whose numbering cannot be read segments into one huge block.
    // Measured on the corpus: 65,689 characters for Sushila Aggarwal, 19,109 for
    // Enforcement Directorate v. Kapil Wadhawan. Showing either as "the
    // paragraph" would be worse than admitting we could not find one.
    const unnumbered = `IN THE SUPREME COURT OF INDIA\n${'the appellant contends that the order is unsustainable. '.repeat(120)}`;
    const chunk = 'the appellant contends that the order is unsustainable';
    const p = locateParagraph(unnumbered, chunk);
    assert.equal(p, null, 'a multi-thousand-character block is not a paragraph');
  });

  it('drops a running head that carries its page number on the same line', () => {
    // "918 SUPREME COURT REPORTS [2023] 5 S.C.R." survived the whole-line rule
    // because of the leading page number, and reached a rendered result.
    const raw = '918 SUPREME COURT REPORTS [2023] 5 S.C.R.\nThe appeal is allowed.';
    assert.equal(cleanExtractedText(raw), 'The appeal is allowed.');
  });
});

describe('trimToSentenceStart', () => {
  it('drops a mid-word opening, which a chunk routinely has', () => {
    const raw =
      'ion to arrest without warrant the applicant. Where the Court grants an interim order it shall cause notice to issue.';
    const out = trimToSentenceStart(raw);
    assert.ok(out.startsWith('Where the Court'), out);
  });

  it('leaves text that already begins at a sentence', () => {
    const raw = 'The appeal is allowed and the order under challenge is set aside.';
    assert.equal(trimToSentenceStart(raw), raw);
  });

  it('returns the text untouched rather than cutting at a guess', () => {
    // No sentence boundary in the leading window — cutting would invent one.
    const raw = 'a very long clause without any terminal punctuation at all in its opening stretch';
    assert.equal(trimToSentenceStart(raw), raw);
  });
});
