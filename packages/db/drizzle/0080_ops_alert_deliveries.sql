-- OPERATIONAL ALERT DELIVERY — the cooldown ledger.
--
-- `GET /admin/metrics` has evaluated alert conditions since it was written, and
-- nothing has ever delivered one. Metrics without notification are not incident
-- response: a page that nobody is looking at is a log line.
--
-- This table exists for ONE reason — so an alert is not sent every time the
-- poller runs. A disk filling up breaches its threshold on every tick for hours,
-- and an alerting system that emails every tick is an alerting system whose
-- emails get filtered. The cooldown is keyed on the RULE, not on the message, so
-- a detail line that changes slightly (`p95 18.1s` -> `p95 18.4s`) does not
-- defeat it.
--
-- Delivery is recorded even when it FAILED, with the error. "Did anyone get
-- told" has to be answerable by query; an alert whose delivery silently failed
-- is worse than no alert, because the absence reads as "nothing was wrong".
CREATE TABLE IF NOT EXISTS ops_alert_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The `ALERT_RULES` key. Not free text: the cooldown lookup depends on it.
  rule          text        NOT NULL,
  severity      text        NOT NULL,
  detail        text        NOT NULL,
  -- The transport that accepted it, or the one that refused. `console` here is
  -- a transport that SENT NOTHING and says so, same rule as the mailer.
  channel       text        NOT NULL,
  delivered_at  timestamptz NOT NULL DEFAULT now(),
  -- Null on success. Set, with the provider's own words, on failure.
  failure       text,
  -- True for a deliberately injected test condition, so a drill can be told
  -- apart from an incident when someone reads this table six months later.
  injected      boolean     NOT NULL DEFAULT false
);

-- The cooldown query: latest successful delivery per rule.
CREATE INDEX IF NOT EXISTS ops_alert_deliveries_rule_idx
  ON ops_alert_deliveries (rule, delivered_at DESC);
