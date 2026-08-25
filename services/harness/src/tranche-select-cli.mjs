#!/usr/bin/env node
/**
 * NEW1 — 100k PASSAGE TRANCHE SELECTOR, attempt #4. R7 §9 NEW1-P0.
 *
 * Design and justification: docs/ai/new1-tier-a/TRANCHE_100K_DESIGN.md
 * Approved architecture:     FIFTH bus 1176, ACKed in bus 1185.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT THE PREVIOUS SELECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Attempts #1..#3 all asked the DATABASE to do the selection and all three died:
 *
 *   #1  one query per stratum cell        88s for ONE cell, ~2h projected. Killed.
 *   #2  quota table via sql(arrayOfArrays) TypeError before anything was sent.
 *   #3  single pass, row_number() window   40 minutes, killed by its own timeout.
 *
 * The mechanism, from EXPLAIN through the same parameterised bind path this file
 * uses (an inlined EXPLAIN is not evidence on this DB — a bind once moved a cost
 * from 18.72 to 9,255,009):
 *
 *   Subquery Scan (cost=1770336.42..1845467.52)   <- for ONE cell
 *     -> WindowAgg  rows=1878278
 *       -> Sort     rows=1878278
 *         -> Nested Loop
 *           -> Index Scan using judgments_judgment_date_idx
 *
 * Two properties of the shared schema, not of the query: the planner drives off
 * `judgment_date`, the LEAST selective dimension here (96.5% of the corpus is
 * post-2010) and leaves `judgments_court_idx` unused; and `row_number() OVER
 * (PARTITION BY ...)` CANNOT STREAM — it materialises and sorts the whole joined
 * relation before emitting a single row, which is why forty minutes produced no
 * partial output at all.
 *
 * So attempt #4 does the selection OFFLINE and asks the database only the one
 * question it answers cheaply — "is this specific id still eligible?":
 *
 *   1. FROZEN LOCAL FRAME     stream the 888 Tier-A batch manifests once,
 *                             committing to their exact ordered content by hash.
 *   2. SEEDED BOUNDED DRAW    deterministic priority SHA256(seed|id), per-cell
 *                             bounded max-heaps with a reserve. No global sort.
 *   3. PK REVALIDATION        bounded id batches against the LIVE eligibility
 *                             view, so stale frame membership cannot survive.
 *   4. FILL + REPORT          fill each cell in hash order from survivors;
 *                             underfill is reported, NEVER redistributed.
 *   5. GOLD, LAST             only after the natural tranche is frozen and hashed.
 *
 * Measured before this was written, real bind, live DB:
 *
 *   n=2000  Index Only Scan using judgments_pkey  cost=0.56..3899.01
 *           Buffers: shared hit=2125   Execution Time: 0.948 ms   0.203 ms/id
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE RULES THIS FILE EXISTS TO ENFORCE — unchanged from attempt #1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. GOLD-BLIND SAMPLING. The draw never looks at gold membership. Gold that
 *    lands naturally is `natural`; gold added afterwards is `forced`, and
 *    END-TO-END counts a `forced` target as a MISS. Force all 213 gold in
 *    unmarked and the benchmark measures ranking inside a set rigged to contain
 *    the answer — which is not the product's question.
 *
 *    Enforced STRUCTURALLY here, not by intention: `V31_MANIFEST.json` is not
 *    opened until the natural tranche is already written and hashed.
 *
 * 2. ONE DEFINITION OF ELIGIBILITY. Membership is decided by the SAME predicate
 *    the production embed consumer applies, and the deployed view's hash is
 *    recorded. The local frame proposes candidates; it never certifies them.
 *
 *    ATTEMPT #4 GOT THIS WRONG ONCE AND IT WAS CAUGHT BY FALSIFICATION.
 *    The first run reported 240,181 of 240,181 candidates surviving — 100.00%.
 *    A check that returns the same answer for every input is not a check, so it
 *    was fed inputs that MUST be refused:
 *
 *      fabricated uuids        in=  500  eligible=    0   <- refuses
 *      explicitly quarantined  in= 2000  eligible= 2000   <- does NOT refuse
 *      random judgments        in= 3000  eligible= 3000   <- does NOT refuse
 *
 *      SELECT count(*) FROM judgment_embedding_eligibility  ->  18,698,984
 *      SELECT count(*) FROM judgments                       ->  18,698,984
 *
 *    `judgment_embedding_eligibility` HAS NO WHERE CLAUSE. It is a LABELLING
 *    view over every row of `judgments`, emitting `axis_a_identity`,
 *    `axis_b_text`, `axis_c_role`, `text_safety`, `semantic_tier`, `value_band`
 *    and `is_cited_authority` as columns. Joining to it proves a row EXISTS; it
 *    proves nothing about eligibility.
 *
 *    The operative predicate lives in the production consumer,
 *    `doc-vector-embed.mjs`, and is reproduced verbatim below. That file is the
 *    authority because it is what actually decides whether a document gets a
 *    vector — the view only supplies the labels it reads.
 *
 * 3. UNDERFILL IS REPORTED, NEVER SILENTLY REBALANCED. There is no pre-1990
 *    Meghalaya High Court judgment to find. A quota quietly moved to whichever
 *    cell had rows is how an aggregate check passes while two of three scopes
 *    are dead.
 *
 * USAGE
 *   node --max-old-space-size=6144 services/harness/src/tranche-select-cli.mjs --frame
 *   node --max-old-space-size=6144 services/harness/src/tranche-select-cli.mjs
 *   node --max-old-space-size=6144 services/harness/src/tranche-select-cli.mjs --verify
 */
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const ROOT = new URL('../../../', import.meta.url);
const BATCH_DIR = new URL('docs/ai/embedding-manifests/document-vectors/', ROOT);
const VALUE_DIR = new URL('docs/ai/new1-tier-a/', ROOT);
const OUT = new URL('docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json', ROOT);
const FRAME_OUT = new URL('docs/ai/new1-tier-a/TRANCHE_FRAME_COMMITMENT.json', ROOT);
const GOLD = new URL('docs/ai/new1-tier-a/V31_MANIFEST.json', ROOT);

