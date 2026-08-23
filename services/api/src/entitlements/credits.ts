/**
 * One-off credits — designed now, activated only if Product approves the model.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INVARIANT, AND WHERE IT IS ENFORCED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   PURCHASE -> CREDIT ISSUED ONCE -> REDEMPTION ATOMIC -> JOB CREATED ONCE
 *
 * Every arrow is a unique index in `0077`, not a comment and not care:
 *
 *   issued once     `credit_ledger_issue_uq (provider, provider_ref)`
 *   redeemed once   `credit_ledger_redeem_uq (premium_job_id)`
 *   job once        `premium_jobs_idempotency_uq (user_id, idempotency_key)`
 *
 * The reason it is indexes rather than checks is concurrency. Two taps on a
 * phone with bad signal are two requests in flight at the same moment, and any
 * check-then-write between them loses. A unique index does not lose: the second
 * write fails, and the handler returns the FIRST result, which is what the user
 * wanted anyway.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO BALANCE COLUMN, EVER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The balance is `SUM(delta)` over an append-only ledger. A balance column plus
 * a concurrent redemption is a lost update, and a lost update in a credit system
 * is either free product or a customer charged for nothing. An append-only
 * ledger also answers "why does this user have two credits" without an audit
 * table, because the reasons ARE the rows.
 */
import type { Sql } from 'postgres';

import type { Capability } from './capabilities.ts';

export type CreditBalance = { readonly capability: string; readonly balance: number };

/** Every non-zero balance this user holds. An absent capability is zero, not null. */
export async function creditBalance(sql: Sql, userId: string): Promise<CreditBalance[]> {
  const rows = await sql<{ capability: string; balance: string }[]>`
    SELECT capability, COALESCE(SUM(delta), 0)::text AS balance
      FROM credit_ledger WHERE user_id = ${userId}
     GROUP BY capability HAVING COALESCE(SUM(delta), 0) <> 0`;
  return rows.map((r) => ({ capability: r.capability, balance: Number(r.balance) }));
}

export type IssueInput = {
  readonly userId: string;
  readonly capability: Capability;
  readonly quantity: number;
  /**
   * `refund_reversal` is deliberately NOT here. A refund takes credit OUT — the
   * customer has their money back — so it is a clawback, not an issue, and
   * `0078` makes the database refuse it in this direction. Putting it in this
   * union would let a caller write the sign error the constraint exists to stop.
   */
  readonly reason: 'purchase' | 'founder_grant' | 'test';
  readonly provider?: string | null;
  /** The purchase's own id. Without it a redelivered webhook issues twice. */
  readonly providerRef?: string | null;
};

export type IssueResult = {
  readonly id: string;
  readonly created: boolean;
  readonly balance: number;
};

/**
 * Issue credit for a purchase, idempotently.
 *
 * A duplicate webhook produces `created: false` and the same balance. It is NOT
 * an error: the provider did the right thing by redelivering, and answering with
 * the existing state is what stops it redelivering forever.
 */
