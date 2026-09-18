/**
 * The post-migration correctness gate — grading logic, with no database in it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS GATE IS FOR, AND THE ONE THING IT REFUSES TO CONFLATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The corpus moved from Railway Postgres to a local cluster. A dump-and-restore
 * is supposed to be a null operation on meaning, so the gate asks one question
 * per check: **did this row/answer/span survive byte-identically?**
 *
 * It deliberately does NOT ask whether anything got faster. LCC recorded the
 * infrastructure differences in advance — `random_page_cost` 4.0 on Railway
 * against 1.1 locally, a different collation provider — and both legitimately
 * move ranking and latency. So:
 *
 *   CORRECTNESS is graded here and blocks the gate.
 *   PERFORMANCE is recorded as INFO and blocks nothing.
 *
 * An `INFO` verdict is not a soft failure and must never be counted as one. It
 * is a number worth carrying to the next measurement, recorded at the moment it
 * was cheap to take.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE GRADERS LIVE HERE AND NOT IN THE CLI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every function below is pure, so the gate's own judgement can be tested
 * without a database — including the failures, which is the half that never
 * gets exercised against real data. LCC lost time on exactly this trap in
 * `scripts/migration/smoke.mjs`: *"a test that has only ever run against the
 * database it is judging cannot tell 'the target is broken' from 'the test is
 * wrong'."* A grader with a unit test for its FAIL branch has at least been
 * seen to fail on purpose once.
 */
import type { StructuredOutcome } from '@lawmind/api/search/structured';

// ─────────────────────────────────────────────────────────────────────────────
// The eight required classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named by the letters the post-migration directive used, so a report line and
 * the instruction that asked for it can be matched without a translation table.
 */
export const CHECK_CLASSES = {
  A: 'citation identity',
  B: 'ambiguous citation behaviour',
  C: 'adverse / currentness',
  D: 'exact evidence',
  E: 'duplicate collapse',
  F: 'sparse / dense / hybrid behaviour',
  G: 'paragraph fallback',
  H: 'generated full-text-search column behaviour',
} as const;

export type CheckClass = keyof typeof CHECK_CLASSES;

/**
 * `INFO` is a first-class verdict, not a skipped `PASS`.
 *
 * Two different things wear it: a measurement that is expected to move
 * (latency, a query plan) and a probe whose subject does not exist in this
 * corpus. Both are honest, neither blocks, and collapsing either into `PASS`
 * would let an un-run check read as a green one — the failure mode that made
 * `deployed-judgment-safety.ts` spell its "nothing to probe" reason out loud.
 */
export type Verdict = 'PASS' | 'FAIL' | 'INFO';

export type Check = {
  readonly cls: CheckClass;
  readonly id: string;
  readonly verdict: Verdict;
  /** What was being asserted, phrased so a FAIL line explains itself alone. */
  readonly detail: string;
  readonly expected?: string;
  readonly actual?: string;
  /** Wall-clock for this check, when it is worth carrying. Never graded. */
  readonly ms?: number;
};

export function check(
  cls: CheckClass,
  id: string,
  verdict: Verdict,
  detail: string,
  extra: { expected?: string; actual?: string; ms?: number } = {},
): Check {
  return { cls, id, verdict, detail, ...extra };
}

export type GateReport = {
  readonly ranAt: string;
  readonly databaseHost: string;
  /** Unique by `cls`+`id`. See `dedupeChecks`. */
  readonly checks: readonly Check[];
  readonly passed: boolean;
  readonly counts: { pass: number; fail: number; info: number };
  /**
   * `cls/id` keys that appeared more than once before collapsing. Present only
   * when something WAS collapsed, so its absence is not a claim of anything.
   */
  readonly collapsed?: readonly string[];
};

