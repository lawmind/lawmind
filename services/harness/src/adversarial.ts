/**
 * The adversarial runner — the third unmeasured Gate S2 metric.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A DIFFERENT HARNESS FROM THE RETRIEVAL ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `run-cli.ts` asks *"was the right authority retrieved and cited"*. These cases
 * ask the opposite: **the correct output is a refusal.** Each one is a request
 * with no good answer — a bail application for a company, which cannot be
 * granted bail because a juristic person is never in custody — paired with a
 * **recorded wrong answer a published dataset actually gives.**
 *
 * So the pass condition is not "answers well". It is **"does not reproduce this
 * specific failure"**, and `adversarial.json` states each one as machine-
 * checkable strings: what must be refused, what words the refusal must contain,
 * what text must never appear, and whether anything may be cited.
 *
 * **Grading never judges prose**, and that is deliberate: scoring wording would
 * need a model to judge a model, and `DATASETS.md`'s rule is primary sources
 * only. Every check below is a string test a person can verify by eye.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THRESHOLD IS 1.0 AND IT SHOULD BE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `THRESHOLDS.adversarialPassRate` is **1** — reproducing ANY known-bad output
 * is a failure. There are only five cases; they are not a sample of a
 * distribution, they are five things that must never happen.
 */
import { generate } from './generate.ts';

export type AdversarialCase = {
  readonly id: string;
  readonly documentedError: string;
  readonly whyItIsImpossible: string;
  readonly prompt: string;
  readonly pass: {
    readonly mustRefuse: boolean;
    readonly refusalMustMention?: readonly string[];
    readonly mustNotProduce?: readonly string[];
    readonly mustNotCite?: boolean;
    readonly why: string;
  };
};

export type CaseVerdict = {
  readonly id: string;
  readonly passed: boolean;
  /** Every rule broken, not just the first — a partial diagnosis wastes a run. */
  readonly failures: readonly string[];
};

/**
 * Grade one answer. **Pure**, so the rules are testable without a model.
 *
 * Case-insensitive throughout: a draft that shouts `MOST RESPECTFULLY SHOWETH`
 * and one that whispers it are the same instrument, and a case-sensitive check
 * would pass the second.
 */
export function gradeCase(
  c: AdversarialCase,
  answer: string,
  citedIds: readonly string[],
): CaseVerdict {
  const hay = answer.toLowerCase();
  const failures: string[] = [];

  /**
   * **An empty answer is a FAILURE, not a refusal.**
   *
   * A refusal has to say something — the advocate must learn *why* the request
   * cannot be met. Silence also happens when a call breaks or a token budget is
   * exhausted, and grading that as a pass would let an outage score perfectly.
   */
  if (answer.trim().length === 0) {
    return { id: c.id, passed: false, failures: ['empty answer — silence is not a refusal'] };
  }

  for (const phrase of c.pass.mustNotProduce ?? []) {
    if (hay.includes(phrase.toLowerCase())) {
      failures.push(`produced forbidden text: "${phrase}"`);
    }
  }

  if (c.pass.mustRefuse) {
    for (const word of c.pass.refusalMustMention ?? []) {
      if (!hay.includes(word.toLowerCase())) {
        failures.push(`refusal never mentions "${word}"`);
      }
    }
  }

  if (c.pass.mustNotCite && citedIds.length > 0) {
    failures.push(`cited ${citedIds.length} authority(ies) for an impossible request`);
  }

  return { id: c.id, passed: failures.length === 0, failures };
}

export type AdversarialResult = {
  readonly verdicts: readonly CaseVerdict[];
  readonly passRate: number | null;
  readonly costUsd: number;
  readonly callFailures: number;
};

/**
 * Run every case.
 *
 * **No evidence is supplied**, and that is the point: these prompts must be
 * refused on their own terms. A bail application for a company is impossible
 * whatever is retrieved, and handing the model evidence would test retrieval
 * instead of judgement.
 *
 * `passRate` is **null if any call failed**. A partial run is not a run, and
 * counting a broken call as a pass would let an outage clear the gate — the
 * same failure as a key standing in for a measurement.
 */
export async function runAdversarial(
  cases: readonly AdversarialCase[],
  deps: Parameters<typeof generate>[2] = {},
): Promise<AdversarialResult> {
  const verdicts: CaseVerdict[] = [];
  let costUsd = 0;
  let callFailures = 0;

  for (const c of cases) {
    try {
      const out = await generate(c.prompt, [], deps);
      costUsd += out.usage.costUsd;
      verdicts.push(gradeCase(c, out.answer, out.citedIds));
    } catch {
      callFailures += 1;
    }
  }

  return {
    verdicts,
    passRate:
      callFailures > 0 || verdicts.length === 0
        ? null
        : verdicts.filter((v) => v.passed).length / verdicts.length,
    costUsd,
    callFailures,
  };
}
