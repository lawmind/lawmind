/**
 * Reproduce `runAdversarial`'s worst-of-N and KEEP the failing answer text.
 *
 * `AdversarialResult` carries `{id, passed, failures}` and no answer, so a 20%
 * pass rate cannot be read. "Reproduced the documented wrong answer" and
 * "refused correctly but missed a word the grader requires" are a product
 * emergency and a grader nit respectively, and the rate cannot tell them apart.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { generate } from '../services/harness/src/generate.ts';
import { gradeCase } from '../services/harness/src/adversarial.ts';

const raw = await readFile('services/harness/src/fixtures/adversarial.json', 'utf8');
const { cases } = JSON.parse(raw);
const REPEATS = Number(process.env.REPEATS ?? 5);

const out = [];
for (const c of cases) {
  const samples = [];
  for (let i = 0; i < REPEATS; i++) {
    const g = await generate(c.prompt, []);
    const v = gradeCase(c, g.answer, g.citedIds);
    samples.push({ passed: v.passed, failures: v.failures, answer: g.answer, citedIds: g.citedIds });
  }
  const failed = samples.filter((s) => !s.passed);
  const worst = failed.length
    ? failed.reduce((a, b) => (b.failures.length > a.failures.length ? b : a))
    : samples[0];
  out.push({
    id: c.id,
    passedAll: failed.length === 0,
    failedSamples: failed.length,
    repeats: REPEATS,
    worstFailures: worst.failures,
    worstAnswer: worst.answer,
    worstCitedIds: worst.citedIds,
    mustNotProduce: c.pass.mustNotProduce ?? [],
    refusalMustMention: c.pass.refusalMustMention ?? [],
  });
  console.log(
    `${c.id.padEnd(34)} ${failed.length}/${REPEATS} samples failed` +
      (failed.length ? `  worst: ${worst.failures.join(' | ')}` : ''),
  );
}

const rate = out.filter((o) => o.passedAll).length / out.length;
console.log(`\nworst-of-${REPEATS} adversarialPassRate ${(rate * 100).toFixed(1)}%   threshold 100%`);
console.log('\n' + '='.repeat(78));
for (const o of out) {
  if (o.passedAll) continue;
  console.log(`\n### ${o.id}  — ${o.failedSamples}/${o.repeats} failed`);
  console.log('failures :', o.worstFailures.join(' | '));
  console.log('cited    :', o.worstCitedIds.length ? o.worstCitedIds.join(', ') : '(none)');
  console.log('answer   :', o.worstAnswer.slice(0, 900));
}
await writeFile('docs/ai/new1-post-0055/adversarial-answers.json', JSON.stringify({ createdAt: new Date().toISOString(), repeats: REPEATS, passRate: rate, cases: out }, null, 2));
console.log('\nwrote docs/ai/new1-post-0055/adversarial-answers.json');
