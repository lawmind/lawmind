/**
 * NEW2 — R7 §10 ADVOCATE_RETRIEVAL_GOLD_V2.
 *
 * Builds a primary-source-bound retrieval gold set with an explicit
 * train / dev / HIDDEN-HOLDOUT split. Implementation lanes see train and dev.
 * **Fifth owns the holdout and it is written to a separate file that NEW1 and
 * LCC must not read.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMARY-SOURCE-BOUND MEANS SOMETHING SPECIFIC HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every target is a judgment id that EXISTS in this corpus, and every query is
 * derived from that judgment's own primary text or its own structured metadata —
 * never from a model's description of it, and never from a reporter's headnote.
 * `docs/DATASETS.md`: primary sources only.
 *
 * A previous gold set was found to route on the `case_type` of the CITING
 * judgment, which production cannot compute — a query property that is not a
 * property of the query. Nothing here uses a field the server would not have at
 * query time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE UNAVAILABLE-TARGET RULE, PRESERVED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A target that is not retrievable — no vector, damaged body, refused by
 * eligibility — stays in the set and counts as an END-TO-END MISS. Removing it
 * would measure the retriever against the corpus it wishes it had.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SPLITTING BY CLUSTER, NOT BY ROW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The split key is the target judgment id, so every query about one authority
 * lands in one split. Splitting by row would put a doctrine query in train and
 * its own fact-pattern sibling in the holdout, and the holdout would be
 * measuring memorisation.
 */
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUT = 'docs/ai/new2-r7';
mkdirSync(OUT, { recursive: true });

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(url, { ssl: false, max: 1, idle_timeout: 30, statement_timeout: 1_800_000 });

const PER_FAMILY = Number(process.env['N2_GOLD_PER_FAMILY'] ?? 60);

/** Deterministic split on the TARGET id. 60 / 20 / 20. */
function splitFor(judgmentId) {
  const h = parseInt(createHash('md5').update(String(judgmentId)).digest('hex').slice(0, 8), 16) % 100;
  return h < 60 ? 'train' : h < 80 ? 'dev' : 'holdout';
}

const families = [];

/* ── exact identity — the query IS the citation ─────────────────────────── */
families.push({
  family: 'exact_identity',
  rows: await sql`
    SELECT j.id, j.case_title, j.neutral_citation, j.court, j.judgment_date, j.case_number
    FROM judgments j
    WHERE j.neutral_citation IS NOT NULL AND j.neutral_citation <> ''
      AND upper(regexp_replace(j.neutral_citation,'[^A-Za-z0-9]','','g'))
          !~ '^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$'
      AND EXISTS (SELECT 1 FROM judgment_citation_keys k
                  WHERE k.judgment_id = j.id AND k.source = 'neutral'
                  GROUP BY k.citation_key HAVING count(*) = 1)
      AND ('x' || substr(md5(j.id::text),1,8))::bit(32)::bigint % 997 = 3
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({ query: r.neutral_citation, why: 'the judgment’s own neutral citation, unique in the key index' }),
});

/* ── case-title identity ────────────────────────────────────────────────── */
families.push({
  family: 'case_title_identity',
  rows: await sql`
    SELECT j.id, j.case_title, j.neutral_citation, j.court, j.judgment_date, j.case_number
    FROM judgments j
    WHERE j.case_title ~ ' [Vv][Ss]?\\.? '
      AND length(j.case_title) BETWEEN 20 AND 90
      AND ('x' || substr(md5(j.id::text),1,8))::bit(32)::bigint % 4001 = 7
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({ query: r.case_title, why: 'the judgment’s own case title, verbatim from the row' }),
});