const FRAME_ONLY = process.argv.includes('--frame');
const VERIFY = process.argv.includes('--verify');
const TARGET = Number(process.env.TRANCHE_SIZE ?? 100_000);

/** FROZEN. Changing this invalidates every comparison against a prior tranche. */
const SEED = process.env.TRANCHE_SEED ?? 'lawmind-new1-tranche-100k-2026-08-25';

/** ACKed to FIFTH in bus 1185. Deviating from these needs a new verdict. */
const PK_BATCH = Number(process.env.PK_BATCH ?? 2_000);
const PK_TIMEOUT_MS = Number(process.env.PK_TIMEOUT_MS ?? 60_000);
const RESERVE_RATIO = Number(process.env.RESERVE_RATIO ?? 3);
const RESERVE_FLOOR = Number(process.env.RESERVE_FLOOR ?? 2_000);
const RESERVE_CAP = Number(process.env.RESERVE_CAP ?? 25_000);
/** A frame this broken is a finding, not an input. */
const MAX_DUPLICATE_RATE = Number(process.env.MAX_DUPLICATE_RATE ?? 0.005);

/**
 * `axis_c_role`'s three refusals, copied from the production consumer
 * `doc-vector-embed.mjs`. Kept as a named constant so the two files can be
 * diffed rather than compared from memory.
 */
const REFUSED_CLASSES = new Set(['procedural_disposal', 'reference_stub', 'decided_brief']);

/**
 * ERA BUCKETS — deliberately NOT the corpus proportions.
 *
 * Measured (TABLESAMPLE 0.1 over judgments): the corpus is 96.5% post-2010 and
 * 0.08% pre-1990. A proportional 100k sample holds ~48 pre-1990 documents, which
 * cannot support any statement about older authority — the settled-proposition
 * material advocates cite most. So era targets are skewed toward older, BOTH
 * proportions are written into the manifest, and NO corpus-wide rate may be
 * quoted from a tranche built this way.
 *
 * Bounds are on the frame's `year` integer rather than a full date. The frame
 * rows carry `year` and not `judgment_date`, and the boundaries are year-aligned,
 * so the mapping is exact rather than approximate. Flagged to FIFTH in bus 1185.
 */
