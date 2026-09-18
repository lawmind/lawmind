/**
 * NEW1 P16 — score the BNS/BNSS/BSA transition against NEW3's verified gold.
 *
 * `docs/ai/new3-statute-transition-gold.json`, 11 cases across all three act
 * pairs and seven categories. Every date, row and URL in it was read live from
 * the cluster; nothing was supplied from memory, which is the only way a gold set
 * about a mapping can be trusted at all.
 *
 * WHAT IS ACTUALLY BEING TESTED
 * -----------------------------
 * Two functions with opposite failure modes.
 *
 * `assessTransition` must answer WHICH CODE governs, and its interesting case is
 * the one where it must refuse: no offence date means `indeterminate`, ask for the
 * date, name no section. A confident `pre_bns` there is the defect.
 *
 * `correspondingProvisions` must answer WHICH SECTION corresponds, from
 * `statute_mappings` and nothing else. Four of the BNS's 358 sections have a
 * mapping, so `held: false` is the overwhelmingly common answer and the two
 * `NO_PROVEN_MAPPING` cases are deliberate traps: **IPC 420 and CrPC 154** are the
 * two section numbers every practitioner knows, and a model answering from memory
 * would very likely produce IPC 420 -> BNS 318 correctly by coincidence. Getting
 * it right that way is the failure, not the success.
 *
 * A `held: false` is only ever "nobody has read the correspondence for this
 * section" and never "there is no counterpart" — those are our ignorance and a
 * positive legislative finding, and only the second would be a legal claim.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assessTransition, correspondingProvisions } from '@lawmind/api/statutes/transition';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GOLD = join(ROOT, 'docs/ai/new3-statute-transition-gold.json');
const OUT = join(ROOT, 'docs/ai/new1-tier-a/statute-transition-score.json');

type GoldCase = {
  case_id: string;
  category: string;
  input: { text?: string; offenceDate?: string | null; act?: string; section?: string };
  expected: Record<string, unknown>;
  why?: string;
};

type Scored = {
  caseId: string;
  category: string;
  pass: boolean;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  note: string;
};

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1, ssl: sslFor(url), onnotice: () => {} });
  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as {
    cases: GoldCase[];
    sharedFacts: Record<string, unknown>;
  };

  const scored: Scored[] = [];
  try {
    for (const c of gold.cases) {
      if (c.input.act && c.input.section) {
        const got = await correspondingProvisions(sql, c.input.act, c.input.section);
        const expectHeld = c.expected['held'] === true;
        const actual: Record<string, unknown> = got.held
          ? {
              held: true,
              rowCount: got.rows.length,
              relationships: [...new Set(got.rows.map((r) => r.relationship))],
            }
          : { held: false, why: got.why };

        let pass = got.held === expectHeld;
        let note = '';
        if (pass && got.held) {
          // Row count and relationship are checked only when the gold states
          // them: a gold that names `rowCount` is asserting the shape of the
          // correspondence, and one that does not is asserting only that it is
          // held. Inventing the stricter reading would fail a case the gold
          // never made a claim about.
          if (
            typeof c.expected['rowCount'] === 'number' &&
            got.rows.length !== c.expected['rowCount']
          ) {
            pass = false;
            note = `rowCount ${got.rows.length}, expected ${String(c.expected['rowCount'])}`;
          }
          const wantRel = c.expected['relationship'];
          if (
            pass &&
            typeof wantRel === 'string' &&
            !got.rows.some((r) => r.relationship === wantRel)
          ) {
            pass = false;
            note = `no row with relationship ${wantRel}`;
          }
        }
        if (pass && !got.held) {
          // The wording is the product: a `held: false` that reads as "there is
          // no counterpart" would be a legal claim we have no basis for.
          //
          // Checked POSITIVELY, and the first version of this check was wrong in
          // exactly the way this lane has complained about in someone else's
          // fixture. It searched for absence language and failed both cases on
          // the phrase "no counterpart" — inside the sentence
          // "...and NOT that no counterpart exists", which is the correct
          // wording denying absence. A bare substring cannot see a negation, so
          // it fires inside the very refusal it is meant to approve.
          //
          // Requiring the IGNORANCE language to be present has no such failure
          // mode: a message that asserts absence will not contain it.
          const why = got.why.toLowerCase();
          const saysIgnorance = /unmapped|nobody has read|not been read/.test(why);
          if (!saysIgnorance) {
            pass = false;
            note =
              'held:false wording does not say UNMAPPED — a reader could take it as a finding of no counterpart';
          }
        }
        scored.push({
          caseId: c.case_id,
          category: c.category,
          pass,
          expected: c.expected,
          actual,
          note,
        });
        continue;
      }

      const verdict = await assessTransition(sql, {
        text: c.input.text ?? '',
        ...(c.input.offenceDate ? { offenceDate: c.input.offenceDate } : {}),
      });
      const actual: Record<string, unknown> = {
        kind: verdict.kind,
        ...('regime' in verdict ? { regime: verdict.regime } : {}),
      };
      let pass = verdict.kind === c.expected['kind'];
      let note = '';
      if (pass && c.expected['regime'] && actual['regime'] !== c.expected['regime']) {
        pass = false;
        note = `regime ${String(actual['regime'])}, expected ${String(c.expected['regime'])}`;
      }
      if (pass && c.expected['mustAsk'] === 'offence_date') {
        // The indeterminate verdict has to ASK for the date. A refusal that does
        // not say what would unblock it is the failure adv-5 originally caught.
        const text = JSON.stringify(verdict).toLowerCase();
        if (!/offence.{0,20}date|date.{0,20}offence/.test(text)) {
          pass = false;
          note = 'indeterminate but does not ask for the offence date';
        }
      }
      scored.push({
        caseId: c.case_id,
        category: c.category,
        pass,
        expected: c.expected,
        actual,
        note,
      });
    }
  } finally {
    await sql.end({ timeout: 10 });
  }

  const passed = scored.filter((s) => s.pass).length;
  const byCategory: Record<string, { pass: number; total: number }> = {};
  for (const s of scored) {
    const b = (byCategory[s.category] ??= { pass: 0, total: 0 });
    b.total += 1;
    if (s.pass) b.pass += 1;
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_statute_transition_score',
        goldFile: 'docs/ai/new3-statute-transition-gold.json',
        measuredAt: new Date().toISOString(),
        passed,
        total: scored.length,
        byCategory,
        cases: scored,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`STATUTE TRANSITION GOLD  ${passed}/${scored.length}`);
  for (const [cat, b] of Object.entries(byCategory))
    console.log(`  ${cat.padEnd(30)} ${b.pass}/${b.total}`);
  for (const s of scored.filter((x) => !x.pass)) {
    console.log(`\n  FAIL ${s.caseId} (${s.category}) ${s.note}`);
    console.log(`    expected ${JSON.stringify(s.expected)}`);
    console.log(`    actual   ${JSON.stringify(s.actual)}`);
  }
  console.log(`\nwrote ${OUT}`);
  return passed === scored.length ? 0 : 1;
}

process.exitCode = await main();