/* ── statute reference — the query is a provision the judgment itself cites ─ */
families.push({
  family: 'statute',
  rows: await sql`
    SELECT j.id, j.case_title, j.neutral_citation, j.court, j.judgment_date, j.case_number,
           s.act_named, s.section_number
    FROM judgment_statute_refs s
    JOIN judgments j ON j.id = s.judgment_id
    WHERE s.section_number IS NOT NULL AND s.act_named IS NOT NULL
      AND ('x' || substr(md5(s.id::text),1,8))::bit(32)::bigint % 601 = 5
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({
    query: `section ${r.section_number} ${r.act_named}`,
    why: 'a statute reference extracted from this judgment’s own text',
  }),
});

/* ── pasted passage — a real span of the judgment, verbatim ─────────────── */
families.push({
  family: 'pasted_passage',
  rows: await sql`
    SELECT j.id, j.case_title, j.neutral_citation, j.court, j.judgment_date, j.case_number,
           p.paragraph_text
    FROM judgment_paragraphs p
    JOIN judgments j ON j.id = p.judgment_id
    WHERE p.char_length BETWEEN 400 AND 1200
      AND p.paragraph_index > 2
      AND ('x' || substr(md5(p.id::text),1,8))::bit(32)::bigint % 40009 = 11
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({ query: String(r.paragraph_text).replace(/\s+/g, ' ').trim().slice(0, 600), why: 'a verbatim paragraph of the target judgment' }),
});

/* ── long narrative — several of the judgment's own paragraphs ──────────── */
families.push({
  family: 'long_narrative',
  rows: await sql`
    SELECT j.id, j.case_title, j.neutral_citation, j.court, j.judgment_date, j.case_number,
           string_agg(p.paragraph_text, ' ' ORDER BY p.paragraph_index) AS narrative
    FROM judgment_paragraphs p
    JOIN judgments j ON j.id = p.judgment_id
    WHERE p.paragraph_index BETWEEN 1 AND 3
      AND ('x' || substr(md5(j.id::text),1,8))::bit(32)::bigint % 20011 = 9
    GROUP BY j.id, j.case_title, j.neutral_citation, j.court, j.judgment_date, j.case_number
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({ query: String(r.narrative).replace(/\s+/g, ' ').trim().slice(0, 1800), why: 'the target judgment’s own opening narrative' }),
});

/* ── supporting authority — an authority this judgment FOLLOWED ─────────── */
families.push({
  family: 'supporting_authority',
  rows: await sql`
    SELECT cited.id, cited.case_title, cited.neutral_citation, cited.court, cited.judgment_date, cited.case_number,
           c.citation_text, citing.case_title AS citing_title
    FROM judgment_citations c
    JOIN judgments cited  ON cited.id  = c.cited_judgment_id
    JOIN judgments citing ON citing.id = c.citing_judgment_id
    WHERE c.relationship = 'followed'
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({ query: r.citation_text, why: `an authority FOLLOWED by "${String(r.citing_title).slice(0, 60)}"` }),
});