const ERAS = [
  { name: 'PRE_1990', minYear: 0, maxYear: 1989, target: 0.05, corpusShare: 0.0008 },
  { name: 'ERA_1990S', minYear: 1990, maxYear: 1999, target: 0.1, corpusShare: 0.0018 },
  { name: 'ERA_2000S', minYear: 2000, maxYear: 2009, target: 0.2, corpusShare: 0.056 },
  { name: 'ERA_2010S', minYear: 2010, maxYear: 2019, target: 0.35, corpusShare: 0.417 },
  { name: 'ERA_2020S', minYear: 2020, maxYear: 9999, target: 0.3, corpusShare: 0.548 },
];

/**
 * COURT GROUPS. The Supreme Court is oversampled relative to its share (0.45% of
 * a 50,000-row frame sample) because it is the most-cited court in the country
 * and a tranche mirroring raw volume would barely contain it. Named High Courts
 * are the largest populations; everything else is pooled so small courts are
 * represented without each getting a quota it cannot fill.
 *
 * These strings are matched EXACTLY against the frame's `court`. All fourteen —
 * including the double space in Telangana — were verified present verbatim in a
 * 50,000-row frame sample before this list was frozen. A near-miss would silently
 * dump a named court into __OTHER__ and nothing would look wrong.
 */
const COURTS = [
  { name: 'Supreme Court of India', share: 0.1 },
  { name: 'Madras High Court', share: 0.08 },
  { name: 'Allahabad High Court', share: 0.08 },
  { name: 'Patna High Court', share: 0.06 },
  { name: 'High Court of Kerala', share: 0.06 },
  { name: 'Bombay High Court', share: 0.06 },
  { name: 'High Court  for State of Telangana', share: 0.05 },
  { name: 'High Court Of Rajasthan', share: 0.05 },
  { name: 'High Court of Karnataka', share: 0.05 },
  { name: 'High Court of Punjab and Haryana', share: 0.05 },
  { name: 'High Court of Delhi', share: 0.05 },
  { name: 'Calcutta High Court', share: 0.05 },
  { name: 'High Court of Gujarat', share: 0.04 },
  { name: 'High Court of Madhya Pradesh', share: 0.04 },
  { name: '__OTHER__', share: 0.18 },
];

const NAMED = new Set(COURTS.filter((c) => c.name !== '__OTHER__').map((c) => c.name));

const eraFor = (year) => {
  for (const e of ERAS) if (year >= e.minYear && year <= e.maxYear) return e.name;
  return null;
};

/**
 * A BOUNDED MAX-HEAP that keeps the k SMALLEST priorities.
 *
 * This is the whole reason attempt #4 fits in memory. The alternative — sort all
 * 8.85M rows and take a prefix — is the same mistake the DB made with
 * `row_number()`, just moved into JavaScript: it cannot emit anything until the
 * whole relation is materialised and ordered.
 *
 * Root holds the LARGEST retained priority, so admission is one comparison and
 * eviction is one sift.
 */