/**
 * Collapse entries that share a `cls`+`id`, keeping the LAST one written.
 *
 * **Measured on this repo, 17 Aug 2026.** The accumulated gate artefact carried
 * 65 entries for 57 distinct checks: eight `span-retrieval-hybrid-*` ids twice
 * over, byte-identical. The cause is a mismatch between the class a check is
 * TAGGED with and the stage that PRODUCES it — `spansFromResults` emits
 * `cls: 'D'` from inside the E/F stage, and `classG` emits
 * `paragraph-fallback-span` as `cls: 'D'` too. The CLI's resume logic carries
 * prior checks whose class was not re-run, so a run of `--only A,B,E,F` carries
 * D forward AND re-emits half of it, and the count is then arithmetically true
 * over the wrong set.
 *
 * The number mattered more than the duplication: `counts.pass = 60` was about
 * to be published as the migration verdict. Deduplicating here rather than at
 * the call site means every writer of this report — the per-stage checkpoint and
 * the final summary alike — counts the same set.
 *
 * LAST wins, not first: a re-run exists to supersede an earlier grade, so the
 * freshest observation is the one that must survive.
 */
export function dedupeChecks(checks: readonly Check[]): {
  readonly unique: readonly Check[];
  readonly collapsed: readonly string[];
} {
  const byKey = new Map<string, Check>();
  const collapsed: string[] = [];
  for (const c of checks) {
    const key = `${c.cls}/${c.id}`;
    if (byKey.has(key)) collapsed.push(key);
    byKey.set(key, c);
  }
  return { unique: [...byKey.values()], collapsed: [...new Set(collapsed)].sort() };
}

/**
 * A gate passes only when nothing FAILED. `INFO` is neutral by construction.
 *
 * Counts are over UNIQUE checks. A check graded twice is one check, however many
 * times it was written.
 */
