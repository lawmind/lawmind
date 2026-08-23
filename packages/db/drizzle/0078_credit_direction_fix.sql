-- ───────────────────────────────────────────────────────────────────────────
-- A CHECK CONSTRAINT THAT ALLOWED A REFUND TO ADD CREDIT
-- ───────────────────────────────────────────────────────────────────────────
--
-- `0077` wrote `credit_ledger_direction_ck` as an OR of three branches, and
-- `refund_reversal` appears in TWO of them:
--
--   (reason IN (..., 'refund_reversal', ...) AND delta > 0)
--   OR (reason IN ('redemption', 'expiry', 'refund_reversal') AND delta < 0)
--
-- So the one reason whose direction matters most was the one reason with no
-- direction at all. The constraint exists to stop a sign error handing out free
-- product, and for `refund_reversal` it stopped nothing: a clawback written as
-- `+1` passes.
--
-- **A refund means the customer got their money back, so the credit comes OUT.**
-- Recording it as `+1` gives a refunded customer a free hearing pack and makes
-- the ledger disagree with the payment provider — a reconciliation that fails
-- quietly and is found by an accountant, months later.
--
-- Forward-only, per DEPLOYMENT.md: `0077` is not edited. The old constraint is
-- dropped and replaced, which is safe because no row has been written yet
-- (`credit_ledger` is empty; the model is designed and NOT activated).
--
-- The third branch — a bare `reason = 'test'` that matched any direction — goes
-- too. It made every other branch decorative for the one reason a test uses, and
-- a test that can write an impossible row is a test that proves nothing about
-- the real one.

SET LOCAL lock_timeout = '3s';

ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_direction_ck;

ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_direction_ck CHECK (
  -- Credit IN: a purchase, a founder grant, or giving back a redemption whose
  -- work failed. `test` is here so a fixture takes the same path as a purchase.
  (reason IN ('purchase', 'founder_grant', 'redemption_reversal', 'test') AND delta > 0)
  -- Credit OUT: spent on a job, expired, or clawed back because the customer
  -- was refunded.
  OR (reason IN ('redemption', 'expiry', 'refund_reversal') AND delta < 0)
);

COMMENT ON CONSTRAINT credit_ledger_direction_ck ON credit_ledger IS
  'LCC, 23 Aug 2026. Each reason has exactly ONE legal direction. 0077 let '
  'refund_reversal go either way, which is the sign error the constraint existed '
  'to prevent. A refund removes credit; redemption_reversal is the one that adds it.';
