/**
 * NEW2 P4 — bind ADVOCATE-100 to held judgments, and guard it against leakage.
 *
 * The fifth agent authored a spec. This turns the authored task list into the
 * artifact NEW1 can run and the fifth agent can audit, by doing the three things
 * that separate a gold set from a wish list:
 *
 *   BIND     every target id is looked up. A task whose target is not held, and
 *            whose expected behaviour is not a refusal, FAILS binding and is
 *            reported rather than shipped.
 *   ENRICH   court, date, date_state, quality state, citation and source URL are
 *            read from the row, never from the author. The date state matters:
 *            a currentness task whose target carries DATE_SUSPECT must require
 *            qualification, not a confident chronology.
 *   GUARD    the longest shared word sequence between the query and the target's
 *            own text is measured. Above six words the query has borrowed the
 *            judgment's language and the task is measuring memory, not retrieval.
 *
 * Read-only against the database.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const IN = 'docs/ai/new2/advocate100-authored.json';
const OUT = 'docs/ai/new2/ADVOCATE100.json';
const LEAK_LIMIT = 6;

const authored = JSON.parse(readFileSync(IN, 'utf8'));

const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Longest common contiguous word run between a query and a document. */
function longestSharedRun(queryWords, docWords) {
  if (!queryWords.length || !docWords.length) return { length: 0, phrase: '' };
  const index = new Map();
  for (let i = 0; i < docWords.length; i += 1) {
    const w = docWords[i];
    if (!index.has(w)) index.set(w, []);
    const list = index.get(w);
    if (list.length < 400) list.push(i);
  }
  let best = 0;
  let bestAt = -1;
  for (let q = 0; q < queryWords.length; q += 1) {
    for (const start of index.get(queryWords[q]) ?? []) {
      let n = 0;
      while (q + n < queryWords.length && start + n < docWords.length && queryWords[q + n] === docWords[start + n]) n += 1;
      if (n > best) { best = n; bestAt = q; }
    }
  }
  return { length: best, phrase: bestAt >= 0 ? queryWords.slice(bestAt, bestAt + best).join(' ') : '' };
}

const out = {
  artifact: 'ADVOCATE-100',
  gold_set_version: authored.gold_set_version,
  bound_at: new Date().toISOString(),
  leakage_limit_words: LEAK_LIMIT,
  construction_rules: authored.construction_rules,
  summary: {},
  tasks: [],
};

