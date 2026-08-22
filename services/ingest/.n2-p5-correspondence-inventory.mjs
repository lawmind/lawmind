/**
 * NEW2 P5.2/P5.3 — the official BNS / BNSS / BSA correspondence inventory, typed.
 *
 * Two questions, kept apart:
 *
 *   COVERAGE   how much of each new code has an official correspondence row at
 *              all? A section with no row is NO_OFFICIAL_MAPPING_FOUND, which is
 *              a fact about us, not about the law.
 *   VALIDITY   does each row's `new_section` actually EXIST in that code? We hold
 *              the enacted text of all three codes in `statute_sections`, so this
 *              is checkable against primary material rather than against belief.
 *
 * Validity is checked because reading a handful of rows showed the parse is not
 * clean — `old 2 -> new 531R` where the row's own evidence string says
 * "531 Repeal and savings. 484 No change", i.e. BNSS 531 corresponds to CrPC
 * 484. The letter is the first character of the heading, glued to the number.
 *
 * Nothing is repaired here and no mapping is generated. Correspondence is not
 * applicability, and a row that cannot be validated is reported, never used.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const OUT = 'docs/ai/new2/bns-correspondence-inventory.json';

/** The typed vocabulary the round requires. Nothing outside this list is emitted. */
const TYPES = [
  'OFFICIAL_EXACT', 'OFFICIAL_ONE_TO_MANY', 'OFFICIAL_MANY_TO_ONE', 'OFFICIAL_PARTIAL',
  'OFFICIAL_NO_EQUIVALENT', 'NEW_PROVISION', 'REPEALED_NO_DIRECT_EQUIVALENT',
  'COMPLEX', 'NO_OFFICIAL_MAPPING_FOUND',
];

const ACTS = [
  { key: 'bns', title: 'The Bharatiya Nyaya Sanhita, 2023', old: 'ipc', old_name: 'Indian Penal Code, 1860' },
  { key: 'bnss', title: 'The Bharatiya Nagarik Suraksha Sanhita, 2023', old: 'crpc', old_name: 'Code of Criminal Procedure, 1973' },
  { key: 'bsa', title: 'The Bharatiya Sakshya Adhiniyam, 2023', old: 'evidence', old_name: 'Indian Evidence Act, 1872' },
];

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
/** `531R` -> `531`; `2(1)(a)` is left alone. A single trailing capital letter with
 *  no bracket is the parser's heading-bleed, not a real sub-section marker. */
const stripHeadingBleed = (s) => String(s ?? '').trim().replace(/^(\d+(?:\([^)]*\))*)[A-Z]$/, '$1');

const report = { generatedAt: new Date().toISOString(), typed_vocabulary: TYPES, acts: {} };

