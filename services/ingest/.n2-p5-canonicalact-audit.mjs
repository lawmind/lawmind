/**
 * NEW2 P5.1 — audit LCC's `canonicalAct` repair (bus 1015) as a NORMALIZATION
 * change, on my own table.
 *
 * The instruction is explicit: verify the moved rows and the refusals, and do
 * not revert a correct derived-key repair merely because another lane wrote it.
 * So this checks the two things that can go wrong with a merge rule and nothing
 * else:
 *
 *   MOVED     every key now folded into BNS/BNSS/BSA — is `act_named`, the
 *             court's own printed words, really that statute?
 *   REFUSED   every key that ENDS in SANHITA or ADHINIYAM and was NOT folded —
 *             is it correctly left alone? A State revenue Sanhita swept into
 *             BNSS would be invisible in the merge counts and fatal in search.
 *
 * `act_named` is the evidence and is untouched by the repair, which is what
 * makes this auditable at all. Read-only.
 */
import postgres from 'postgres';
import { writeFileSync } from 'node:fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 0, prepare: false, connect_timeout: 30 });
const OUT = 'docs/ai/new2/canonicalact-audit.json';

/** The three 2023 codes, by the ending bigram LCC's rule keys on. */
const EXPECT = {
  'BHARATIYA NYAYA SANHITA': /NYAYA?A?\s+SANHITA/i,
  'BHARATIYA NAGARIK SURAKSHA SANHITA': /SURAK\w*\s+SANHITA/i,
  'BHARATIYA SAKSHYA ADHINIYAM': /SAK\w*\s+ADHINIYAM/i,
};

const report = { generatedAt: new Date().toISOString(), audits: {} };
const save = () => writeFileSync(OUT, JSON.stringify(report, null, 1));

try {
  await sql`set statement_timeout = 0`;

  // ---- 1. the population, as it stands now -------------------------------
  const totals = await sql`
    select act_key, count(*)::int refs, count(distinct act_named)::int distinct_named
      from judgment_statute_refs
     where act_key in ('BHARATIYA NYAYA SANHITA','BHARATIYA NAGARIK SURAKSHA SANHITA','BHARATIYA SAKSHYA ADHINIYAM')
     group by 1 order by 2 desc`;
  report.audits.current_totals = totals;
  console.log('current totals: ' + totals.map((t) => t.act_key + '=' + t.refs + ' (' + t.distinct_named + ' spellings)').join('  '));
  save();

  // ---- 2. MOVED: is every folded spelling really that statute? ------------
  const named = await sql`
    select act_key, act_named, count(*)::int refs
      from judgment_statute_refs
     where act_key in ('BHARATIYA NYAYA SANHITA','BHARATIYA NAGARIK SURAKSHA SANHITA','BHARATIYA SAKSHYA ADHINIYAM')
     group by 1,2 order by 3 desc`;
  const wrongMerge = [];
  for (const n of named) {
    const re = EXPECT[n.act_key];
    const s = String(n.act_named ?? '');
    // The abbreviation itself is a legitimate spelling and does not contain the
    // title bigram, so it is checked separately rather than counted as a miss.
    const isAbbrev = /^(BNS|BNSS|BSA)\b/i.test(s.trim());
    if (!isAbbrev && !re.test(s)) wrongMerge.push({ act_key: n.act_key, act_named: s.slice(0, 90), refs: n.refs });
  }
  report.audits.moved = {
    distinct_spellings_checked: named.length,
    spellings_not_matching_their_key: wrongMerge.length,
    refs_not_matching_their_key: wrongMerge.reduce((a, b) => a + b.refs, 0),
    examples: wrongMerge.slice(0, 25),
  };
  console.log('moved: ' + named.length + ' spellings checked, ' + wrongMerge.length + ' do not match their key');
  save();

  // ---- 3. REFUSED: what ends in SANHITA/ADHINIYAM and was left alone? -----
  const refused = await sql`
    select act_key, min(act_named) as an_example, count(*)::int refs
      from judgment_statute_refs
     where act_key not in ('BHARATIYA NYAYA SANHITA','BHARATIYA NAGARIK SURAKSHA SANHITA','BHARATIYA SAKSHYA ADHINIYAM')
       and (act_key ~* '(SANHITA|ADHINIYAM)\\s*$' or act_named ~* '(SANHITA|ADHINIYAM)\\s*$')
     group by 1 order by 3 desc limit 200`;
  const wrongRefusal = refused.filter((r) => Object.values(EXPECT).some((re) => re.test(String(r.act_key)) || re.test(String(r.an_example ?? ''))));
  report.audits.refused = {
    distinct_keys_ending_sanhita_or_adhiniyam_left_alone: refused.length,
    refs_left_alone: refused.reduce((a, b) => a + b.refs, 0),
    refusals_that_should_have_merged: wrongRefusal.length,
    wrong_refusal_examples: wrongRefusal.slice(0, 20),
    sample_correct_refusals: refused.slice(0, 20).map((r) => ({ act_key: String(r.act_key).slice(0, 70), refs: r.refs })),
  };
  console.log('refused: ' + refused.length + ' distinct keys left alone, ' + wrongRefusal.length + ' of them look like a missed merge');
  save();

  // ---- 4. the cross-table invariant LCC says is now tested ----------------
  const abbrevVsTitle = await sql`
    select act_key, count(*) filter (where act_named ~* '^\\s*(BNS|BNSS|BSA)\\b')::int as abbrev_spellings,
           count(*) filter (where act_named !~* '^\\s*(BNS|BNSS|BSA)\\b')::int as title_spellings
      from judgment_statute_refs where act_key in ('BHARATIYA NYAYA SANHITA','BHARATIYA NAGARIK SURAKSHA SANHITA','BHARATIYA SAKSHYA ADHINIYAM') group by 1`;
  report.audits.abbrev_and_title_share_one_key = abbrevVsTitle;
  save();

  // ---- 5. did the repair change `act_named`? it must not ------------------
  const namedIntegrity = await sql`
    select count(*)::int refs, count(*) filter (where act_named is null or act_named = '')::int empty_named
      from judgment_statute_refs where act_key in ('BHARATIYA NYAYA SANHITA','BHARATIYA NAGARIK SURAKSHA SANHITA','BHARATIYA SAKSHYA ADHINIYAM')`;
  report.audits.act_named_integrity = namedIntegrity[0];

  // ---- 6. does anything OUTSIDE the three codes now key to them? ----------
  const strays = await sql`
    select act_named, count(*)::int refs from judgment_statute_refs
     where act_key in ('BHARATIYA NYAYA SANHITA','BHARATIYA NAGARIK SURAKSHA SANHITA','BHARATIYA SAKSHYA ADHINIYAM')
       and act_named !~* '(NYAY|SURAK|SAKSH|SAKHY|BNS|BNSS|BSA)'
     group by 1 order by 2 desc limit 20`;
  report.audits.strays_keyed_to_the_2023_codes = strays;
  console.log('strays keyed to the three codes: ' + strays.length);

  report.verdict = (wrongMerge.length === 0 && wrongRefusal.length === 0 && strays.length === 0)
    ? 'REPAIR_CONFIRMED — every folded spelling names the statute it was folded into, and nothing ending SANHITA or ADHINIYAM was swept in wrongly'
    : 'REPAIR_HAS_EXCEPTIONS — see moved.examples, refused.wrong_refusal_examples and strays';
  save();
  console.log('\nVERDICT: ' + report.verdict);
} catch (e) {
  console.error('ERR ' + e.message + '\n' + e.stack);
  report.error = e.message;
  save();
  process.exitCode = 1;
}
await sql.end();
