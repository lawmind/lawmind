/**
 * ─────────────────────────────────────────────────────────────────────────────
 * R17 §1 WRITE PATH, AGAINST TWO PHYSICALLY SEPARATE CORPUS GENERATIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `authorities.test.ts` drives one database wearing both roles, so the condition
 * this file is about — a saved judgment id the ACTIVE corpus generation does not
 * carry — cannot occur there at all: the same connection that inserted the
 * fixture answers the lookup. Two schemas in one database would not help either,
 * for `db-split-physical.test.ts`'s reason: the property is about DATABASES.
 *
 * So this suite builds two disposable corpus generations on the same server —
 * A contains the judgment, B does not — points the app's CORPUS role at one or
 * the other, and leaves the USER role on the real development database where
 * `users`, `matters` and `matter_authorities` already live.
 *
 * ── WHAT IT PROVES ──────────────────────────────────────────────────────────
 *
 *   1. The defect NEW3 R21 §3a recorded: an absent target answered `404
 *      NOT_FOUND` *"no judgment with that id"*. Under the split that sentence is
 *      not merely forbidden by R17, it is FALSE — after a rollback the judgment
 *      exists and this release does not carry it.
 *   2. `409 CORPUS_TARGET_UNAVAILABLE` with no `matter_authorities` row written.
 *   3. The already-satisfied save: same live row, absent target -> `200
 *      { unavailableAuthority }` and no mutation.
 *   4. A -> B -> A. Saved under A, shell under B, hydrated again under A, with
 *      the SAME `authorityId` and `addedAt` throughout and no duplicate row.
 *   5. Tenant isolation is unchanged on the new branch: a stranger still gets
 *      `404` on the matter, never the corpus verdict.
 *
 * Skipped without `DATABASE_URL`, and no assertion passes vacuously — each is
 * preceded by one proving the fixture is in the state under test.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import postgres, { type Sql } from 'postgres';

import { createApp } from '../app.ts';

const base = process.env['DATABASE_URL'];
const CORPUS_A = 'lawmind_corpus_gen_a_r17';
const CORPUS_B = 'lawmind_corpus_gen_b_r17';
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * The corpus tables this endpoint reads, and only those.
 *
 * `judgments` for the target and its replacement join, `judgment_citations` for
 * the adverse-edge read that decides the one refusal. A fuller schema would test
 * `pg_restore`, which `lcc-corpus-bluegreen-proof.mjs` already proves separately,
 * and would hide which columns this route actually depends on.
 */
async function buildGeneration(sql: Sql): Promise<void> {
  await sql`CREATE TABLE judgments (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              case_title text NOT NULL,
              neutral_citation text,
              reporter_citations text[] NOT NULL DEFAULT '{}',
              court text NOT NULL,
              judgment_date date NOT NULL,
              overruled_status text NOT NULL DEFAULT 'none',
              overruled_by_judgment_id uuid,
              overruled_paras int[],
              overruled_note text,
              script_quality text,
              script_quality_method text)`;
  await sql`CREATE TABLE judgment_citations (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              cited_judgment_id uuid,
              relationship text,
              treatment_provenance text)`;
}

const matterBody = {
  caseTitle: 'State v. Corpus Split Fixture',
  court: 'Delhi High Court',
  caseType: 'criminal' as const,
  parties: { petitioner: 'State', respondent: 'Fixture' },
  clientName: 'Fixture',
  ourSide: 'accused' as const,
};

const auth = (t: string) => ({ authorization: `Bearer ${t}`, 'content-type': 'application/json' });

type Envelope = {
  ok: boolean;
  data?: {
    authority?: { authorityId: string; addedAt: string };
    unavailableAuthority?: {
      authorityId: string;
      judgmentId: string;
      addedBy: string;
      addedAt: string;
      removedAt: string | null;
      availability: string;
      caseTitle?: unknown;
      neutralCitation?: unknown;
      verificationState?: unknown;
    };
    authorities?: { authorityId: string; addedAt: string; caseTitle: string }[];
    unavailableAuthorities?: { authorityId: string; judgmentId: string }[];
  };
  error?: { code: string; message: string };
};

