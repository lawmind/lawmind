-- Expo push tokens.
--
-- PD-6: alerts are BATCHED into the evening briefing. Two standing exceptions
-- push immediately — `set_aside` on a citation in an exported draft, and a newly
-- discovered listing for tomorrow. A wrong cadence trains advocates to disable
-- notifications permanently, and they do not come back.
--
-- Nullable, and null means NO DEVICE HAS REGISTERED — an absence, never a
-- failure and never a refusal. An advocate who has not opened the app on a phone
-- yet, or who declined the OS prompt, is a normal state; the sweep records the
-- briefing as generated and simply undelivered.
ALTER TABLE users ADD COLUMN expo_push_token text;

-- The sweep looks up tokens for the advocates it just generated briefings for.
CREATE INDEX users_expo_push_token_idx ON users (expo_push_token)
  WHERE expo_push_token IS NOT NULL;

-- `briefings.delivered_at` already exists and has never been written. It is what
-- separates "we generated a briefing" from "it reached the advocate's phone" —
-- two different facts, and the activation metric depends on telling them apart.
-- Nothing else changes here; the sweep now sets it.
