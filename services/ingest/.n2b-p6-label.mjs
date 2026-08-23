/**
 * NEW2 P6 — the labels, and what they do and do not support.
 *
 * All 80 frame documents were read as primary text. A document is
 * SUBSTANTIVE_DECISION only if the court decided a contested question on its
 * merits and gave a reason another case could use. Fact-bound bail, withdrawal,
 * default, condonation, adjournment, compliance, restoration, correction of the
 * record and "consider the representation" directions are PROCEDURAL, however
 * carefully written — they dispose of a matter without deciding a question of
 * law.
 *
 * The held-out half was labelled only after the train half had been read and the
 * candidate signals written down.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'docs/ai/new2/uncited-authority-frame.json';
const frame = JSON.parse(readFileSync(PATH, 'utf8'));

/** seq -> [label, reason]. Everything not named here is PROCEDURAL. */
const SUBSTANTIVE = {
  23: 'states a rule of general application — "no institution can claim as of right that it be appointed Examination Centre" — though the petition itself is disposed with liberty',
  40: 'writ ALLOWED on the merits: respondents directed to reimburse, on a reasoned finding that ILS Hospital is a recognised referral hospital',
  72: 'reasons on what a detaining authority must consider before passing a detention order, then discharges the rule — a statement of law, not a disposal',
};
/** Read, considered, and deliberately NOT counted as substantive. Recorded so the
 *  line is auditable rather than implicit. */
const BORDERLINE = {
  31: 'applies the settled "a litigant should not suffer for counsel\'s mistake" principle to restore a matter — an application of law, not a decision of one',
  36: 'protection order for a married couple; the document itself is stamped "Whether reportable? Yes / reasoned/speaking? Yes", and it is still a routine order',
  60: 'contempt rejected after inspecting a restoration report — a reasoned finding, entirely on these facts',
};

let sub = 0;
let border = 0;
for (const d of frame.documents) {
  if (SUBSTANTIVE[d.seq]) {
    d.label = 'SUBSTANTIVE_DECISION';
    d.label_reason = SUBSTANTIVE[d.seq];
    sub += 1;
  } else if (BORDERLINE[d.seq]) {
    d.label = 'PROCEDURAL_BORDERLINE';
    d.label_reason = BORDERLINE[d.seq];
    border += 1;
  } else {
    d.label = 'PROCEDURAL';
    d.label_reason = null;
  }
  // The text is dropped from the labelled artifact: it is 80 judgments' worth of
  // corpus already held in the database, and the artifact is about the labels.
  d.text_head = d.text.slice(0, 180);
  delete d.text;
}

function wilson(k, n) {
  if (!n) return [0, 0];
  const p = k / n; const z = 1.96; const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [+((c - h) * 100).toFixed(2), +((c + h) * 100).toFixed(2)];
}

const train = frame.documents.filter((d) => d.split === 'train');
const held = frame.documents.filter((d) => d.split === 'heldout');
const subIn = (xs) => xs.filter((d) => d.label === 'SUBSTANTIVE_DECISION').length;

frame.labelled_at = new Date().toISOString();
frame.labelling_rule =
  'SUBSTANTIVE_DECISION = the court decided a contested question on its merits and gave a reason another case could use. Fact-bound bail, withdrawal, default, condonation, adjournment, compliance, restoration, record correction and consider-the-representation directions are PROCEDURAL.';
frame.result = {
  n: frame.documents.length,
  substantive: sub,
  procedural_borderline: border,
  procedural: frame.documents.length - sub - border,
  base_rate_pct: +((sub / frame.documents.length) * 100).toFixed(2),
  base_rate_ci95: wilson(sub, frame.documents.length),
  train: { n: train.length, substantive: subIn(train), pct: +((subIn(train) / train.length) * 100).toFixed(2) },
  heldout: { n: held.length, substantive: subIn(held), pct: +((subIn(held) / held.length) * 100).toFixed(2) },
  upper_bound_if_borderline_counted_pct: +(((sub + border) / frame.documents.length) * 100).toFixed(2),
  upper_bound_ci95: wilson(sub + border, frame.documents.length),
};
writeFileSync(PATH, JSON.stringify(frame, null, 1));
console.log(JSON.stringify(frame.result, null, 1));