try {
  await sql`set statement_timeout = 0`;

  for (const t of authored.tasks) {
    const task = { ...t, targets_bound: [], binding: 'OK', leakage: null, warnings: [] };

    // ---- resolve any selector into concrete ids --------------------------
    let ids = [...(t.targets ?? [])];
    if (t.target_selector?.by_neutral_citation) {
      const rows = await sql`select id from judgments where neutral_citation = ${t.target_selector.by_neutral_citation} order by judgment_date limit 400`;
      ids = rows.map((r) => r.id);
      task.selector_resolved_count = ids.length;
    }
    if (t.target_selector?.resolve_reporter) {
      const key = String(t.target_selector.resolve_reporter).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rows = await sql`
        select judgment_id as id from judgment_citation_keys where citation_key = ${key}
        union select judgment_id as id from judgment_citation_aliases where alias_key = ${key} limit 25`;
      ids = rows.map((r) => r.id);
      task.selector_resolved_count = ids.length;
      if (ids.length === 0) task.warnings.push('reporter citation resolves to no held judgment — task stands as REFUSE_TARGET_NOT_HELD');
    }
    if (t.target_selector?.statute_short_title) {
      const [s] = await sql`select id, short_title, act_number, act_year, enforcement_date, source_url from statutes where short_title = ${t.target_selector.statute_short_title}`;
      task.statute_target = s
        ? { id: s.id, short_title: s.short_title, act: s.act_number + ' of ' + s.act_year, enforcement_date: s.enforcement_date ? new Date(s.enforcement_date).toISOString().slice(0, 10) : null, source_url: s.source_url }
        : null;
      if (!s) { task.binding = 'FAILED'; task.warnings.push('statute row not held'); }
    }

    // ---- bind each judgment target ---------------------------------------
    if (ids.length) {
      const rows = await sql`
        select j.id, j.case_title, j.court, j.judgment_date, j.neutral_citation, j.case_number,
               j.source_url, j.overruled_status, j.overruled_paras, j.hc_document_class,
               j.script_quality, j.text_quality, length(j.full_text) as len,
               d.state as date_state, d.method as date_method, d.off_by_one_day,
               q.body_text_safe, q.metadata_discoverable, q.text_state, q.text_grade, q.citability, q.digit_trust
          from judgments j
          left join judgment_date_quality d on d.judgment_id = j.id
          left join judgment_quality_contract q on q.id = j.id
         where j.id = any(${ids}::uuid[])`;
      const found = new Set(rows.map((r) => r.id));
      for (const id of ids) if (!found.has(id)) { task.binding = 'FAILED'; task.warnings.push('target not held: ' + id); }

      task.targets_bound = rows.map((r) => ({
        judgment_id: r.id,
        case_title: r.case_title,
        court: r.court,
        judgment_date: r.judgment_date ? new Date(r.judgment_date).toISOString().slice(0, 10) : null,
        neutral_citation: r.neutral_citation,
        case_number: r.case_number,
        primary_source: r.source_url,
        overruled_status: r.overruled_status,
        overruled_paras: r.overruled_paras,
        role_class: r.hc_document_class,
        citability: r.citability,
        quality_state: {
          text_state: r.text_state,
          text_grade: r.text_grade,
          body_text_safe: r.body_text_safe,
          metadata_discoverable: r.metadata_discoverable,
          script_quality: r.script_quality,
          text_quality: r.text_quality === null ? null : Number(r.text_quality),
          digit_trust: r.digit_trust,
        },
        date_state: r.date_state ?? 'NOT_ANALYSED',
        date_method: r.date_method ?? null,
        off_by_one_day: r.off_by_one_day ?? null,
        length: r.len,
      }));

      // ---- date requirement, per the addendum ----------------------------
      const currentnessCritical = ['current_law', 'overruled', 'statute', 'bns_bnss_bsa', 'ipc_crpc_iea_correspondence'].includes(t.query_class);
      const suspect = task.targets_bound.filter((b) => b.date_state === 'DATE_SUSPECT' || b.date_state === 'DATE_UNKNOWN' || b.date_state === 'NOT_ANALYSED');
      task.date_requirement_resolved = currentnessCritical
        ? (suspect.length
          ? 'QUALIFY_OR_REFUSE_CHRONOLOGY — ' + suspect.length + ' of ' + task.targets_bound.length + ' targets carry ' + [...new Set(suspect.map((s) => s.date_state))].join('/')
          : 'DATE_VERIFIED on every target — a chronological claim is permitted')
        : (t.date_requirement ?? 'not chronology-critical');

      // ---- overruled expectation, read from the row, never asserted ------
      const moved = task.targets_bound.filter((b) => b.overruled_status && b.overruled_status !== 'none');
      if (t.query_class === 'overruled' && moved.length === 0) {
        task.warnings.push('authored as an overruled task but no bound target carries a non-none overruled_status');
        task.binding = 'FAILED';
      }
      task.law_moved_expected = moved.map((m) => ({ judgment_id: m.judgment_id, overruled_status: m.overruled_status, add_to_matter_disabled: m.overruled_status === 'set_aside' }));

      // ---- leakage guard -------------------------------------------------
      //
      // Identifier classes are exempt, and the exemption is structural rather
      // than a waiver: the query IS the citation or the case number, and a
      // document that did not contain its own identifier would be the defect.
      // The run is still measured and recorded, so an identifier query that
      // quietly grew a sentence around it is still visible.
      const IDENTIFIER_CLASSES = new Set(['citation', 'reporter_citation', 'case_number', 'cnr']);
      if (!t.leakage_exempt && t.query_class !== 'pasted_passage') {
        const qw = words(t.query);
        let worst = { length: 0, phrase: '', judgment_id: null };
        for (const b of task.targets_bound.slice(0, 4)) {
          const [doc] = await sql`select left(full_text, 200000) as ft from judgments where id = ${b.judgment_id}`;
          const run = longestSharedRun(qw, words(doc?.ft));
          if (run.length > worst.length) worst = { ...run, judgment_id: b.judgment_id };
        }
        const identifier = IDENTIFIER_CLASSES.has(t.query_class);
        const queryLen = words(t.query).length;
        // For an identifier query the whole query may legitimately appear in the
        // document; what must not happen is a run LONGER than the query itself.
        const pass = identifier ? worst.length <= queryLen : worst.length <= LEAK_LIMIT;
        task.leakage = {
          longest_shared_word_run: worst.length,
          phrase: worst.phrase,
          judgment_id: worst.judgment_id,
          query_words: queryLen,
          rule: identifier ? 'identifier class — the run may be as long as the query and no longer' : 'concept class — at most ' + LEAK_LIMIT + ' shared words',
          pass,
        };
        if (!pass) { task.binding = 'FAILED'; task.warnings.push('leakage: the query shares a ' + worst.length + '-word run with its target'); }
      } else {
        task.leakage = { exempt: true, reason: 'a pasted passage IS the target language by definition; the task is source identification, not concept retrieval' };
      }
    } else if (!/REFUSE|REJECT|CURRENTLY_UNSUPPORTED|ANSWER_FROM|RESOLVE_FROM|RESOLVE_OR_REFUSE/.test(String(t.expected))) {
      task.binding = 'FAILED';
      task.warnings.push('no target bound and the expected behaviour is not a refusal');
    }

    out.tasks.push(task);
    process.stdout.write(task.binding === 'OK' ? '.' : 'X');
  }
  console.log('');

  const byClass = {};
  for (const t of out.tasks) byClass[t.query_class] = (byClass[t.query_class] ?? 0) + 1;
  const families = new Set(out.tasks.map((t) => t.proposition_family));
  out.summary = {
    tasks: out.tasks.length,
    bound_ok: out.tasks.filter((t) => t.binding === 'OK').length,
    binding_failed: out.tasks.filter((t) => t.binding === 'FAILED').length,
    by_query_class: byClass,
    proposition_families: families.size,
    currently_unsupported: out.tasks.filter((t) => String(t.support_state ?? '').includes('CURRENTLY_UNSUPPORTED')).length,
    tasks_expecting_a_refusal: out.tasks.filter((t) => /REFUSE|REJECT/.test(String(t.expected))).length,
    distinct_target_judgments: new Set(out.tasks.flatMap((t) => t.targets_bound.map((b) => b.judgment_id))).size,
    leakage_failures: out.tasks.filter((t) => t.leakage && t.leakage.pass === false).length,
    date_states_across_targets: out.tasks.flatMap((t) => t.targets_bound.map((b) => b.date_state))
      .reduce((a, s) => { a[s] = (a[s] ?? 0) + 1; return a; }, {}),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.summary, null, 1));
  const failed = out.tasks.filter((t) => t.binding === 'FAILED');
  if (failed.length) {
    console.log('\nFAILED BINDING:');
    for (const f of failed) console.log('  ' + f.task_id + ' [' + f.query_class + '] ' + f.warnings.join('; '));
  }
} catch (e) {
  console.error('ERR ' + e.message + '\n' + e.stack);
  out.error = e.message;
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  process.exitCode = 1;
}
await sql.end();