export function summarise(
  ranAt: string,
  databaseHost: string,
  checks: readonly Check[],
): GateReport {
  const { unique, collapsed } = dedupeChecks(checks);
  const counts = {
    pass: unique.filter((c) => c.verdict === 'PASS').length,
    fail: unique.filter((c) => c.verdict === 'FAIL').length,
    info: unique.filter((c) => c.verdict === 'INFO').length,
  };
  return {
    ranAt,
    databaseHost,
    checks: unique,
    passed: counts.fail === 0,
    counts,
    ...(collapsed.length > 0 ? { collapsed } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RAILWAY REFUSAL — the first thing that runs, before any connection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hosts this gate will connect to. Nothing else, ever.
 *
 * **An allowlist, not a Railway denylist**, and the difference is the whole
 * point. A denylist of `railway` / `rlwy` / `proxy.rlwy.net` passes the moment
 * the rollback copy is reachable under any other name — a new proxy hostname, a
 * tunnel, an IP. The standing instruction is that NEW1 makes zero Railway
 * queries; the only way to enforce that from inside this process is to refuse
 * every host that is not demonstrably this machine.
 *
 * The literal Railway substrings are still checked, separately, so that the
 * refusal message can name what it saw instead of saying "not localhost".
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** Named purely so a refusal can say WHICH forbidden thing it recognised. */
const RAILWAY_MARKERS = ['railway', 'rlwy.net', 'rlwy', 'proxy.rlwy'];

export type UrlVerdict =
  | { readonly ok: true; readonly host: string }
  | { readonly ok: false; readonly host: string | null; readonly reason: string };

/**
 * Decide whether a connection string may be used.
 *
 * Takes the ENV VAR NAME as well as the value, because one of the forbidden
 * targets is identified by name rather than by host: `DATABASE_PUBLIC_URL` is
 * Railway's own public-proxy variable, and a gate that only inspected the value
 * would happily use it the day someone points it at a copy.
 */
export function classifyDatabaseUrl(url: string | undefined, varName = 'DATABASE_URL'): UrlVerdict {
  if (!url || url.trim() === '') {
    return { ok: false, host: null, reason: `${varName} is not set` };
  }
  if (/DATABASE_PUBLIC_URL/i.test(varName)) {
    return {
      ok: false,
      host: null,
      reason: `${varName} is Railway's public proxy variable and is forbidden regardless of where it points`,
    };
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, host: null, reason: `${varName} is not a parseable URL` };
  }

  const marker = RAILWAY_MARKERS.find((m) => host.toLowerCase().includes(m));
  if (marker) {
    return {
      ok: false,
      host,
      reason: `${varName} points at ${host} — that is the Railway rollback copy (matched "${marker}"). NEW1 makes zero Railway queries.`,
    };
  }
  if (!LOCAL_HOSTS.has(host.toLowerCase())) {
    return {
      ok: false,
      host,
      reason: `${varName} points at ${host}, which is not this machine. This gate runs against the migrated LOCAL cluster only.`,
    };
  }
  return { ok: true, host };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS A / B — citation identity and ambiguity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The in-process equivalent of `deployed-safety.ts`'s "no `parsed` field"
 * signature.
 *
 * Over HTTP, a `cite:` query that bypassed the structured path is recognised by
 * a missing `parsed` field. In process there is no envelope to inspect — the
 * same bypass shows up as `answerStructured` returning `not_structured`, which
 * means the caller would have fallen through to semantic search and returned a
 * plausible different case. Same defect, different tell.
 */
function structuredPathTaken(
  outcome: StructuredOutcome,
): outcome is Exclude<StructuredOutcome, { kind: 'not_structured' }> {
  return outcome.kind !== 'not_structured';
}

function describe(outcome: StructuredOutcome): string {
  switch (outcome.kind) {
    case 'matched':
    case 'ambiguous':
      return `${outcome.kind} (total ${outcome.total}, ${outcome.hits.length} hit(s))`;
    case 'no_match':
      return 'no_match';
    case 'invalid':
      return `invalid at offset ${outcome.offset}: ${outcome.message}`;
    case 'not_structured':
      return 'not_structured';
    /**
     * `timed_out` and `unbounded` were added to `StructuredOutcome` after this
     * gate was written, and nothing here knew. The switch had no arm for them,
     * so `describe()` returned `undefined` while its signature promised a
     * string, and the AMBIGUOUS arm below read `.hits` off a variant that has
     * none — a TypeError inside the probe that grades the citation path.
     *
     * Both are `coverage_unknown`: the structured arm was attempted and did not
     * finish. That is neither "resolved to the right judgment" nor "fell
     * through to semantic search", and the gate must say which it saw.
     */
    case 'timed_out':
      return 'timed_out (the structured arm did not finish)';
    case 'unbounded':
      return `unbounded (rarest df ${outcome.rarestDf})`;
  }
}

/**
 * Class A. A citation printed on a judgment we hold must resolve to THAT
 * judgment id and no other.
 *
 * Graded on the id, not the title — see the fixture file's own note. This
 * migration copies rows; a new id for the same case is a defect, and grading on
 * the title would hide it behind a name that matched.
 */
export function gradeCitationIdentity(
  id: string,
  citation: string,
  expectedJudgmentId: string,
  outcome: StructuredOutcome,
  ms?: number,
): Check {
  const opts = {
    expected: expectedJudgmentId,
    actual: describe(outcome),
    ...(ms === undefined ? {} : { ms }),
  };
  if (!structuredPathTaken(outcome)) {
    return check(
      'A',
      id,
      'FAIL',
      `cite:"${citation}" was not treated as a structured query — the forbidden fall-through to semantic search`,
      opts,
    );
  }
  if (outcome.kind === 'invalid') {
    return check('A', id, 'FAIL', `cite:"${citation}" failed to parse post-migration`, opts);
  }
  if (outcome.kind === 'no_match') {
    return check(
      'A',
      id,
      'FAIL',
      `cite:"${citation}" resolved to nothing — the judgment it identifies was in the pre-migration corpus`,
      opts,
    );
  }
  if (outcome.kind === 'ambiguous') {
    return check(
      'A',
      id,
      'FAIL',
      `cite:"${citation}" became AMBIGUOUS post-migration — it identified exactly one judgment before`,
      {
        ...opts,
        actual: `${describe(outcome)} → ${outcome.hits.map((h) => h.judgmentId).join(', ')}`,
      },
    );
  }
  /**
   * Before the `.hits` read, because these two variants do not have it. A
   * citation query that times out or refuses as unbounded has NOT been shown
   * safe: the one thing this gate exists to prove is that a structured citation
   * resolved to the expected judgment, and an arm that never finished proves
   * nothing either way. It is a FAIL with its own reason rather than a crash.
   */
  if (outcome.kind === 'timed_out' || outcome.kind === 'unbounded') {
    return check(
      'A',
      id,
      'FAIL',
      `cite:"${citation}" did not complete post-migration (${outcome.kind}) — coverage is unknown, which is not proof the citation still resolves`,
      opts,
    );
  }
  const ids = outcome.hits.map((h) => h.judgmentId);
  if (!ids.includes(expectedJudgmentId)) {
    return check('A', id, 'FAIL', `cite:"${citation}" resolved to a DIFFERENT judgment`, {
      ...opts,
      actual: ids.join(', ') || '(no hits)',
    });
  }
  return check(
    'A',
    id,
    'PASS',
    `cite:"${citation}" resolves to the same judgment id as before`,
    opts,
  );
}

/**
 * Class B. `cite:"2020 INSC 189"` matches three real Supreme Court judgments,
 * and must keep saying so.
 *
 * **Both directions are failures and for different reasons.** Collapsing to
 * `matched` presents one of three cases as the answer — a confident wrong
 * answer, the thing this product cannot afford. Collapsing to `no_match` means
 * rows were lost in the migration. The gate reports which.
 */
export function gradeAmbiguous(
  id: string,
  citation: string,
  outcome: StructuredOutcome,
  ms?: number,
): Check {
  const opts = {
    expected: 'ambiguous, ≥2 real judgments',
    actual: describe(outcome),
    ...(ms === undefined ? {} : { ms }),
  };
  if (!structuredPathTaken(outcome)) {
    return check('B', id, 'FAIL', `cite:"${citation}" fell through to semantic search`, opts);
  }
  if (outcome.kind === 'ambiguous' && outcome.total >= 2) {
    return check(
      'B',
      id,
      'PASS',
      `cite:"${citation}" is still flagged ambiguous across ${outcome.total} judgments`,
      opts,
    );
  }
  if (outcome.kind === 'matched') {
    return check(
      'B',
      id,
      'FAIL',
      `cite:"${citation}" collapsed to a single confident answer — ambiguity is what stops one of several cases being served as THE case`,
      opts,
    );
  }
  return check(
    'B',
    id,
    'FAIL',
    `cite:"${citation}" no longer resolves to the judgments it did`,
    opts,
  );
}

/** Class B's other half: a citation that cannot exist must return nothing. */
export function gradeNoMatch(
  id: string,
  citation: string,
  outcome: StructuredOutcome,
  ms?: number,
): Check {
  const opts = {
    expected: 'no_match',
    actual: describe(outcome),
    ...(ms === undefined ? {} : { ms }),
  };
  if (!structuredPathTaken(outcome)) {
    return check('B', id, 'FAIL', `cite:"${citation}" fell through to semantic search`, opts);
  }
  if (outcome.kind === 'no_match') {
    return check('B', id, 'PASS', `cite:"${citation}" correctly returns nothing`, opts);
  }
  return check(
    'B',
    id,
    'FAIL',
    `cite:"${citation}" cannot identify any real judgment, yet returned results`,
    opts,
  );
}

/**
 * Class A, the named probe. Graded on the TITLE, not an id, and that is
 * deliberate rather than an inconsistency with the fixtures above:
 * `cite:"(1994) 3 SCC 1"` → S.R. Bommai is `deployed-safety.ts`'s own standing
 * case, its literal is stable forever, and no pre-migration id for it was ever
 * captured. Reusing the existing expectation beats inventing a new one.
 *
 * Zero results is an honest answer here and `deployed-safety.ts` grades it as a
 * pass for the same reason — an explicit not-found is safe, a different case is
 * not. It is reported as INFO so the difference is visible rather than green.
 */
export function gradeNamedResolution(
  id: string,
  citation: string,
  titleIncludes: string,
  outcome: StructuredOutcome,
  ms?: number,
): Check {
  const opts = {
    expected: `title contains "${titleIncludes}"`,
    actual: describe(outcome),
    ...(ms === undefined ? {} : { ms }),
  };
  if (!structuredPathTaken(outcome)) {
    return check('A', id, 'FAIL', `cite:"${citation}" fell through to semantic search`, opts);
  }
  if (outcome.kind === 'no_match') {
    return check(
      'A',
      id,
      'INFO',
      `cite:"${citation}" returns an explicit not-found — honest, and the same answer the deployed probe accepts, but this corpus was expected to hold it`,
      opts,
    );
  }
  if (outcome.kind !== 'matched' && outcome.kind !== 'ambiguous') {
    return check('A', id, 'FAIL', `cite:"${citation}" did not resolve`, opts);
  }
  const titles = outcome.hits.map((h) => h.caseTitle);
  const wrong = titles.filter((t) => !t.toUpperCase().includes(titleIncludes.toUpperCase()));
  if (wrong.length > 0) {
    return check(
      'A',
      id,
      'FAIL',
      `cite:"${citation}" returned a different case than the one asked for`,
      {
        ...opts,
        actual: wrong.join(' · '),
      },
    );
  }
  return check('A', id, 'PASS', `cite:"${citation}" resolves to ${titleIncludes}`, {
    ...opts,
    actual: titles.join(' · '),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS C — adverse / currentness
// ─────────────────────────────────────────────────────────────────────────────

export type OverruledExpectation = {
  readonly id: string;
  readonly caseTitle: string;
  readonly overruledStatus: string;
  readonly overruledByJudgmentId: string | null;
};

export type OverruledActual = {
  readonly overruled_status: string;
  readonly overruled_by_judgment_id: string | null;
} | null;

/**
 * Class C. A `set_aside` judgment that comes back `none` is the single worst
 * outcome this migration could produce, and it is silent: the row still reads
 * fine, the search still answers, and `set_aside` is the one state that
 * disables add-to-matter. `CITATION_HARNESS.md`'s stale-overruled threshold is
 * zero.
 *
 * The row going MISSING is graded just as hard. A migration that dropped an
 * overruled judgment removes the LAW MOVED mark by removing the law.
 */
export function gradeOverruled(
  expected: OverruledExpectation,
  actual: OverruledActual,
  ms?: number,
): Check {
  const opts = {
    expected: `${expected.overruledStatus} / overruled_by ${expected.overruledByJudgmentId ?? 'null'}`,
    ...(ms === undefined ? {} : { ms }),
  };
  if (actual === null) {
    return check(
      'C',
      `overruled-${expected.id.slice(0, 8)}`,
      'FAIL',
      `${expected.caseTitle} — row is GONE post-migration`,
      {
        ...opts,
        actual: '(no row)',
      },
    );
  }
  const actualDesc = `${actual.overruled_status} / overruled_by ${actual.overruled_by_judgment_id ?? 'null'}`;
  if (actual.overruled_status !== expected.overruledStatus) {
    return check(
      'C',
      `overruled-${expected.id.slice(0, 8)}`,
      'FAIL',
      `${expected.caseTitle} — overruled_status CHANGED. An advocate would be shown this as good law.`,
      { ...opts, actual: actualDesc },
    );
  }
  if (actual.overruled_by_judgment_id !== expected.overruledByJudgmentId) {
    return check(
      'C',
      `overruled-${expected.id.slice(0, 8)}`,
      'FAIL',
      `${expected.caseTitle} — status held but the overruling judgment changed`,
      { ...opts, actual: actualDesc },
    );
  }
  return check(
    'C',
    `overruled-${expected.id.slice(0, 8)}`,
    'PASS',
    `${expected.caseTitle} — currentness intact`,
    {
      ...opts,
      actual: actualDesc,
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS D — exact evidence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class D. `exactSpan` claims a literal position in `full_text`, byte-exact.
 *
 * The migration risk here is not a lost span — that would show as null and be
 * obvious. It is a span that still LOOKS valid while pointing at the wrong
 * bytes, which is what a re-encoded `full_text` would produce: same offsets,
 * different text under them. So the check is not "is `exactSpan` non-null" but
 * "does `full_text` still say, at that offset, exactly what the span claims".
 *
 * `substring` is 1-indexed in Postgres and `charOffset` is 0-indexed. That
 * off-by-one is the whole reason this comparison is done here, on text already
 * fetched, rather than as a clever SQL predicate nobody would re-derive.
 */
export function gradeExactSpan(
  id: string,
  span: { text: string; charOffset: number; charLength: number } | null,
  fullText: string | null,
  ms?: number,
): Check {
  const opts = ms === undefined ? {} : { ms };
  if (span === null) {
    return check(
      'D',
      id,
      'INFO',
      'no exactSpan on this result — a lexical-only match or a chunk not yet backfilled, both legitimate',
      opts,
    );
  }
  if (fullText === null) {
    return check(
      'D',
      id,
      'FAIL',
      'result carries an exactSpan but its judgment has no full_text',
      opts,
    );
  }
  const atOffset = fullText.slice(span.charOffset, span.charOffset + span.text.length);
  if (atOffset !== span.text) {
    return check(
      'D',
      id,
      'FAIL',
      'exactSpan no longer matches full_text at its own offset — evidence text has shifted',
      {
        ...opts,
        expected: JSON.stringify(span.text.slice(0, 80)),
        actual: JSON.stringify(atOffset.slice(0, 80)),
      },
    );
  }
  return check(
    'D',
    id,
    'PASS',
    `exactSpan is byte-identical at offset ${span.charOffset} (${span.text.length} chars)`,
    opts,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS E — duplicate collapse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class E. One slot per DOCUMENT: no two results may share a non-null
 * `content_hash`.
 *
 * **Null hashes are never collapsed and must not be counted as violations** —
 * `retrieve.ts` says so explicitly (absent is not equal), and a gate that
 * flagged them would fail on every un-hashed row in the corpus rather than on a
 * migration defect.
 */
export function gradeDuplicateCollapse(
  id: string,
  hashes: readonly (string | null)[],
  ms?: number,
): Check {
  const opts = ms === undefined ? {} : { ms };
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const h of hashes) {
    if (h === null) continue;
    if (seen.has(h)) repeated.push(h);
    seen.add(h);
  }
  if (repeated.length > 0) {
    return check(
      'E',
      id,
      'FAIL',
      'the same document occupies more than one result slot — collapse regressed',
      {
        ...opts,
        expected: 'every content_hash distinct',
        actual: `${repeated.length} repeat(s): ${[...new Set(repeated)].map((h) => h.slice(0, 12)).join(', ')}`,
      },
    );
  }
  const nulls = hashes.filter((h) => h === null).length;
  return check(
    'E',
    id,
    'PASS',
    `${hashes.length} results, ${seen.size} distinct content_hash, ${nulls} un-hashed (never collapsed, by design)`,
    opts,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS H — generated column behaviour
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class H. The defect LCC found: a schema comparison that checks name, type and
 * nullability passes cleanly while the GENERATION EXPRESSION has been lost, and
 * the column becomes an ordinary one holding whatever the restore put in it.
 *
 * Every existing row still looks right — the values were dumped and restored —
 * so nothing shows until a WRITE, at which point new judgments become invisible
 * to full-text search forever and no error is ever raised.
 *
 * `attgenerated` is the catalogue's own answer to "is this generated", and it
 * is a single character: `'s'` for STORED, `''` for a plain column. This grades
 * that, and the CLI proves the behaviour separately on a disposable clone.
 */
export function gradeGeneratedFlag(
  table: string,
  column: string,
  attgenerated: string | null,
  expression: string | null,
  expectedExpressionContains: string,
  ms?: number,
): Check {
  const id = `generated-${table}.${column}`;
  const opts = {
    expected: `attgenerated 's' AND expression containing "${expectedExpressionContains}"`,
    ...(ms === undefined ? {} : { ms }),
  };
  if (attgenerated !== 's') {
    return check(
      'H',
      id,
      'FAIL',
      `${table}.${column} is NOT a stored generated column any more — writes will silently stop maintaining it`,
      {
        ...opts,
        actual: `attgenerated ${JSON.stringify(attgenerated)}`,
      },
    );
  }
  if (
    !expression ||
    !normaliseExpr(expression).includes(normaliseExpr(expectedExpressionContains))
  ) {
    return check(
      'H',
      id,
      'FAIL',
      `${table}.${column} is generated, but from a DIFFERENT expression than the schema declares`,
      {
        ...opts,
        actual: expression ?? '(none)',
      },
    );
  }
  return check(
    'H',
    id,
    'PASS',
    `${table}.${column} is STORED GENERATED with the declared expression`,
    {
      ...opts,
      actual: expression,
    },
  );
}

/**
 * Postgres re-prints a generation expression with its own spacing, casts and
 * quoting — `to_tsvector('english', "full_text")` comes back as
 * `to_tsvector('english'::regconfig, full_text)`. Comparing raw strings would
 * fail on formatting and teach everyone to ignore this check.
 */
function normaliseExpr(s: string): string {
  return s
    .toLowerCase()
    .replace(/::[a-z_]+/g, '')
    .replace(/["\s]+/g, '');
}

/**
 * Class H's behavioural half, graded from what a write to a disposable clone
 * actually produced.
 *
 * Three states, because they mean three different things: never populated (the
 * expression is gone), populated but frozen across an UPDATE (worse — it looks
 * maintained until the text changes), and correct.
 */
export function gradeGeneratedBehaviour(
  id: string,
  afterInsert: string | null,
  afterUpdate: string | null,
  ms?: number,
): Check {
  const opts = ms === undefined ? {} : { ms };
  if (!afterInsert || afterInsert.trim() === '') {
    return check(
      'H',
      id,
      'FAIL',
      'a fresh INSERT produced an empty tsvector — the generation expression is not being applied to writes',
      {
        ...opts,
        expected: 'non-empty tsvector',
        actual: JSON.stringify(afterInsert),
      },
    );
  }
  if (afterUpdate === afterInsert) {
    return check(
      'H',
      id,
      'FAIL',
      'the tsvector did not change when its source text was UPDATEd — stored, but no longer derived',
      {
        ...opts,
        expected: 'tsvector recomputed on update',
        actual: 'unchanged',
      },
    );
  }
  if (!afterUpdate || afterUpdate.trim() === '') {
    return check('H', id, 'FAIL', 'the tsvector emptied on UPDATE', {
      ...opts,
      actual: JSON.stringify(afterUpdate),
    });
  }
  return check(
    'H',
    id,
    'PASS',
    'insert populates and update recomputes the generated tsvector',
    opts,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Corpus counts — compared, never silently accepted
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The freeze target is an EQUALITY, not a floor, and the reason is worth
 * keeping: the write freeze held at 7,296,068 with zero drift, so the local
 * restore has exactly one right answer. "At least as many" would pass a restore
 * that had also picked up rows from somewhere else, which is not a migration.
 *
 * Fewer is a lost-rows FAIL. More is also a FAIL, because it means something
 * wrote to the local cluster during the restore and the comparison this whole
 * gate rests on no longer holds.
 */
export function gradeRowCount(
  id: string,
  cls: CheckClass,
  expected: number,
  actual: number,
  ms?: number,
): Check {
  const opts = {
    expected: expected.toLocaleString('en-IN'),
    actual: actual.toLocaleString('en-IN'),
    ...(ms === undefined ? {} : { ms }),
  };
  if (actual === expected)
    return check(cls, id, 'PASS', 'row count matches the frozen source exactly', opts);
  const delta = actual - expected;
  return check(
    cls,
    id,
    'FAIL',
    delta < 0
      ? `${Math.abs(delta).toLocaleString('en-IN')} rows did not survive the restore`
      : `${delta.toLocaleString('en-IN')} rows MORE than the frozen source — something wrote to local during the migration`,
    opts,
  );
}