describe('R17 write path across corpus generations', { skip: !base }, () => {
  let admin: Sql;
  let user: Sql;
  let genA: Sql;
  let genB: Sql;
  /** The app with generation A active, and the same app with B active. */
  let onA: ReturnType<typeof createApp>;
  let onB: ReturnType<typeof createApp>;

  let owner: { authId: string; token: string };
  let stranger: { authId: string; token: string };
  let matterId: string;
  /** Present in A, absent from B. The whole experiment. */
  let judgmentId: string;

  async function seedAdvocate(tag: string) {
    const authId = `test-auth-${tag}-${crypto.randomUUID()}`;
    const email = `${authId}@example.test`;
    await user`INSERT INTO auth_user (id, name, email, email_verified)
               VALUES (${authId}, 'Adv', ${email}, true)`;
    await user`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
               VALUES (${authId}, 'Adv', ${`+9199${Math.floor(Math.random() * 100000000)}`},
                       ${email}, 'unverified')`;
    return { authId, token: await signAccessToken({ sub: authId, email }, SECRET) };
  }

  before(async () => {
    admin = postgres(withDatabase(base!, 'postgres'), { max: 1, onnotice: () => {} });
    for (const name of [CORPUS_A, CORPUS_B]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
    }
    genA = postgres(withDatabase(base!, CORPUS_A), { max: 2, onnotice: () => {} });
    genB = postgres(withDatabase(base!, CORPUS_B), { max: 2, onnotice: () => {} });
    await buildGeneration(genA);
    await buildGeneration(genB);

    /* The id is chosen here rather than by the database, so that "A has it and B
     * does not" is a fact about the two generations and not about two inserts. */
    judgmentId = crypto.randomUUID();
    await genA`INSERT INTO judgments (id, case_title, neutral_citation, court, judgment_date)
               VALUES (${judgmentId}, 'SYNTHETIC — Generation A Only', 'FIX 2026 INSC 17',
                       'Test Court', '2026-01-01')`;

    user = postgres(base!, { max: 4, onnotice: () => {} });
    owner = await seedAdvocate('r17own');
    stranger = await seedAdvocate('r17str');

    const build = (corpus: Sql) =>
      createApp({
        ping: async () => {},
        search: { sql: corpus, userSql: user, embedQuery: async () => null },
        auth: { auth: null as never, sql: user, secret: SECRET },
      });
    onA = build(genA);
    onB = build(genB);

    /**
     * The matter is seeded with SQL rather than through `POST /matters`.
     *
     * That route is not yet split-wired — `createMatter` still receives the
     * CORPUS handle — and this suite is about the AUTHORITIES endpoints, which
     * are. Driving the un-wired route here would fail for a reason that has
     * nothing to do with R17 and would hide the reason that does.
     * `matters_default_workspace` fills `workspace_id`.
     */
    const [profile] = await user<{ id: string }[]>`
      SELECT id FROM users WHERE auth_id = ${owner.authId}`;
    const [m] = await user<{ id: string }[]>`
      INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                           our_side, status, source)
      VALUES (${profile!.id}, ${matterBody.caseTitle}, ${matterBody.court},
              ${matterBody.caseType}, ${JSON.stringify(matterBody.parties)}::jsonb,
              ${matterBody.clientName}, ${matterBody.ourSide}, 'active', 'manual')
      RETURNING id`;
    matterId = m!.id;
  });

  after(async () => {
    await user
      ?.unsafe(`DELETE FROM matter_authorities WHERE matter_id = $1`, [matterId])
      .catch(() => {});
    await user?.unsafe(`DELETE FROM matters WHERE id = $1`, [matterId]).catch(() => {});
    for (const a of [owner, stranger]) {
      if (!a) continue;
      await user?.unsafe(`DELETE FROM users WHERE auth_id = $1`, [a.authId]).catch(() => {});
      await user?.unsafe(`DELETE FROM auth_user WHERE id = $1`, [a.authId]).catch(() => {});
    }
    await user?.end();
    await genA?.end();
    await genB?.end();
    for (const name of [CORPUS_A, CORPUS_B]) {
      await admin?.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
    }
    await admin?.end();
  });

  /* ── the fixture really is in the state under test ─────────────────────── */

  it('generation A carries the judgment and generation B does not', async () => {
    const inA = await genA`SELECT id FROM judgments WHERE id = ${judgmentId}`;
    const inB = await genB`SELECT id FROM judgments WHERE id = ${judgmentId}`;
    assert.equal(inA.length, 1, 'A must carry the target');
    assert.equal(inB.length, 0, 'B must not — that is the condition under test');
  });

  /* ── 1. the R16 behaviour that must not regress ────────────────────────── */

  it('saves normally while generation A is active', async () => {
    const res = await onA.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId }),
    });
    const body = (await res.json()) as Envelope;
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.ok(body.data?.authority?.authorityId);
  });

  /* ── 2. the read path under B — already correct, asserted so the write
   *      change below cannot be credited with it ─────────────────────────── */

  it('under generation B the saved row reads back as an unavailable shell', async () => {
    const res = await onB.request(`/matters/${matterId}/authorities`, {
      headers: auth(owner.token),
    });
    const body = (await res.json()) as Envelope;
    assert.equal(res.status, 200);
    assert.equal(body.data?.authorities?.length, 0);
    assert.equal(body.data?.unavailableAuthorities?.length, 1);
    assert.equal(body.data?.unavailableAuthorities?.[0]?.judgmentId, judgmentId);
  });

  /* ── 3. the defect, and the contract that replaces it ──────────────────── */

  it('re-saving the SAME live row under B is the already-satisfied case, not a refusal', async () => {
    const before = await user<{ n: string }[]>`
      SELECT count(*)::text AS n FROM matter_authorities
       WHERE matter_id = ${matterId} AND judgment_id = ${judgmentId}`;

    const res = await onB.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId }),
    });
    const body = (await res.json()) as Envelope;

    assert.equal(res.status, 200, JSON.stringify(body));
    const shell = body.data?.unavailableAuthority;
    assert.ok(shell, 'the already-satisfied save returns the shell');
    assert.equal(shell.judgmentId, judgmentId);
    assert.equal(shell.availability, 'corpus_unavailable');
    assert.equal(shell.removedAt, null);
    /* No fabricated corpus metadata — the shell's field list is exhaustive by
     * design and there is no honest value for any of these. */
    assert.equal(shell.caseTitle, undefined);
    assert.equal(shell.neutralCitation, undefined);
    assert.equal(shell.verificationState, undefined);

    const after = await user<{ n: string }[]>`
      SELECT count(*)::text AS n FROM matter_authorities
       WHERE matter_id = ${matterId} AND judgment_id = ${judgmentId}`;
    assert.equal(after[0]!.n, before[0]!.n, 'no mutation on the already-satisfied path');
  });

  it('saving a target absent from the active generation is 409, not 404, and writes nothing', async () => {
    const absent = crypto.randomUUID();
    const before = await user<{ n: string }[]>`
      SELECT count(*)::text AS n FROM matter_authorities WHERE matter_id = ${matterId}`;

    const res = await onB.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(owner.token),
      body: JSON.stringify({ judgmentId: absent }),
    });
    const body = (await res.json()) as Envelope;

    assert.equal(res.status, 409, JSON.stringify(body));
    assert.equal(body.error?.code, 'CORPUS_TARGET_UNAVAILABLE');
    /* The sentence R17 forbids, and that the split makes false. */
    assert.doesNotMatch(body.error!.message, /does not exist|no judgment with that id/i);
    assert.match(body.error!.message, /corpus release/i);

    const after = await user<{ n: string }[]>`
      SELECT count(*)::text AS n FROM matter_authorities WHERE matter_id = ${matterId}`;
    assert.equal(after[0]!.n, before[0]!.n, 'MISSING_CORPUS_AUTHORITY_ROW_WRITTEN must be NO');
    const row = await user<{ id: string }[]>`
      SELECT id FROM matter_authorities WHERE judgment_id = ${absent}`;
    assert.equal(row.length, 0);
  });

  /* ── 4. A -> B -> A, one row throughout ────────────────────────────────── */

  it('A -> B -> A hydrates the same row, with no duplicate and no rewrite', async () => {
    const listA = (await (
      await onA.request(`/matters/${matterId}/authorities`, { headers: auth(owner.token) })
    ).json()) as Envelope;
    assert.equal(listA.data?.authorities?.length, 1);
    const first = listA.data!.authorities![0]!;
    assert.equal(first.caseTitle, 'SYNTHETIC — Generation A Only');

    const listB = (await (
      await onB.request(`/matters/${matterId}/authorities`, { headers: auth(owner.token) })
    ).json()) as Envelope;
    assert.equal(listB.data?.unavailableAuthorities?.[0]?.authorityId, first.authorityId);

    const back = (await (
      await onA.request(`/matters/${matterId}/authorities`, { headers: auth(owner.token) })
    ).json()) as Envelope;
    assert.equal(back.data?.authorities?.length, 1);
    assert.equal(back.data!.authorities![0]!.authorityId, first.authorityId);
    assert.equal(back.data!.authorities![0]!.addedAt, first.addedAt, 'addedAt must not move');

    const rows = await user<{ n: string }[]>`
      SELECT count(*)::text AS n FROM matter_authorities
       WHERE matter_id = ${matterId} AND judgment_id = ${judgmentId}`;
    assert.equal(rows[0]!.n, '1', 'the round trip must not duplicate the authority');
  });

  /* ── 5. tenant isolation is unchanged on the new branch ────────────────── */

  it("a stranger gets the matter's 404, never the corpus verdict", async () => {
    const res = await onB.request(`/matters/${matterId}/authorities`, {
      method: 'POST',
      headers: auth(stranger.token),
      body: JSON.stringify({ judgmentId }),
    });
    const body = (await res.json()) as Envelope;
    assert.equal(res.status, 404);
    assert.equal(body.error?.code, 'NOT_FOUND');
    assert.match(body.error!.message, /matter/i);
  });
});