export async function issueCredit(sql: Sql, input: IssueInput): Promise<IssueResult> {
  if (input.quantity <= 0) throw new Error('issueCredit takes a positive quantity');
  if (input.reason === 'purchase' && !input.providerRef) {
    throw new Error(
      'a purchase must carry a providerRef — it is the only thing that makes a ' +
        'redelivered webhook a no-op rather than free credit',
    );
  }

  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      INSERT INTO credit_ledger (user_id, capability, delta, reason, provider, provider_ref)
      VALUES (${input.userId}, ${input.capability}, ${input.quantity}, ${input.reason},
              ${input.provider ?? null}, ${input.providerRef ?? null})
      ON CONFLICT (provider, provider_ref) WHERE provider_ref IS NOT NULL AND delta > 0
      DO NOTHING
      RETURNING id`;

    const [balance] = await tx<{ n: string }[]>`
      SELECT COALESCE(SUM(delta), 0)::text AS n FROM credit_ledger
       WHERE user_id = ${input.userId} AND capability = ${input.capability}`;

    if (rows.length === 0) {
      const [existing] = await tx<{ id: string }[]>`
        SELECT id FROM credit_ledger
         WHERE provider IS NOT DISTINCT FROM ${input.provider ?? null}
           AND provider_ref = ${input.providerRef ?? null} AND delta > 0`;
      return { id: existing?.id ?? '', created: false, balance: Number(balance!.n) };
    }
    return { id: rows[0]!.id, created: true, balance: Number(balance!.n) };
  });
}

export type RedeemResult =
  | {
      readonly ok: true;
      readonly ledgerId: string;
      readonly balanceAfter: number;
      readonly alreadyRedeemed: boolean;
    }
  | { readonly ok: false; readonly reason: string; readonly balance: number };

/**
 * Spend one credit FOR A SPECIFIC JOB, atomically.
 *
 * The job id is required, and it is the whole safety mechanism. A redemption not
 * tied to the work it paid for cannot be made idempotent: a retry looks identical
 * to a second purchase-worth of work. Tied to a job, the retry hits
 * `credit_ledger_redeem_uq` and returns the ORIGINAL redemption.
 *
 * The balance read and the write are in ONE transaction behind an advisory lock.
 * Without it, two concurrent redemptions both read a balance of 1 and both write
 * -1: one purchase, two packs. On a phone with bad signal that is not a rare
 * race, it is the normal case. An advisory lock rather than `SELECT ... FOR
 * UPDATE` because the rows a new balance depends on do not exist yet and
 * therefore cannot be locked.
 */
export async function redeemCredit(
  sql: Sql,
  input: { userId: string; capability: Capability; premiumJobId: string },
): Promise<RedeemResult> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${input.userId + ':' + input.capability}))`;

    const [already] = await tx<{ id: string }[]>`
      SELECT id FROM credit_ledger WHERE premium_job_id = ${input.premiumJobId} AND delta < 0`;
    if (already) {
      const [b] = await tx<{ n: string }[]>`
        SELECT COALESCE(SUM(delta), 0)::text AS n FROM credit_ledger
         WHERE user_id = ${input.userId} AND capability = ${input.capability}`;
      // A retry, not a second spend. The caller gets the original and carries on.
      return {
        ok: true as const,
        ledgerId: already.id,
        balanceAfter: Number(b!.n),
        alreadyRedeemed: true,
      };
    }

    const [b] = await tx<{ n: string }[]>`
      SELECT COALESCE(SUM(delta), 0)::text AS n FROM credit_ledger
       WHERE user_id = ${input.userId} AND capability = ${input.capability}`;
    const balance = Number(b!.n);
    if (balance < 1) {
      return { ok: false as const, reason: `no ${input.capability} credit to redeem`, balance };
    }

    const [row] = await tx<{ id: string }[]>`
      INSERT INTO credit_ledger (user_id, capability, delta, reason, premium_job_id)
      VALUES (${input.userId}, ${input.capability}, -1, 'redemption', ${input.premiumJobId})
      RETURNING id`;
    return {
      ok: true as const,
      ledgerId: row!.id,
      balanceAfter: balance - 1,
      alreadyRedeemed: false,
    };
  });
}

/**
 * Give a credit back when the work it paid for failed.
 *
 * **The direction of the error matters and this is the safe one.** If generation
 * fails after a credit is reserved, the advocate has paid and received nothing;
 * reversing costs us model time already spent. Not reversing costs a refund
 * request, a support conversation, and a customer who does not come back. The
 * reversal is tied to the same job id, so it happens at most once.
 */
export async function reverseRedemption(
  sql: Sql,
  premiumJobId: string,
): Promise<{ reversed: boolean }> {
  return sql.begin(async (tx) => {
    const [spend] = await tx<{ id: string; user_id: string; capability: string }[]>`
      SELECT id, user_id, capability FROM credit_ledger
       WHERE premium_job_id = ${premiumJobId} AND delta < 0`;
    if (!spend) return { reversed: false };

    const [already] = await tx<{ id: string }[]>`
      SELECT id FROM credit_ledger
       WHERE premium_job_id = ${premiumJobId} AND delta > 0 AND reason = 'redemption_reversal'`;
    if (already) return { reversed: false };

    await tx`
      INSERT INTO credit_ledger (user_id, capability, delta, reason, premium_job_id, provider_ref)
      VALUES (${spend.user_id}, ${spend.capability}, 1, 'redemption_reversal',
              ${premiumJobId}, ${'reversal:' + premiumJobId})`;
    return { reversed: true };
  });
}
