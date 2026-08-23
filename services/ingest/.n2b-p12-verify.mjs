import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30, statement_timeout: 900000 });
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');
const INV = /\b(dis[-\s]?(approv|agree)\w*)|(\b(not|never|cannot be said to be)\s+(be\s+)?(followed|approved|overruled|distinguished|doubted))|(\b(declin\w+|refus\w+)\s+to\s+(follow|approve|distinguish))/i;
for (const rel of ['approved','overruled','distinguished','doubted','overruled_in_part']) {
  const rows = await sql.unsafe(`
    select c.id, c.citation_text, c.cited_judgment_id, j.court,
           substr(j.full_text, greatest(1, c.char_offset - 220), 220 + length(c.citation_text) + 220) as span
      from judgment_citations c join judgments j on j.id = c.citing_judgment_id
     where c.relationship = '${rel}' limit 400`);
  let hits = 0;
  for (const r of rows) {
    const s = flat(r.span); const m = s.match(INV);
    if (!m) continue;
    hits++;
    const at = s.indexOf(m[0]);
    console.log(`\n[${rel}] pinned=${!!r.cited_judgment_id} MATCHED="${m[0]}" court=${r.court}`);
    console.log('   ...' + s.slice(Math.max(0, at - 120), at + 140) + '...');
  }
  console.log(`\n## ${rel}: ${rows.length} rows read, ${hits} matched`);
}
await sql.end();
