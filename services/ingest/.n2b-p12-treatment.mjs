/**
 * NEW2 P11/P12 — how much evidence a treatment claim actually rests on.
 *
 * The founder's rule: a resolved edge establishes TARGET IDENTITY and nothing
 * else. Treatment (FOLLOWED / DISTINGUISHED / OVERRULED / …) is a separate
 * system that needs its own evidence. This measures what we have today:
 *
 *   1. how many resolved edges carry a treatment at all
 *   2. where the treatment came from  (detectTreatment reads a trailing verb)
 *   3. PRECISION FIRST — on a hand-checkable sample, does the citing paragraph
 *      actually say the court did that, and is the SPEAKER the court rather
 *      than counsel reciting a submission?
 *
 * Precision is measured before any coverage number is quoted, because a false
 * adverse treatment is the damaging direction and a false "still good" is the
 * other damaging direction. Read-only.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000 });
const OUT = 'docs/ai/new2/treatment-evidence-study.json';
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');

/** Phrases that mean COUNSEL is speaking, not the court. */
const SUBMISSION = /(learned counsel|learned senior counsel|learned advocate|learned ASG|learned AGA|it is submitted|submitted that|contended that|contention|placed reliance|relied upon by the (petitioner|appellant|respondent)|argued that|urged that|per contra)/i;
/** Phrases that mean the COURT is speaking. */
const COURT_VOICE = /(we are of the (considered )?(view|opinion)|in our (considered )?(view|opinion)|this court (has |is |now )|we (respectfully )?(follow|agree|hold|find|are bound)|held that|it is well settled|we are bound by|following the (decision|judgment|ratio))/i;

const out = { generatedAt: new Date().toISOString(), coverage: {}, precision: {}, records: [] };
try {
  // ---- 1 · coverage: how many edges carry a treatment at all --------------
  const cov = await sql.unsafe(`
    select relationship, count(*)::text n,
           count(*) filter (where cited_judgment_id is not null)::text pinned
      from judgment_citations
     where relationship <> 'cites'
     group by 1 order by 2 desc`);
  const resolved = Number((await sql.unsafe(`select count(*)::text n from judgment_citations where cited_judgment_id is not null`))[0].n);
  const treated = cov.reduce((a, r) => a + Number(r.n), 0);
  const treatedPinned = cov.reduce((a, r) => a + Number(r.pinned), 0);
  out.coverage = {
    resolved_edges: resolved,
    edges_with_a_treatment: treated,
    treated_and_pinned: treatedPinned,
    treated_pinned_share_of_resolved_pct: +(treatedPinned / resolved * 100).toFixed(3),
    by_relationship: Object.fromEntries(cov.map((r) => [r.relationship, { rows: Number(r.n), pinned: Number(r.pinned) }])),
    writer: 'services/ingest/src/citations.ts detectTreatment(text, end) — reads a TRAILING annotation after the citation, never the resolution result',
  };
  console.log(JSON.stringify(out.coverage, null, 1));

  // ---- 2 · precision, on the evidence the writer actually used ------------
  const sample = await sql.unsafe(`
    select c.id, c.citation_text, c.relationship, c.evidence, c.char_offset,
           c.citing_judgment_id, c.cited_judgment_id,
           j.court, j.case_title,
           substr(j.full_text, greatest(1, c.char_offset - 700), 700 + length(c.citation_text) + 400) as span
      from judgment_citations c join judgments j on j.id = c.citing_judgment_id
     where c.relationship <> 'cites'
     limit 120`);
  console.log('\nsampled treated edges:', sample.length);

  let courtVoice = 0; let submissionVoice = 0; let ambiguousVoice = 0; let verbPresent = 0;
  for (const e of sample) {
    const span = flat(e.span);
    const needle = flat(e.citation_text).trim();
    const at = span.indexOf(needle);
    const before = at > 0 ? span.slice(Math.max(0, at - 420), at) : span.slice(0, 420);
    const after = at >= 0 ? span.slice(at + needle.length, at + needle.length + 260) : '';
    const window = before + ' ⟦CITE⟧ ' + after;

    const isSub = SUBMISSION.test(before) || SUBMISSION.test(after);
    const isCourt = COURT_VOICE.test(before) || COURT_VOICE.test(after);
    const verb = new RegExp(e.relationship === 'relied_on' ? 'relied' : e.relationship.replace(/_/g, ' '), 'i').test(after)
      || new RegExp(e.relationship === 'relied_on' ? 'relied' : e.relationship.replace(/_/g, ' '), 'i').test(before);
    if (verb) verbPresent += 1;

    let speaker;
    if (isSub && !isCourt) { speaker = 'COUNSEL_SUBMISSION'; submissionVoice += 1; }
    else if (isCourt && !isSub) { speaker = 'COURT'; courtVoice += 1; }
    else if (isCourt && isSub) { speaker = 'BOTH_PRESENT_UNRESOLVED'; ambiguousVoice += 1; }
    else { speaker = 'NO_SPEAKER_SIGNAL'; ambiguousVoice += 1; }

    out.records.push({
      edge_id: e.id,
      citation_text: e.citation_text,
      stored_relationship: e.relationship,
      stored_evidence: e.evidence,
      pinned: !!e.cited_judgment_id,
      citing_court: e.court,
      speaker_signal: speaker,
      verb_found_in_window: verb,
      window: window.slice(0, 700),
    });
  }
  const n = sample.length;
  out.precision = {
    sample_n: n,
    verb_found_in_window: verbPresent,
    speaker: {
      COURT: courtVoice,
      COUNSEL_SUBMISSION: submissionVoice,
      UNRESOLVED: ambiguousVoice,
    },
    court_voice_pct: +(courtVoice / n * 100).toFixed(2),
    counsel_voice_pct: +(submissionVoice / n * 100).toFixed(2),
    unresolved_pct: +(ambiguousVoice / n * 100).toFixed(2),
    caveat: 'This is a MECHANICAL speaker screen, not a legal reading. It answers "is there a court-voice signal near this citation", which bounds how much a verb alone can be trusted; it does not certify any single treatment as correct.',
  };
  console.log(JSON.stringify(out.precision, null, 1));
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('\nwritten ->', OUT);
} finally { await sql.end(); }
