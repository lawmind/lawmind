/**
 * Authorities saved to a matter — the endpoint RCC found missing entirely
 * (bus 0027): no table, no route, and the client's "Add to a matter" button
 * had never had an `onPress`. `docs/SCHEMA_TRUTH.md` §matter_authorities.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres from 'postgres';

import { createApp } from '../app.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

async function seedAdvocate(tag: string) {
  const authId = `test-auth-${tag}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${email}, true)`;
  await sql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
            VALUES (${authId}, 'Adv', ${`+9199${Math.floor(Math.random() * 100000000)}`},
                    ${email}, 'unverified')`;
  return { authId, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

const matterBody = {
  caseTitle: 'State v. Authorities Fixture',
  court: 'Delhi High Court',
  caseType: 'criminal' as const,
  parties: { petitioner: 'State', respondent: 'Fixture' },
  clientName: 'Fixture',
  ourSide: 'accused' as const,
};

const auth = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

describe('matter authorities', () => {
  let owner: { authId: string; token: string };
  let stranger: { authId: string; token: string };
  let matterId: string;
  let judgmentId: string;
  let setAsideJudgmentId: string;
  /**
   * The replacement fixture's id, CAPTURED rather than looked up by title.
   *
   * It was already being RETURNED at creation and thrown away, so both the
   * teardown and the stale-overruled test re-found it with
   * `WHERE case_title = 'SYNTHETIC — Replacement Fixture'`. That predicate has
   * no usable index — `case_title`'s only index is `gin_trgm_ops`, which cannot
   * serve an equality — so each one was a sequential scan of a 151 GB relation.
   * Under load the teardown exceeded its budget and the whole suite hung there.
   *
   * It was also a cross-test hazard: deleting BY TITLE removes any concurrent
   * run's fixture as well as this one's, and this repository is worked by
   * several sessions against one database.
   */
  let replacementJudgmentId: string;
  /** Good law when saved, moved afterwards — the case RCC bus 0048 is about. */
  let movesJudgmentId: string;
  /** Pre-2013 shape: a reporter citation, no neutral one — RCC bus 0049. */
  let reporterOnlyJudgmentId: string;
  /**
   * R14 §A6 fixtures. Three judgments rather than one because the three fields
   * are decided by a TABLE (`precedential-effect.ts`), and a table is only
   * tested by the rows that disagree with each other: a set-aside that refuses,
   * an overruling that ALLOWS despite the strongest banner, and a defect that
   * must subtract a warning without adding a prohibition.
   */
  let policyJudgmentId: string;
  let partJudgmentId: string;
  let defectJudgmentId: string;

  before(async () => {
    owner = await seedAdvocate('own');
    stranger = await seedAdvocate('str');

    const created = await app.request('/matters', {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify(matterBody),
    });
    matterId = ((await created.json()) as { data: { matter: { matterId: string } } }).data.matter
      .matterId;

    const [j] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                             judgment_date, full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Authorities Fixture', 'FIX 2024 INSC 1', '{}', 'Test Court',
              '2024-01-01', 'synthetic fixture owned by authorities.test.ts', 'en',
              ${`test://authorities/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    judgmentId = j!.id;

    const [replacement] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                             judgment_date, full_text, language, source_url)
      VALUES ('SYNTHETIC — Replacement Fixture', 'FIX 2025 INSC 2', '{}', 'Test Court',
              '2025-01-01', 'synthetic fixture', 'en',
              ${`test://authorities/${crypto.randomUUID()}`})
      RETURNING id`;
    replacementJudgmentId = replacement!.id;

    const [sa] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                             full_text, language, source_url, overruled_status,
                             overruled_by_judgment_id)
      VALUES ('SYNTHETIC — Set Aside Fixture', '{}', 'Test Court', '2020-01-01',
              'synthetic fixture', 'en', ${`test://authorities/${crypto.randomUUID()}`},
              'set_aside', ${replacement!.id})
      RETURNING id`;
    setAsideJudgmentId = sa!.id;

    const [moves] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                             judgment_date, full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Still Good Law For Now', 'FIX 2023 INSC 3', '{}', 'Test Court',
              '2023-01-01', 'synthetic fixture', 'en',
              ${`test://authorities/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    movesJudgmentId = moves!.id;

    const [reporterOnly] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, reporter_citations, court, judgment_date,
                             full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Reporter Citation Only', '{"(2001) 3 SCC 111"}', 'Test Court',
              '2001-01-01', 'synthetic fixture', 'en',
              ${`test://authorities/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    reporterOnlyJudgmentId = reporterOnly!.id;

    // Good law when saved. Every R14 §A6 fact about it arrives later, which is
    // the point: none of it may be captured onto `matter_authorities`.
    const [policy] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                             judgment_date, full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Policy Fields Fixture', 'FIX 2022 INSC 4', '{}', 'Test Court',
              '2022-01-01', 'synthetic fixture', 'en',
              ${`test://authorities/${crypto.randomUUID()}`}, 'none')
      RETURNING id`;
    policyJudgmentId = policy!.id;

    const [part] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                             judgment_date, full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Partly Overruled Fixture', 'FIX 2021 INSC 5', '{}', 'Test Court',
              '2021-01-01', 'synthetic fixture', 'en',
              ${`test://authorities/${crypto.randomUUID()}`}, 'partly_set_aside')
      RETURNING id`;
    partJudgmentId = part!.id;

    // The Challappan shape: an adverse status whose ONLY evidence is a mood.
    const [defect] = await sql<{ id: string }[]>`
      INSERT INTO judgments (case_title, neutral_citation, reporter_citations, court,
                             judgment_date, full_text, language, source_url, overruled_status)
      VALUES ('SYNTHETIC — Evidence Defect Fixture', 'FIX 2020 INSC 6', '{}', 'Test Court',
              '2020-06-01', 'synthetic fixture', 'en',
              ${`test://authorities/${crypto.randomUUID()}`}, 'doubted')
      RETURNING id`;
    defectJudgmentId = defect!.id;
  });

  after(async () => {
    await sql`DELETE FROM matter_authorities WHERE matter_id = ${matterId}`;
    // Every edge this suite wrote is cited FROM the replacement fixture, and
    // `judgment_citations` is append-only in production — a test that leaves
    // rows behind leaves a permanent adverse edge on a real judgment id.
    await sql`DELETE FROM judgment_citations WHERE citing_judgment_id = ${replacementJudgmentId}`;
    await sql`DELETE FROM matters WHERE id = ${matterId}`;
    // Every fixture by PRIMARY KEY. See `replacementJudgmentId` for why the
    // title predicate that used to be here made this a 151 GB scan.
    await sql`DELETE FROM judgments WHERE id = ANY(${[
      judgmentId,
      setAsideJudgmentId,
      movesJudgmentId,
      reporterOnlyJudgmentId,
      replacementJudgmentId,
      policyJudgmentId,
      partJudgmentId,
      defectJudgmentId,
    ]}::uuid[])`;
    for (const a of [owner, stranger]) {
      await sql`DELETE FROM users WHERE auth_id = ${a.authId}`;
      await sql`DELETE FROM auth_user WHERE id = ${a.authId}`;
    }
    await sql.end();
  });

  it('refuses an anonymous caller on every verb', async () => {
    assert.equal((await app.request(`/matters/${matterId}/authorities`)).status, 401);
    assert.equal(
      (
        await app.request(`/matters/${matterId}/authorities`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ judgmentId }),
        })
      ).status,
      401,
    );
  });

  it('adds an authority and lists it back', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId }),
    });
    assert.equal(res.status, 201);
    const a = ((await res.json()) as { data: { authority: Record<string, unknown> } }).data
      .authority;
    assert.equal(a['judgmentId'], judgmentId);
    assert.equal(a['caseTitle'], 'SYNTHETIC — Authorities Fixture');
    assert.equal(a['neutralCitation'], 'FIX 2024 INSC 1');
    assert.equal(a['removedAt'], null);

    const list = await app.request(`/matters/${matterId}/authorities`, { headers: auth(owner.token) });
    const authorities = ((await list.json()) as { data: { authorities: { judgmentId: string }[] } })
      .data.authorities;
    assert.ok(authorities.some((x) => x.judgmentId === judgmentId));
  });

  it('re-adding the same judgment is idempotent, not an error', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId }),
    });
    assert.equal(res.status, 200, 'the second add is idempotent, not a fresh 201');

    const [count] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matter_authorities
      WHERE matter_id = ${matterId} AND judgment_id = ${judgmentId} AND removed_at IS NULL`;
    assert.equal(count?.n, 1, 'no duplicate row was created');
  });

  it('removes an authority, as a timestamp, never a delete', async () => {
    const list = await app.request(`/matters/${matterId}/authorities`, { headers: auth(owner.token) });
    const authorityId = (
      (await list.json()) as { data: { authorities: { authorityId: string; judgmentId: string }[] } }
    ).data.authorities.find((a) => a.judgmentId === judgmentId)!.authorityId;

    const res = await app.request(`/matters/${matterId}/authorities/${authorityId}`, {
      method: 'DELETE',
      headers: auth(owner.token),
    });
    assert.equal(res.status, 200);
    assert.ok(((await res.json()) as { data: { removedAt: string } }).data.removedAt);

    const [row] = await sql<{ removed_at: string | null }[]>`
      SELECT removed_at FROM matter_authorities WHERE id = ${authorityId}`;
    assert.ok(row?.removed_at, 'the row must still exist, only marked removed');
  });

  it('re-adding after removal is allowed — brought back onto the case', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId }),
    });
    assert.equal(res.status, 201, 'a fresh row, since the prior one is removed');
  });

  it('refuses to add a set-aside judgment, and NAMES what replaced it', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId: setAsideJudgmentId }),
    });
    assert.equal(res.status, 409, 'set_aside must refuse add-to-matter on the SERVER');
    const err = ((await res.json()) as { error: { code: string; message: string } }).error;
    assert.equal(err.code, 'AUTHORITY_SET_ASIDE');
    assert.match(err.message, /set aside/i);
    assert.match(err.message, /Replacement Fixture/, 'the response must name the replacement');

    const [count] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matter_authorities WHERE judgment_id = ${setAsideJudgmentId}`;
    assert.equal(count?.n, 0, 'nothing may have been written');
  });

  it("a stranger cannot add to another advocate's matter — not found, not forbidden", async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(stranger.token),
      body: JSON.stringify({ judgmentId }),
    });
    assert.equal(res.status, 404, "not-yours and does-not-exist must be indistinguishable");
  });

  it('a stranger cannot even list authorities on a matter with no share', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, { headers: auth(stranger.token) });
    assert.equal(res.status, 404);
  });

  /**
   * This asserted `404` until R17. The change is deliberate and is the contract:
   * a judgment id the ACTIVE corpus generation does not carry is
   * `409 CORPUS_TARGET_UNAVAILABLE`, never *"no judgment with that id"*.
   *
   * On one database the two readings look interchangeable — the id genuinely is
   * not there. Across the split they are different facts, and only one of them is
   * ours to assert: after a rollback the judgment exists and this release does not
   * carry it. `authorities-corpus-split.test.ts` proves it against two
   * generations; this asserts the single-database path answers identically, so
   * the shape does not depend on how the deployment is wired.
   */
  it('a judgment id this corpus release does not carry is 409, not 404', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId: crypto.randomUUID() }),
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'CORPUS_TARGET_UNAVAILABLE');
    assert.doesNotMatch(body.error.message, /does not exist|no judgment with that id/i);
  });

  it('rejects a malformed body through the shared validator', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId: 'not-a-uuid' }),
    });
    assert.equal(res.status, 400);
  });

  it('404s removing an authority that was never added', async () => {
    const res = await app.request(`/matters/${matterId}/authorities/${crypto.randomUUID()}`, {
      method: 'DELETE',
      headers: auth(owner.token),
    });
    assert.equal(res.status, 404);
  });

  /* ------------------------------------------ RCC bus 0048 — good-law status -- */

  type WireAuthority = {
    authorityId: string;
    judgmentId: string;
    neutralCitation: string | null;
    reporterCitations: string[];
    verificationState: string;
    verifiedBySource: string;
    overruledStatus: string;
    overruledByJudgmentId: string | null;
    overruledByTitle: string | null;
    overruledParas: number[] | null;
    overruledNote: string | null;
    /** R14 §A6 — optional on the wire, always served by this implementation. */
    precedentialEffect: string;
    canAddToMatter: boolean;
    citableForUntouchedPropositions: boolean;
  };

  const listAuthority = async (wantedJudgmentId: string) => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      headers: auth(owner.token),
    });
    assert.equal(res.status, 200);
    return ((await res.json()) as { data: { authorities: WireAuthority[] } }).data.authorities.find(
      (a) => a.judgmentId === wantedJudgmentId,
    );
  };

  it('the add response states good-law status on the way in', async () => {
    const res = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId: movesJudgmentId }),
    });
    assert.equal(res.status, 201);
    const a = ((await res.json()) as { data: { authority: WireAuthority } }).data.authority;
    // Tier 1 by construction: `judgment_id` is a FK into our own corpus.
    assert.equal(a.verificationState, 'verified');
    assert.equal(a.verifiedBySource, 'corpus');
    assert.equal(a.overruledStatus, 'none');
  });

  it('an authority saved as good law says LAW MOVED once the law moves', async () => {
    const saved = await listAuthority(movesJudgmentId);
    assert.equal(saved?.overruledStatus, 'none', 'good law at the moment it was saved');

    // The world changes underneath a citation that is already relied on. This is
    // the whole of `CITATION_HARNESS.md`'s stale-overruled rule, and the reason
    // the status may never be copied onto `matter_authorities` at save time.
    await sql`
      UPDATE judgments
         SET overruled_status = 'doubted',
             overruled_by_judgment_id = ${replacementJudgmentId},
             overruled_note = 'Doubted by a later coordinate bench.',
             overruled_status_changed_at = now()
       WHERE id = ${movesJudgmentId}`;

    const after = await listAuthority(movesJudgmentId);
    assert.ok(after, 'a moved authority is never silently dropped from the list');
    assert.equal(after.overruledStatus, 'doubted', 'read LIVE, not as stored at save time');
    assert.equal(after.overruledByJudgmentId, replacementJudgmentId);
    assert.equal(
      after.overruledByTitle,
      'SYNTHETIC — Replacement Fixture',
      'the advocate is told WHAT moved it, not merely that something did',
    );
    assert.equal(after.overruledNote, 'Doubted by a later coordinate bench.');
    // Verification and good-law status are independent questions: this row is
    // still in our corpus, so it is still `verified`, and also `doubted`.
    assert.equal(after.verificationState, 'verified');
  });

  it('carries the affected paragraphs so partly_set_aside renders as a half, not a headline', async () => {
    await sql`
      UPDATE judgments
         SET overruled_status = 'partly_set_aside', overruled_paras = '{14,15}',
             overruled_status_changed_at = now()
       WHERE id = ${movesJudgmentId}`;

    const a = await listAuthority(movesJudgmentId);
    assert.equal(a?.overruledStatus, 'partly_set_aside');
    assert.deepEqual(a?.overruledParas, [14, 15], 'without the paras there is no "what still stands"');
  });

  it('sends reporterCitations, so a pre-2013 authority is not called uncitable — RCC bus 0049', async () => {
    // Citability is `neutralCitation === null AND reporterCitations.length === 0`
    // — `docs/CITATION_HARNESS.md`'s rule, computed client-side. This route sent
    // the first half and never the second, so a saved authority whose only
    // citation is a reporter citation read as "No citation on file — cannot be
    // referenced in a filing". It has one; we withheld it.
    const added = await app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId: reporterOnlyJudgmentId }),
    });
    assert.equal(added.status, 201);
    const fromAdd = ((await added.json()) as { data: { authority: WireAuthority } }).data.authority;
    assert.deepEqual(fromAdd.reporterCitations, ['(2001) 3 SCC 111'], 'on the way in');

    const fromList = await listAuthority(reporterOnlyJudgmentId);
    assert.equal(fromList?.neutralCitation, null, 'the fixture has none, by design');
    assert.deepEqual(fromList?.reporterCitations, ['(2001) 3 SCC 111'], 'and on the way back out');
  });

  /* ------------------------------------- R14 §A6 — precedential policy fields -- */

  /**
   * `precedentialEffect`, `canAddToMatter` and `citableForUntouchedPropositions`
   * on the saved-authority shape. RCC filed CCR-RCC-S2-02 because the coarse
   * four-value banner cannot say WHICH act happened, and rendering a specific
   * relationship verb from it would state something legally different from the
   * truth — proposition-level overruling shown as *"Set aside in"*.
   *
   * The whole contract is in one word: **live**. Semantics are identical to the
   * same fields on `GET /judgments/:id`, read on THIS request, never a value
   * captured when the authority was saved — the rule `overruledStatus` has
   * followed on this route since RCC bus 0048.
   */
  const addAuthorityFor = async (id: string) =>
    app.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId: id }),
    });

  it('a current authority says it is usable, on both the write and the read path', async () => {
    const saved = await listAuthority(judgmentId);
    assert.equal(saved?.precedentialEffect, 'none', 'no adverse treatment recorded');
    assert.equal(saved?.canAddToMatter, true);
    assert.equal(saved?.citableForUntouchedPropositions, true);

    const res = await addAuthorityFor(policyJudgmentId);
    assert.equal(res.status, 201);
    const a = ((await res.json()) as { data: { authority: WireAuthority } }).data.authority;
    // The POST response and the next GET must not disagree — an authority that
    // arrives unmarked and grows a mark on refresh reads as a bug, not a warning.
    assert.equal(a.precedentialEffect, 'none');
    assert.equal(a.canAddToMatter, true);
    assert.equal(a.citableForUntouchedPropositions, true);
    assert.equal((await listAuthority(policyJudgmentId))?.precedentialEffect, 'none');
  });

  it('an authority set aside AFTER it was saved reports canAddToMatter false', async () => {
    // Nothing on `matter_authorities` moves here. Only the judgment does.
    await sql`
      UPDATE judgments
         SET overruled_status = 'set_aside',
             overruled_by_judgment_id = ${replacementJudgmentId},
             overruled_status_changed_at = now()
       WHERE id = ${policyJudgmentId}`;

    const a = await listAuthority(policyJudgmentId);
    assert.ok(a, 'a set-aside authority is never silently dropped from the list');
    assert.equal(a.precedentialEffect, 'set_aside');
    assert.equal(a.canAddToMatter, false, 'the one refusal in the product, on the READ path');
    assert.equal(
      a.citableForUntouchedPropositions,
      false,
      'the decision between the parties is gone — there is nothing left to cite',
    );
    assert.equal(a.overruledStatus, 'set_aside', 'the banner is unchanged by any of this');

    // Read and write agree: the same policy that reports `false` here is the
    // one that returns 409 on the way in.
    assert.equal((await addAuthorityFor(policyJudgmentId)).status, 409);
  });

  it('a RELATIONSHIP recorded later changes the fields on the next GET, with no resave', async () => {
    const before = await listAuthority(policyJudgmentId);
    assert.equal(before?.canAddToMatter, false, 'refused a moment ago, on the stored status alone');

    /**
     * THE PROOF THAT THE FIELDS ARE DERIVED AND NOT STORED.
     *
     * One row in `judgment_citations`, and nothing else in the system changes:
     * the advocate does not resave, `matter_authorities` is not written, and the
     * judgment's own `overruled_status` still says `set_aside`. If any part of
     * the policy had been captured at save time, this GET would still refuse.
     *
     * The direction is OD-14's: an overruling leaves the decision between the
     * original parties standing, so it ALLOWS while keeping the strongest
     * banner. That is the case the coarse four-value status cannot express, and
     * the reason CCR-RCC-S2-02 was filed.
     */
    await sql`
      INSERT INTO judgment_citations
        (citing_judgment_id, cited_judgment_id, citation_text, normalised_citation,
         relationship, evidence, char_offset, treatment_provenance)
      VALUES (${replacementJudgmentId}, ${policyJudgmentId}, 'SYNTHETIC — Policy Fields Fixture',
              ${`test-norm-${crypto.randomUUID()}`}, 'overruled',
              'we hold that the proposition is no longer good law', 0,
              'COURT_REASONING_EXPLICIT')`;

    const after = await listAuthority(policyJudgmentId);
    assert.equal(after?.authorityId, before?.authorityId, 'the SAME saved row, never resaved');
    assert.equal(after?.precedentialEffect, 'overruled', 'read live from the edge, this request');
    assert.equal(after?.canAddToMatter, true, 'an overruled decision is still a decision');
    assert.equal(after?.citableForUntouchedPropositions, true);
    assert.equal(
      after?.overruledStatus,
      'set_aside',
      'NOTHING here weakens a warning — the banner is untouched by the finer fact',
    );

    // And the write path now agrees with the read path in the other direction.
    assert.equal((await addAuthorityFor(policyJudgmentId)).status, 200, 'already live, idempotent');
  });

  it('a partly-overruled authority is neither a set-aside nor a clean one', async () => {
    await sql`
      INSERT INTO judgment_citations
        (citing_judgment_id, cited_judgment_id, citation_text, normalised_citation,
         relationship, evidence, char_offset, treatment_provenance)
      VALUES (${replacementJudgmentId}, ${partJudgmentId}, 'SYNTHETIC — Partly Overruled Fixture',
              ${`test-norm-${crypto.randomUUID()}`}, 'overruled_in_part',
              'to that extent the earlier view is no longer good law', 0,
              'COURT_REASONING_EXPLICIT')`;

    const res = await addAuthorityFor(partJudgmentId);
    assert.equal(res.status, 201, 'part of a proposition overruled leaves the rest usable');
    const a = ((await res.json()) as { data: { authority: WireAuthority } }).data.authority;
    assert.equal(a.precedentialEffect, 'overruled_in_part');
    assert.equal(a.canAddToMatter, true);
    assert.equal(a.citableForUntouchedPropositions, true);
    assert.equal(a.overruledStatus, 'partly_set_aside', 'the banner still says the law moved');

    assert.equal((await listAuthority(partJudgmentId))?.precedentialEffect, 'overruled_in_part');
  });

  it('evidence_defect subtracts a warning and never adds a prohibition', async () => {
    /**
     * The stored `doubted` exists only because our own parser read a
     * subjunctive as a holding — *"is sought to be overruled"*. A defect in our
     * reading is a fact about US, not about the law, so it must not select a
     * relationship verb and must not refuse an advocate good law.
     */
    await sql`
      INSERT INTO judgment_citations
        (citing_judgment_id, cited_judgment_id, citation_text, normalised_citation,
         relationship, evidence, char_offset, treatment_provenance)
      VALUES (${replacementJudgmentId}, ${defectJudgmentId}, 'SYNTHETIC — Evidence Defect Fixture',
              ${`test-norm-${crypto.randomUUID()}`}, 'doubted',
              'is sought to be overruled by the judgment proposed to be delivered', 0,
              'MODALITY_DEFECT')`;

    const res = await addAuthorityFor(defectJudgmentId);
    assert.equal(res.status, 201, 'a grammatical mood is not grounds to refuse an authority');
    const a = ((await res.json()) as { data: { authority: WireAuthority } }).data.authority;
    assert.equal(a.precedentialEffect, 'evidence_defect');
    assert.equal(a.canAddToMatter, true);
    assert.equal(a.citableForUntouchedPropositions, true);

    const listed = await listAuthority(defectJudgmentId);
    assert.equal(listed?.precedentialEffect, 'evidence_defect', 'and on the read path too');
    assert.notEqual(
      listed?.precedentialEffect,
      'doubted',
      'the eighth value must never collapse into a verb about what a court did',
    );
  });

  it('none of it is persisted — `matter_authorities` has no policy column', async () => {
    // The contract says these fields are read live and never copied onto the
    // saved row. That is a claim about the SCHEMA, so it is asserted against the
    // schema rather than against a comment.
    const columns = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'matter_authorities'`;
    const names = columns.map((c) => c.column_name);
    for (const forbidden of [
      'precedential_effect',
      'can_add_to_matter',
      'citable_for_untouched_propositions',
      'overruled_status',
    ]) {
      assert.equal(
        names.includes(forbidden),
        false,
        `${forbidden} on matter_authorities would be the cached legal state the harness forbids`,
      );
    }
  });
});
