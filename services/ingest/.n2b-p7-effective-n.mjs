/**
 * NEW2 P7 — ADVOCATE-100 maintenance, and one metadata defect NEW1 found.
 *
 * The summary reports `distinct_target_judgments: 281`. NEW1 (bus 1049) read
 * that number and pointed out what it hides: **253 of the 281 are carried by ONE
 * task.** A100-007 is a neutral citation naming a 253-judgment disposal event —
 * a deliberate and correct construction, and the whole point of that task. But
 * it means every per-authority statistic over this gold has an effective n of
 * **27**, not 281, and a reader who does not open the file cannot see that.
 *
 * The number is not wrong. The number is misleading on its own, which is the
 * same defect class as `decided_brief`'s 15.6% and per-class accuracy. So the
 * summary now carries both, with the concentration named.
 *
 * NOT DONE HERE, deliberately: nothing about leakage. The founder's rule is that
 * I do not grade my own leakage, and the fifth agent's audit has not returned.
 * `leakage_failures: 0` is left exactly as it was, unverified by me.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'docs/ai/new2/ADVOCATE100.json';
const gold = JSON.parse(readFileSync(PATH, 'utf8'));

const ids = (t) => (t.targets_bound ?? []).map((x) => x.judgment_id).filter(Boolean);
const perTask = gold.tasks.map((t) => ({ task_id: t.task_id, n: ids(t).length }));
const all = new Set();
for (const t of gold.tasks) for (const id of ids(t)) all.add(id);

const sorted = [...perTask].sort((a, b) => b.n - a.n);
const biggest = sorted[0];
const withoutBiggest = new Set();
for (const t of gold.tasks) {
  if (t.task_id === biggest.task_id) continue;
  for (const id of ids(t)) withoutBiggest.add(id);
}

gold.summary.distinct_target_judgments = all.size;
gold.summary.target_concentration = {
  distinct_target_judgments: all.size,
  carried_by_the_single_largest_task: biggest.n,
  largest_task: biggest.task_id,
  distinct_targets_excluding_it: withoutBiggest.size,
  effective_n_for_per_authority_statistics: withoutBiggest.size,
  why: `${biggest.task_id} is a neutral citation naming a disposal event — ${biggest.n} connected matters disposed by one common order, each printing that citation on its own PDF. Binding all of them is correct and is the point of the task. It also means any per-authority rate over this gold has an effective n of ${withoutBiggest.size}. Both numbers are published so neither can be quoted alone. Raised by NEW1, bus 1049.`,
};
gold.summary.instrument_limits = [
  'The substantive authorities in this set are LANDMARKS: long, classified `decided`, and cited by everything. A gold made of landmarks reports ZERO uncited-authority bias however large the bias is (NEW1 bus 1049, accepted). Do not read a clean result here as evidence about the corpus.',
  'The 6 LONG_FACT_PATTERN / PASTED_PASSAGE tasks stay in the set while unexecutable. A task removed for being unsupported stops measuring the thing that is unsupported.',
  'Leakage is NOT self-graded. `leakage_failures` is the author\'s own measurement and awaits the fifth agent\'s independent audit.',
];

const dateStates = {};
for (const t of gold.tasks) {
  for (const b of t.targets_bound ?? []) {
    const s = b.date_state ?? 'NOT_ANALYSED';
    dateStates[s] = (dateStates[s] ?? 0) + 1;
  }
}
gold.summary.date_states_across_targets = dateStates;
gold.summary.date_state_note =
  'Counted over target BINDINGS, not distinct judgments, so the 253-member disposal event dominates NOT_ANALYSED. Currentness-critical tasks carry `date_requirement_resolved` individually.';

writeFileSync(PATH, JSON.stringify(gold, null, 1));
console.log(JSON.stringify(gold.summary.target_concentration, null, 1));
console.log('date states:', JSON.stringify(dateStates));