class BoundedMinKeep {
  constructor(k) {
    this.k = k;
    this.a = [];
  }
  #cmp(x, y) {
    return x.p < y.p ? -1 : x.p > y.p ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  }
  #up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.#cmp(this.a[i], this.a[p]) <= 0) break;
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      i = p;
    }
  }
  #down(i) {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.a.length && this.#cmp(this.a[l], this.a[m]) > 0) m = l;
      if (r < this.a.length && this.#cmp(this.a[r], this.a[m]) > 0) m = r;
      if (m === i) break;
      [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
      i = m;
    }
  }
  offer(item) {
    if (this.a.length < this.k) {
      this.a.push(item);
      this.#up(this.a.length - 1);
      return;
    }
    if (this.#cmp(item, this.a[0]) >= 0) return;
    this.a[0] = item;
    this.#down(0);
  }
  sorted() {
    return [...this.a].sort((x, y) => this.#cmp(x, y));
  }
}

const log = (s) => console.log(`${new Date().toISOString()}  ${s}`);

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — FROZEN LOCAL FRAME
// ═══════════════════════════════════════════════════════════════════════════
//
// One sequential pass over the frame that BOTH commits to its exact content and
// performs the seeded draw. Two passes would read 2.4 GB twice and would leave
// open the possibility that the file changed between them.

const frameFiles = [
  ...readdirSync(VALUE_DIR)
    .filter((f) => /^tier-a-value-batch-\d+\.jsonl$/.test(f))
    .sort()
    .map((f) => ({ name: f, url: new URL(f, VALUE_DIR), kind: 'value' })),
  ...readdirSync(BATCH_DIR)
    .filter((f) => /^tier-a-batch-\d+\.jsonl$/.test(f))
    .sort()
    .map((f) => ({ name: f, url: new URL(f, BATCH_DIR), kind: 'lcc' })),
];

log(`frame: ${frameFiles.length} files`);

const cells = [];
for (const court of COURTS) {
  for (const era of ERAS) {
    const quota = Math.round(TARGET * court.share * era.target);
    if (quota === 0) continue;
    cells.push({
      key: `${court.name}#${era.name}`,
      court: court.name,
      era: era.name,
      quota,
      reserve: Math.min(RESERVE_CAP, Math.max(RESERVE_RATIO * quota, quota + RESERVE_FLOOR)),
    });
  }
}
const heaps = new Map(cells.map((c) => [c.key, new BoundedMinKeep(c.reserve)]));
const cellByKey = new Map(cells.map((c) => [c.key, c]));
log(
  `strata cells: ${cells.length}  ·  target ${TARGET.toLocaleString()}  ·  reserve ${cells
    .reduce((a, c) => a + c.reserve, 0)
    .toLocaleString()} candidate slots`,
);

const seen = new Set();
const duplicateIds = [];
const parseErrors = [];
const fileReport = [];
let frameRows = 0;
let unmappableYear = 0;
const courtSeen = new Map();
const frameDigest = createHash('sha256');

const t0 = Date.now();
for (const f of frameFiles) {
  const st = statSync(f.url);
  const fileHash = createHash('sha256');
  const dec = new StringDecoder('utf8');
  let carry = '';
  let rows = 0;
  let errs = 0;

  // Own line-splitting rather than readline: readline would consume the stream
  // and leave no way to hash the RAW bytes, and hashing decoded lines would not
  // commit to the file as it exists on disk.
  for await (const chunk of createReadStream(f.url)) {
    fileHash.update(chunk);
    frameDigest.update(chunk);
    carry += dec.write(chunk);
    let nl;
    while ((nl = carry.indexOf('\n')) !== -1) {
      const line = carry.slice(0, nl);
      carry = carry.slice(nl + 1);
      if (!line.trim()) continue;
      rows += 1;
      let r;
      try {
        r = JSON.parse(line);
      } catch {
        errs += 1;
        if (parseErrors.length < 50) parseErrors.push({ file: f.name, row: rows, reason: 'JSON parse' });
        continue;
      }
      if (!r.judgmentId || !r.court || typeof r.year !== 'number') {
        errs += 1;
        if (parseErrors.length < 50)
          parseErrors.push({ file: f.name, row: rows, reason: 'missing judgmentId/court/year' });
        continue;
      }
      frameRows += 1;
      courtSeen.set(r.court, (courtSeen.get(r.court) ?? 0) + 1);

      // De-duplicated by FIRST OCCURRENCE IN FRAME ORDER, which is what makes the
      // frame digest and the draw jointly reproducible.
      if (seen.has(r.judgmentId)) {
        if (duplicateIds.length < 200) duplicateIds.push(r.judgmentId);
        else duplicateIds.push(null);
        continue;
      }
      seen.add(r.judgmentId);

      const era = eraFor(r.year);
      if (!era) {
        unmappableYear += 1;
        continue;
      }
      const courtKey = NAMED.has(r.court) ? r.court : '__OTHER__';
      const key = `${courtKey}#${era}`;
      const heap = heaps.get(key);
      if (!heap) continue;

      // Deterministic seeded priority. Not RANDOM() — a re-run must return the
      // same ids from the same frame, and a planner-dependent sample cannot.
      const p = createHash('sha256').update(`${SEED}|${r.judgmentId}`).digest('hex').slice(0, 16);
      heap.offer({
        id: r.judgmentId,
        p,
        court: r.court,
        year: r.year,
        textLength: r.textLength ?? null,
        valueBand: r.valueBand ?? null,
      });
    }
  }
  carry += dec.end();
  if (carry.trim()) {
    rows += 1;
    try {
      const r = JSON.parse(carry);
      if (r.judgmentId) frameRows += 1;
    } catch {
      errs += 1;
    }
  }

  fileReport.push({
    file: f.name,
    kind: f.kind,
    bytes: st.size,
    mtime: st.mtime.toISOString(),
    rows,
    parseErrors: errs,
    sha256: fileHash.digest('hex'),
  });
  if (fileReport.length % 100 === 0)
    log(`  ${fileReport.length}/${frameFiles.length} files · ${frameRows.toLocaleString()} rows · ${seen.size.toLocaleString()} unique`);
}

const duplicateCount = duplicateIds.length;
const duplicateRate = frameRows === 0 ? 0 : duplicateCount / frameRows;
const frameSha256 = frameDigest.digest('hex');

const frameCommitment = {
  kind: 'new1_tranche_frame_commitment',
  builtAt: new Date().toISOString(),
  note:
    'The frame PROPOSES candidates. It never certifies eligibility — membership is decided by the deployed judgment_embedding_eligibility view at revalidation. Committed here because manifest-tier-a.json cannot certify its own contents: its manifestHash is the SHA-256 of the empty string and its batchHashes array is empty.',
  seed: SEED,
  files: frameFiles.length,
  frameSha256,
  frameRows,
  uniqueIds: seen.size,
  duplicateCount,
  duplicateRatePct: Number((100 * duplicateRate).toFixed(4)),
  duplicateSample: duplicateIds.filter(Boolean).slice(0, 200),
  parseErrorCount: parseErrors.length,
  parseErrorSample: parseErrors,
  unmappableYear,
  courtsInFrame: [...courtSeen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([court, rows]) => ({ court, rows, mappedTo: NAMED.has(court) ? court : '__OTHER__' })),
  fileReport,
  elapsedSeconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
};
writeFileSync(FRAME_OUT, JSON.stringify(frameCommitment, null, 2) + '\n');

log('');
log(`FRAME COMMITTED  sha256 ${frameSha256.slice(0, 16)}…`);
log(`  files            ${frameFiles.length}`);
log(`  rows             ${frameRows.toLocaleString()}`);
log(`  unique ids       ${seen.size.toLocaleString()}`);
log(`  duplicates       ${duplicateCount.toLocaleString()} (${(100 * duplicateRate).toFixed(4)}%)`);
log(`  parse errors     ${parseErrors.length}`);
log(`  unmappable year  ${unmappableYear.toLocaleString()}`);
log(`  elapsed          ${frameCommitment.elapsedSeconds}s`);

if (parseErrors.length > 0) {
  console.error('\nFRAME INVARIANT FAILED: rows that do not parse or lack judgmentId/court/year.');
  console.error('A frame this broken is a finding, not an input. Stopping.');
  process.exit(1);
}
if (duplicateRate > MAX_DUPLICATE_RATE) {
  console.error(
    `\nFRAME INVARIANT FAILED: duplicate rate ${(100 * duplicateRate).toFixed(3)}% exceeds the ${(100 * MAX_DUPLICATE_RATE).toFixed(3)}% bound.`,
  );
  process.exit(1);
}

// The id set was the memory peak and nothing downstream needs it.
seen.clear();

if (FRAME_ONLY) {
  log('--frame: frame committed, nothing selected.');
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — LIVE PK REVALIDATION
// ═══════════════════════════════════════════════════════════════════════════
//
// The frame is a snapshot of what WAS eligible when those batch files were
// generated on 19 Aug. Six days of classification, quarantine and text-safety
// screening have run since. Asking the live view per id is what stops a stale
// frame membership from silently surviving into the tranche.

const url =
  process.env.DATABASE_URL ??
  readFileSync(new URL('.env', ROOT), 'utf8')
    .match(/^DATABASE_URL=(.*)$/m)[1]
    .trim();

const sql = postgres(url, {
  max: 1,
  idle_timeout: 30,
  connect_timeout: 30,
  connection: { statement_timeout: PK_TIMEOUT_MS },
});

let manifest;
try {
  const [{ def }] = await sql`SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def`;
  const viewHash = createHash('sha256').update(def).digest('hex');
  log(`eligibility view sha256 ${viewHash.slice(0, 16)}…`);

  const candidates = [];
  for (const c of cells) for (const item of heaps.get(c.key).sorted()) candidates.push({ ...item, cell: c.key });
  log(`candidates retained: ${candidates.length.toLocaleString()} across ${cells.length} cells`);

  const survivors = new Map();
  const refusals = { absent: 0, noText: 0, textUnsafe: 0, refusedClass: 0, admittedCitedAuthority: 0 };
  const refusedByClass = new Map();
  const revalT0 = Date.now();
  for (let i = 0; i < candidates.length; i += PK_BATCH) {
    const slice = candidates.slice(i, i + PK_BATCH);
    /**
     * THE PRODUCTION PREDICATE, not a second definition of eligibility.
     *
     * Every term below is read from `doc-vector-embed.mjs`, which is what
     * actually decides whether a document gets a vector:
     *
     *   1. no full_text / blank head        -> skippedNoText
     *   2. text_safety = 'UNSAFE_VERIFIED'  -> skippedTextUnsafe, exempted by
     *                                          NOTHING (it fails axis_b_text and
     *                                          lands in the first branch of the
     *                                          tier CASE, ahead of the
     *                                          cited-authority exemption)
     *   3. hc_document_class in axis_c_role's three refusals AND not a cited
     *      authority                        -> skippedNowIneligible
     *
     * A row with NO class is NOT refused. Unclassified is the other 82.5% of the
     * corpus, and refusing it would silently shrink Tier A to the 6.9% that a
     * rule has positively labelled. `bail_order` is NOT refused either — the view
     * routes it to BAIL_ORDER_REACHABLE and production admits it.
     */
    const rows = await sql`
      SELECT e.id::text AS id, e.court, e.judgment_date, e.text_length, e.script_quality,
             e.axis_c_role, e.value_band, e.semantic_tier, e.is_cited_authority,
             e.text_safety, j.hc_document_class AS cls,
             (j.full_text IS NULL OR length(btrim(left(j.full_text, 200))) = 0) AS no_text
      FROM judgment_embedding_eligibility e
      JOIN judgments j ON j.id = e.id
      WHERE e.id = ANY(${slice.map((s) => s.id)}::uuid[])`;
    const back = new Set();
    for (const r of rows) {
      back.add(r.id);
      if (r.no_text) {
        refusals.noText += 1;
        continue;
      }
      if (r.text_safety === 'UNSAFE_VERIFIED') {
        refusals.textUnsafe += 1;
        continue;
      }
      if (r.cls && REFUSED_CLASSES.has(r.cls)) {
        if (r.is_cited_authority) {
          // Counted rather than silently kept: an exemption nobody can see is how
          // the next drift hides.
          refusals.admittedCitedAuthority += 1;
        } else {
          refusals.refusedClass += 1;
          refusedByClass.set(r.cls, (refusedByClass.get(r.cls) ?? 0) + 1);
          continue;
        }
      }
      survivors.set(r.id, r);
    }
    for (const s of slice) if (!back.has(s.id)) refusals.absent += 1;
    if ((i / PK_BATCH) % 25 === 0)
      log(
        `  revalidated ${Math.min(i + PK_BATCH, candidates.length).toLocaleString()}/${candidates.length.toLocaleString()} · survivors ${survivors.size.toLocaleString()}`,
      );
  }
  const revalSeconds = Number(((Date.now() - revalT0) / 1000).toFixed(1));
  log(
    `revalidation done in ${revalSeconds}s · ${survivors.size.toLocaleString()}/${candidates.length.toLocaleString()} survived (${((100 * survivors.size) / Math.max(1, candidates.length)).toFixed(2)}%)`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 3 — FILL IN HASH ORDER, REPORT UNDERFILL
  // ═════════════════════════════════════════════════════════════════════════

  const picked = [];
  const cellReport = [];
  for (const c of cells) {
    const ordered = heaps.get(c.key).sorted();
    const live = ordered.filter((x) => survivors.has(x.id));
    const take = live.slice(0, c.quota);
    for (const x of take) picked.push({ ...x, ...survivors.get(x.id), cell: c.key });
    const shortfall = c.quota - take.length;
    cellReport.push({
      court: c.court,
      era: c.era,
      quota: c.quota,
      reserve: c.reserve,
      candidatesRetained: ordered.length,
      survivedRevalidation: live.length,
      filled: take.length,
      shortfall,
      // A reserve that emptied means the FRAME ran out, not that the DB did.
      reserveExhausted: ordered.length < c.reserve,
      note:
        shortfall > 0
          ? ordered.length < c.reserve
            ? 'UNDERFILLED — the frame holds no more rows for this cell. Not redistributed, by design.'
            : 'UNDERFILLED — reserve survived revalidation short of quota. Not redistributed, by design.'
          : null,
    });
  }
  const underfilled = cellReport.filter((c) => c.shortfall > 0);
  log(`cells underfilled: ${underfilled.length}/${cellReport.length}`);
  log(`tranche drawn: ${picked.length.toLocaleString()} of target ${TARGET.toLocaleString()}`);

  // Which of the tranche production dense search cannot reach today. Reported,
  // never targeted — it is an OUTPUT of the design.
  const stagedSet = new Set();
  const ids = picked.map((p) => p.id);
  for (let i = 0; i < ids.length; i += PK_BATCH) {
    const rows = await sql`
      SELECT judgment_id::text AS id FROM new1_doc_vector_stage
      WHERE judgment_id = ANY(${ids.slice(i, i + PK_BATCH)}::uuid[])`;
    for (const r of rows) stagedSet.add(r.id);
  }
  const unreachable = ids.length - stagedSet.size;
  log(
    `already in production stage: ${stagedSet.size.toLocaleString()} · NOT reachable today: ${unreachable.toLocaleString()} (${((100 * unreachable) / Math.max(1, ids.length)).toFixed(1)}%)`,
  );

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 4 — FREEZE THE NATURAL TRANCHE, *THEN* LOOK AT GOLD
  // ═════════════════════════════════════════════════════════════════════════
  //
  // The hash is computed BEFORE V31_MANIFEST.json is opened. That ordering is
  // what makes "gold-blind" a property of the program rather than a promise in
  // a comment: nothing after this line can change which documents were drawn.

  const naturalIds = picked.map((p) => p.id).sort();
  const naturalContentSha256 = createHash('sha256').update(naturalIds.join('\n')).digest('hex');
  log(`natural tranche frozen · ${naturalIds.length.toLocaleString()} ids · sha256 ${naturalContentSha256.slice(0, 16)}…`);

  const v31 = JSON.parse(readFileSync(GOLD, 'utf8'));
  const goldIds = [...new Set(v31.tasks.flatMap((t) => t.targets))].sort();
  const trancheIds = new Set(naturalIds);
  const naturalGold = goldIds.filter((g) => trancheIds.has(g));
  const forcedGold = goldIds.filter((g) => !trancheIds.has(g));
  log(`gold: ${goldIds.length} total · ${naturalGold.length} natural · ${forcedGold.length} forced`);

  const body = {
    kind: 'new1_tranche_100k_manifest',
    version: 4,
    builtAt: new Date().toISOString(),
    architecture: 'FROZEN_LOCAL_FRAME -> OFFLINE SEEDED BOUNDED SELECTION -> LIVE ELIGIBILITY PK REVALIDATION',
    architectureApproval: 'FIFTH bus 1176, ACKed NEW1 bus 1185',
    seed: SEED,
    targetSize: TARGET,
    actualSize: picked.length,
    frame: {
      sha256: frameSha256,
      files: frameFiles.length,
      rows: frameRows,
      uniqueIds: frameCommitment.uniqueIds,
      duplicateCount,
      commitment: 'docs/ai/new1-tier-a/TRANCHE_FRAME_COMMITMENT.json',
    },
    revalidation: {
      candidatesRetained: candidates.length,
      survived: survivors.size,
      survivalPct: Number(((100 * survivors.size) / Math.max(1, candidates.length)).toFixed(2)),
      refusals: {
        absentFromJudgments: refusals.absent,
        noText: refusals.noText,
        textUnsafeVerified: refusals.textUnsafe,
        refusedClass: refusals.refusedClass,
        refusedByClass: Object.fromEntries(refusedByClass),
        admittedAsCitedAuthorityDespiteClass: refusals.admittedCitedAuthority,
      },
      pkBatchSize: PK_BATCH,
      statementTimeoutMs: PK_TIMEOUT_MS,
      elapsedSeconds: revalSeconds,
      note:
        'The frame was generated 19 Aug. Every retained candidate is re-asked of the LIVE corpus under the SAME predicate doc-vector-embed.mjs applies, so classification, quarantine and text-safety work done since cannot be silently ignored.',
    },
    eligibilityViewSha256: viewHash,
    eligibilityNote:
      'judgment_embedding_eligibility has NO WHERE clause — it is a LABELLING view over all 18,698,984 rows of judgments, and joining to it proves existence, not eligibility. The operative predicate is the one doc-vector-embed.mjs applies (no text / text_safety=UNSAFE_VERIFIED / axis_c_role refused class without cited-authority exemption) and it is reproduced in this selector. The view hash is recorded so a later reader can tell whether the LABELS moved underneath this tranche.',
    goldBlind: true,
    goldBlindProof: {
      naturalContentSha256,
      note:
        'This hash is computed over the selected ids BEFORE V31_MANIFEST.json is opened by this program. Gold membership therefore cannot have influenced the draw.',
    },
    gold: {
      total: goldIds.length,
      natural: naturalGold.length,
      forced: forcedGold.length,
      naturalIds: naturalGold,
      forcedIds: forcedGold,
      rule: 'END-TO-END success counts a FORCED target as a MISS. CONDITIONAL ranking may include it. Reporting one without the other is not permitted.',
    },
    reachability: {
      alreadyInProductionStage: stagedSet.size,
      notReachableToday: unreachable,
      notReachableSharePct: Number(((100 * unreachable) / Math.max(1, ids.length)).toFixed(2)),
      note:
        'Drawn from judgments-side eligibility, never from new1_doc_vector_stage — sampling the stage would guarantee everything is already reachable and delete a mandated stratum.',
    },
    reserve: { ratio: RESERVE_RATIO, floor: RESERVE_FLOOR, cap: RESERVE_CAP },
    eraSkew: ERAS.map((e) => ({ era: e.name, targetShare: e.target, corpusShare: e.corpusShare })),
    eraSkewNote:
      'Deliberately non-proportional. The corpus is 96.5% post-2010; a proportional 100k sample holds ~48 pre-1990 documents. No corpus-wide rate may be quoted from this tranche.',
    strata: cellReport,
    underfilledCells: underfilled.length,
    underfillNote:
      'Shortfalls are reported and NEVER redistributed. A smaller tranche is honest; a rebalanced one hides a dead cell.',
    documents: picked.map((p) => ({
      id: p.id,
      priority: p.p,
      court: p.court,
      date: p.judgment_date,
      textLength: p.text_length,
      scriptQuality: p.script_quality,
      axisCRole: p.axis_c_role,
      valueBand: p.value_band,
      semanticTier: p.semantic_tier,
      isCitedAuthority: p.is_cited_authority,
      cell: p.cell,
      inProductionStage: stagedSet.has(p.id),
      isGold: trancheIds.has(p.id) && goldIds.includes(p.id),
    })),
  };

  /**
   * THE INVARIANT EXCLUDES EVERY MEASUREMENT OF THE MACHINE, not just `builtAt`.
   *
   * The first determinism run FAILED and it was my hash, not my selection:
   * `naturalContentSha256` matched to the character across both runs and every
   * count was identical, but `revalidation.elapsedSeconds` was 140.2 in one and
   * 152.1 in the other. A reproducibility check that a busy box can fail is not
   * measuring reproducibility — it is measuring load, and it would have cried
   * wolf on every future rerun until someone stopped believing it.
   *
   * What must be byte-identical is WHICH DOCUMENTS WERE CHOSEN and under what
   * rules. How long the box took to say so is an operational note.
   */
  const { builtAt: _b, ...rest } = body;
  const invariant = {
    ...rest,
    revalidation: { ...rest.revalidation, elapsedSeconds: undefined },
  };
  const contentSha256 = createHash('sha256').update(JSON.stringify(invariant)).digest('hex');
  manifest = { ...body, contentSha256 };

  if (VERIFY) {
    const prior = JSON.parse(readFileSync(OUT, 'utf8'));
    const same = prior.contentSha256 === contentSha256;
    log('');
    log(`DETERMINISM ${same ? 'PASS' : 'FAIL'}`);
    log(`  prior  ${prior.contentSha256}`);
    log(`  rerun  ${contentSha256}`);
    if (!same) process.exitCode = 1;
  } else {
    writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
    log('');
    log('TRANCHE MANIFEST WRITTEN');
    log(`  file            ${OUT.pathname}`);
    log(`  contentSha256   ${contentSha256}`);
    log(`  documents       ${picked.length.toLocaleString()}`);
    log(`  gold            ${naturalGold.length} natural / ${forcedGold.length} forced`);
    log(`  unreachable now ${unreachable.toLocaleString()}`);
    log(`  underfilled     ${underfilled.length} cells`);
  }
} finally {
  await sql.end({ timeout: 10 });
}