try {
  await sql`set statement_timeout = 0`;

  for (const act of ACTS) {
    const [statute] = await sql`select id, short_title, enforcement_date from statutes where short_title = ${act.title}`;
    const sections = await sql`select section_number, heading from statute_sections where statute_id = ${statute.id} order by order_index`;
    const held = new Map(sections.map((s) => [norm(s.section_number), s]));

    const rows = await sql`
      select old_act, old_section, new_section, relationship, note, evidence, source, authority_class, authority_body
        from statute_mappings where new_act = ${act.key}`;

    // How many old sections point at each new section, and vice versa — the
    // ONE_TO_MANY / MANY_TO_ONE distinction has to be read off the data, not off
    // the `relationship` word, which is the parser's opinion.
    const byNew = new Map();
    const byOld = new Map();
    for (const r of rows) {
      const n = norm(stripHeadingBleed(r.new_section));
      const o = norm(r.old_section);
      if (!byNew.has(n)) byNew.set(n, []);
      byNew.get(n).push(r);
      if (!byOld.has(o)) byOld.set(o, []);
      byOld.get(o).push(r);
    }

    const validated = rows.map((r) => {
      const rawNew = String(r.new_section ?? '').trim();
      const stripped = stripHeadingBleed(rawNew);
      const existsRaw = held.has(norm(rawNew));
      const existsStripped = held.has(norm(stripped));
      let validity;
      if (existsRaw) validity = 'NEW_SECTION_EXISTS';
      else if (existsStripped) validity = 'NEW_SECTION_EXISTS_ONLY_AFTER_STRIPPING_A_TRAILING_LETTER';
      else validity = 'NEW_SECTION_NOT_FOUND_IN_THE_ENACTED_TEXT';

      // The BPRD comparison line reads `<new section> <heading> <old section> <note>`,
      // so the row's own evidence string carries both numbers and is the only
      // witness available for the old one: we hold the enacted text of the three
      // NEW codes and none of the three OLD ones, so `old_section` cannot be
      // checked against primary material at all. That is a gap, stated as one.
      const ev = String(r.evidence ?? '');
      const evLead = (ev.match(/^\s*(\d+(?:\s*\([^)]*\))*)/) ?? [])[1];
      const evidenceAgrees = evLead ? norm(evLead) === norm(stripped) : null;
      // The next number after the heading text is the old section. Two spellings
      // appear: a bare number, and the BSA form `3, para 8`, which means old
      // section 3 paragraph 8 and is stored as `3(8)`. Reading the second form as
      // a bare `8` was my own first mistake here and it manufactured twelve
      // false contradictions in BSA before it was checked against the rows.
      const evRest = evLead ? ev.slice(ev.indexOf(evLead) + evLead.length) : ev;
      const para = evRest.match(/(\d{1,4})\s*,\s*para\s*(\d{1,3})/i);
      const evOld = para
        ? para[1] + '(' + para[2] + ')'
        : (evRest.match(/(?:^|\s)(\d{1,4}(?:\s*\([^)]*\))*(?:[A-Z]{1,2})?)(?=\s|$)/) ?? [])[1];
      const oldAgrees = evOld ? norm(evOld) === norm(r.old_section) : null;

      let type;
      const n = norm(stripped);
      const o = norm(r.old_section);
      if (validity === 'NEW_SECTION_NOT_FOUND_IN_THE_ENACTED_TEXT') type = 'COMPLEX';
      else if ((byOld.get(o) ?? []).length > 1) type = 'OFFICIAL_ONE_TO_MANY';
      else if ((byNew.get(n) ?? []).length > 1) type = 'OFFICIAL_MANY_TO_ONE';
      else if (r.relationship === 'exact') type = 'OFFICIAL_EXACT';
      else type = 'OFFICIAL_PARTIAL';

      return {
        old_act: r.old_act, old_section: r.old_section,
        new_section_as_parsed: rawNew, new_section_after_stripping: stripped,
        parser_relationship: r.relationship,
        validity, evidence_agrees_with_new_section: evidenceAgrees,
        old_section_in_evidence: evOld ?? null, evidence_agrees_with_old_section: oldAgrees,
        type, authority_class: r.authority_class, authority_body: r.authority_body,
        source: r.source,
        evidence: String(r.evidence ?? '').slice(0, 160),
      };
    });

    const mappedNew = new Set(validated.filter((v) => v.validity !== 'NEW_SECTION_NOT_FOUND_IN_THE_ENACTED_TEXT').map((v) => norm(v.new_section_after_stripping)));
    const unmapped = sections.filter((s) => !mappedNew.has(norm(s.section_number)));

    const typeTally = {};
    for (const v of validated) typeTally[v.type] = (typeTally[v.type] ?? 0) + 1;
    typeTally.NO_OFFICIAL_MAPPING_FOUND = unmapped.length;

    const validityTally = {};
    for (const v of validated) validityTally[v.validity] = (validityTally[v.validity] ?? 0) + 1;

    const agrees = validated.filter((v) => v.evidence_agrees_with_new_section === true).length;
    const disagrees = validated.filter((v) => v.evidence_agrees_with_new_section === false).length;

    report.acts[act.key] = {
      new_act: statute.short_title,
      replaced: act.old_name,
      enforcement_date: statute.enforcement_date ? new Date(statute.enforcement_date).toISOString().slice(0, 10) : null,
      sections_of_the_enacted_text_held: sections.length,
      official_correspondence_rows_held: rows.length,
      sections_with_at_least_one_usable_row: mappedNew.size,
      coverage_pct: +((mappedNew.size / sections.length) * 100).toFixed(2),
      typed_inventory: typeTally,
      row_validity: validityTally,
      row_self_consistency: {
        evidence_string_agrees_with_new_section: agrees,
        evidence_string_contradicts_new_section: disagrees,
        no_leading_section_number_in_evidence: validated.length - agrees - disagrees,
        old_section_agrees_with_evidence: validated.filter((v) => v.evidence_agrees_with_old_section === true).length,
        old_section_contradicts_evidence: validated.filter((v) => v.evidence_agrees_with_old_section === false).length,
        old_section_unverifiable: validated.filter((v) => v.evidence_agrees_with_old_section === null).length,
        note: 'the OLD section has no primary witness at all — we hold the enacted text of the three new codes and of none of the three they replaced',
      },
      old_section_contradiction_sample: validated.filter((v) => v.evidence_agrees_with_old_section === false).slice(0, 10),
      unmapped_sections_sample: unmapped.slice(0, 12).map((s) => ({ section: s.section_number, heading: String(s.heading ?? '').slice(0, 70) })),
      contradicting_rows_sample: validated.filter((v) => v.evidence_agrees_with_new_section === false).slice(0, 10),
      rows: validated,
    };

    console.log(act.key.toUpperCase().padEnd(6)
      + 'sections ' + String(sections.length).padStart(4)
      + ' | official rows ' + String(rows.length).padStart(4)
      + ' | coverage ' + String(report.acts[act.key].coverage_pct).padStart(6) + '%'
      + ' | evidence contradicts new_section on ' + disagrees + ' rows');
  }

  const totalSections = Object.values(report.acts).reduce((a, b) => a + b.sections_of_the_enacted_text_held, 0);
  const totalRows = Object.values(report.acts).reduce((a, b) => a + b.official_correspondence_rows_held, 0);
  const totalCovered = Object.values(report.acts).reduce((a, b) => a + b.sections_with_at_least_one_usable_row, 0);
  report.totals = {
    sections_of_enacted_text_held: totalSections,
    official_correspondence_rows_held: totalRows,
    sections_with_a_usable_official_row: totalCovered,
    coverage_pct: +((totalCovered / totalSections) * 100).toFixed(2),
    empty_types: TYPES.filter((t) => !Object.values(report.acts).some((a) => (a.typed_inventory[t] ?? 0) > 0)),
  };
  writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log('\nTOTAL  ' + totalCovered + ' of ' + totalSections + ' sections have a usable official correspondence row = ' + report.totals.coverage_pct + '%');
  console.log('types with zero rows (not asserted, because no source evidence produced them): ' + report.totals.empty_types.join(', '));
} catch (e) {
  console.error('ERR ' + e.message + '\n' + e.stack);
  report.error = e.message;
  writeFileSync(OUT, JSON.stringify(report, null, 1));
  process.exitCode = 1;
}
await sql.end();