/* ── adverse authority — an authority this judgment DISTINGUISHED ───────── */
families.push({
  family: 'adverse_authority',
  rows: await sql`
    SELECT cited.id, cited.case_title, cited.neutral_citation, cited.court, cited.judgment_date, cited.case_number,
           c.citation_text, citing.case_title AS citing_title
    FROM judgment_citations c
    JOIN judgments cited  ON cited.id  = c.cited_judgment_id
    JOIN judgments citing ON citing.id = c.citing_judgment_id
    WHERE c.relationship IN ('distinguished','doubted','overruled','overruled_in_part')
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({ query: r.citation_text, why: `an authority ${'DISTINGUISHED/DOUBTED/OVERRULED'} by "${String(r.citing_title).slice(0, 60)}"` }),
});

/* ── old/new criminal-law transition ───────────────────────────────────── */
families.push({
  family: 'criminal_code_transition',
  rows: await sql`
    SELECT j.id, j.case_title, j.neutral_citation, j.court, j.judgment_date, j.case_number,
           s.act_named, s.section_number
    FROM judgment_statute_refs s
    JOIN judgments j ON j.id = s.judgment_id
    WHERE s.act_key IN ('INDIAN PENAL CODE','CODE OF CRIMINAL PROCEDURE','INDIAN EVIDENCE ACT',
                        'BHARATIYA NYAYA SANHITA','BHARATIYA NAGARIK SURAKSHA SANHITA','BHARATIYA SAKSHYA ADHINIYAM')
      AND s.section_number IS NOT NULL
      AND ('x' || substr(md5(s.id::text),1,8))::bit(32)::bigint % 401 = 13
    LIMIT ${PER_FAMILY}`,
  build: (r) => ({
    query: `section ${r.section_number} ${r.act_named}`,
    why: 'old/new criminal-code transition family — the target cites this provision',
  }),
});

/* ── assemble, and record retrievability WITHOUT letting it filter ─────── */
const all = [];
for (const f of families) {
  for (const r of f.rows) {
    const b = f.build(r);
    if (!b.query || String(b.query).trim().length < 4) continue;
    all.push({
      id: `${f.family}:${String(r.id).slice(0, 8)}`,
      family: f.family,
      query: b.query,
      why: b.why,
      target_judgment_id: r.id,
      target_case_title: r.case_title,
      target_neutral_citation: r.neutral_citation ?? null,
      target_court: r.court,
      target_year: r.judgment_date ? new Date(r.judgment_date).getUTCFullYear() : null,
      target_case_number: r.case_number ?? null,
      cluster: r.id,
      split: splitFor(r.id),
    });
  }
}

/* Held / indexable state per target. Recorded, never used to drop a row. */
const ids = [...new Set(all.map((a) => a.target_judgment_id))];
const state = new Map();
for (let i = 0; i < ids.length; i += 500) {
  const chunk = ids.slice(i, i + 500);
  const rows = await sql`
    SELECT j.id,
           (SELECT count(*) > 0 FROM new1_doc_vector_stage v WHERE v.judgment_id = j.id) AS has_vector,
           (SELECT count(*) > 0 FROM judgment_chunks c WHERE c.judgment_id = j.id) AS has_chunks,
           j.script_quality
    FROM judgments j WHERE j.id = ANY(${chunk})`;
  for (const r of rows) state.set(r.id, r);
}
for (const a of all) {
  const s = state.get(a.target_judgment_id);
  a.held = true;
  a.has_vector = s?.has_vector ?? false;
  a.has_chunks = s?.has_chunks ?? false;
  a.body_safe = !s?.script_quality || ['clean', 'mixed_script_ok'].includes(s.script_quality);
  a.retrievable_today = a.has_vector || a.has_chunks;
}

const bySplit = { train: [], dev: [], holdout: [] };
for (const a of all) bySplit[a.split].push(a);

const stats = (rows) => ({
  n: rows.length,
  by_family: rows.reduce((m, r) => ((m[r.family] = (m[r.family] ?? 0) + 1), m), {}),
  retrievable_today: rows.filter((r) => r.retrievable_today).length,
  body_safe: rows.filter((r) => r.body_safe).length,
});

const manifest = {
  artifact: 'ADVOCATE_RETRIEVAL_GOLD_V2',
  version: '2.0.0',
  generated_at: new Date().toISOString(),
  lane: 'NEW2',
  holdout_owner: 'FIFTH',
  rules: {
    primary_source_bound: 'every query derives from the target judgment’s own text or structured metadata; no model description, no reporter headnote',
    unavailable_target: 'a target that cannot be retrieved stays in the set and counts as an END-TO-END MISS',
    split_key: 'target judgment id, so all queries about one authority share a split',
    split_ratio: '60 train / 20 dev / 20 holdout',
    no_query_property_the_server_lacks: 'nothing routes on a field production cannot compute at query time',
  },
  totals: stats(all),
  train: stats(bySplit.train),
  dev: stats(bySplit.dev),
  holdout: { n: bySplit.holdout.length, note: 'contents withheld — see advocate-gold-v2-HOLDOUT.json, FIFTH only' },
};

writeFileSync(`${OUT}/ADVOCATE_RETRIEVAL_GOLD_V2.manifest.json`, JSON.stringify(manifest, null, 1));
writeFileSync(`${OUT}/advocate-gold-v2-train.json`, JSON.stringify(bySplit.train, null, 1));
writeFileSync(`${OUT}/advocate-gold-v2-dev.json`, JSON.stringify(bySplit.dev, null, 1));
writeFileSync(`${OUT}/advocate-gold-v2-HOLDOUT.json`, JSON.stringify(bySplit.holdout, null, 1));

console.log(JSON.stringify(manifest, null, 1));
console.log('\nWROTE train/dev/HOLDOUT. HOLDOUT is FIFTH-owned: implementation lanes must not read it.');
await sql.end();
