/**
 * NEW2 §8/NEW2-2 — SCORE A DESPATCH-STAMP GATE AGAINST THE CORPUS'S OWN
 * VOCABULARY, BEFORE PROPOSING IT.
 *
 * The census in `resolver-monthfuzz-census.json` is a CENSUS, not a sample:
 * every alphabetic token that occurs corpus-wide in the `dddd <ALPHA> dd` shape.
 * So a rule scored against it is exact for the corpus as it stands, and the file
 * doubles as the regression fixture for the next ingest.
 *
 * Scores two rules side by side:
 *   DEPLOYED   the three-letter prefix + [A-Z]* now live in resolver.ts and
 *              citation-keys-cli.ts
 *   PROPOSED   exact match on abbreviations, Damerau-Levenshtein <= 1 against
 *              the twelve full month names for tokens of length >= 4
 *
 * Damerau and not plain Levenshtein: ARPIL/APRIL is a TRANSPOSITION, which plain
 * Levenshtein scores 2 and would therefore miss.
 *
 * NO DATABASE. Pure, over a committed artefact.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FULL = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','SEPT','OCT','NOV','DEC'];
/* The ground truth. A token is a STAMP if it is a month word, correctly spelt or
 * not; every other token in the shape is a court code. Adjudicated by reading,
 * which is why the three misspellings are named rather than inferred. */
const MISSPELT = ['JANURARY','ARPIL','SEPTEMEBER'];
const STAMP_TOKENS = new Set([...FULL, ...ABBR, ...MISSPELT]);

function damerau(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

const DEPLOYED_RE = /^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$/;
const deployed = (token) => DEPLOYED_RE.test(`2011${token}05`);
/* MAY stays exact-only: at three characters a fuzzy match has no margin left. */
const proposed = (token) => ABBR.includes(token) || (token.length >= 4 && FULL.some((m) => damerau(token, m) <= 1));

const census = JSON.parse(readFileSync('docs/ai/new2/resolver-monthfuzz-census.json', 'utf8')).steps.alpha_token_census.rows;

const score = (name, fn) => {
  const r = { rule: name, refused_tokens: 0, kept_tokens: 0, refused_judgments: 0, kept_judgments: 0, false_positives: [], misses: [] };
  for (const row of census) {
    const isStamp = STAMP_TOKENS.has(row.token);
    const refuse = fn(row.token);
    if (refuse) { r.refused_tokens++; r.refused_judgments += row.judgments; } else { r.kept_tokens++; r.kept_judgments += row.judgments; }
    if (refuse && !isStamp) r.false_positives.push({ token: row.token, judgments: row.judgments });
    if (!refuse && isStamp) r.misses.push({ token: row.token, judgments: row.judgments });
  }
  return r;
};

/* Headroom. A rule with no margin is a rule waiting to fail on the next ingest. */
const headroom = census.filter((r) => !STAMP_TOKENS.has(r.token)).map((r) => {
  let best = Infinity, who = '';
  for (const m of FULL) { const d = damerau(r.token, m); if (d < best) { best = d; who = m; } }
  return { token: r.token, judgments: r.judgments, nearest_month: who, distance: best };
}).sort((a, b) => a.distance - b.distance);

const out = {
  generated_at: new Date().toISOString(),
  note: 'Scored against a CENSUS of every alphabetic token in the dddd<ALPHA>dd shape corpus-wide, not a sample. Exact for the corpus as it stands; re-run after any ingest that adds a court code.',
  tokens_examined: census.length,
  deployed: score('deployed prefix + [A-Z]*', deployed),
  proposed: score('abbrev exact + Damerau<=1 on full months (len>=4)', proposed),
  headroom_of_proposed_rule: headroom,
};
writeFileSync('docs/ai/new2/resolver-gate-score.json', JSON.stringify(out, null, 2));

for (const k of ['deployed', 'proposed']) {
  const s = out[k];
  console.log(`\n${s.rule}`);
  console.log(`  refused ${s.refused_tokens} tokens / ${s.refused_judgments} judgments`);
  console.log(`  kept    ${s.kept_tokens} tokens / ${s.kept_judgments} judgments`);
  console.log(`  FALSE POSITIVES ${s.false_positives.length} ${JSON.stringify(s.false_positives)}`);
  console.log(`  MISSES          ${s.misses.length} ${JSON.stringify(s.misses)}`);
}
console.log('\ntightest headroom:', JSON.stringify(headroom.slice(0, 3)));
console.log('wrote docs/ai/new2/resolver-gate-score.json');
