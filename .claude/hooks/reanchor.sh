#!/usr/bin/env bash
# UserPromptSubmit hook — re-injects the non-negotiable core on EVERY turn.
# The only mechanism that survives context compaction. Keep it SHORT.
#
# Emits `additionalContext`, which lands as a system reminder rather than a
# visible transcript entry — the core arrives without adding noise to every turn.
#
# ALWAYS EXITS 0. On UserPromptSubmit, exit 2 BLOCKS THE PROMPT AND ERASES IT,
# so a bug here would be far worse than a missing re-anchor. Every failure path
# below degrades to "emit something, exit clean".
#
# The text is factual statements about this project, not imperative system
# commands. Out-of-band instruction framing is what prompt-injection defences are
# built to catch, and the core reads as facts either way. Keep it that way.
#
# Output is capped at 10,000 characters by Claude Code. `make check` in this
# directory is the length guard.

set -uo pipefail

IFS='' read -r -d '' CORE <<'CORE_TEXT'
<lawmind-core>
PRIME (global CLAUDE.md): DONE/VERIFY before work · INTENT before any behavior
change · KNOW/INFER/GUESS, never silent guessing · 3 failed cycles = STOP ·
done = OBSERVED not inferred.

LAWMIND NON-NEGOTIABLE:
- Citations: THREE fields, not one enum. verification_state (verified|unverified|
  failed) · verified_by_source (corpus|public_x2|ecourts|none) · overruled_status
  (none|set_aside|partly_set_aside|doubted, on judgments). A judgment can be
  verified AND overruled. What renders is DERIVED at render time, never stored.
  Render FROM THE DB ROW. Never show unverified as confirmed. NEVER silently
  drop one. set_aside disables add-to-matter. docs/CITATION_HARNESS.md
- overruled_status is NEVER cached. Verification is permanent; good-law status is
  not. Read it live at render on EVERY surface. Stale-overruled rate threshold 0 —
  overruled law rendered WITHOUT the LAW MOVED mark is as severe as a hallucination.
- UI: VERIFIED IS SILENT. No badge on a verified citation. Only two states render:
  unverified (unmissable mark + eCourts path) and overruled (LAW MOVED, 3 states).
  `failed` renders EXACTLY as `unverified` — the advocate cannot act on the
  difference, and an outage must not read as a corpus gap. verified_by_source
  appears only in the on-tap detail and the admin monitor, never as a badge.
  Silence = "verified, not decorated". Silence NEVER = "dropped".
- Copy is licence protection, not an audit: "Safe to file", never "we verified
  this"; "We could not confirm this exists", never "verification failed".
- Amber #B4690E is RESERVED — it means THE LAW HAS MOVED and nothing else. Never
  on drafts, OCR, or anything about our own confidence. Our uncertainty renders
  as neutral ink with a dashed edge.
- No AI-assisted mark on documents. Consent once at onboarding, recorded in users
  (terms_accepted_at, terms_version). PD-8 superseded. No watermark on export.
- Never bypass the eCourts CAPTCHA. Human confirms, cache forever.
- Route by DATA SENSITIVITY not task difficulty. Public = DeepSeek V4 Flash.
  Sensitive = pseudonymise first, then Claude. Ambiguity resolves to sensitive,
  never to public. ONE DOCUMENT PER CALL — mixing case files cross-contaminates
  parties between matters. OD-6 resolved 2 Aug 2026; the countersigned DPA is
  still owed before uploads ship. docs/PRIVACY_PII.md
- Never claim complete PII removal. Coverage is partial. Say so.
- OCR output is never trusted silently — advocate confirms fields before save.
- Never train on a model's commentary about law. Primary sources only.
- BNS/BNSS/BSA replaced IPC/CrPC/Evidence July 2024. DOMAIN_TRUTH.md or the
  fact does not exist.
- Hindi = Noto Sans Devanagari everywhere incl. PDF export.
- Stack fixed: Expo · Hono · Railway PG + pgvector · Drizzle · better-auth.
  NOT Neon/Vercel/Qdrant/Clerk/Supabase. Ask before adding any vendor.
- Four core features PLUS the daily loop. Tier B (the loop) ships before Tier A
  (the library): the loop creates the habit, the library prevents a comparison
  loss. PRODUCT_BRIEF.md
- Ponytail ladder applies to every build decision. The best code is the code you
  never wrote. EXEMPT: the citation verification pipeline is never simplified.
  A package with no direct import may still be a declared peer — check
  peerDependencies before removing anything.
- OSS FIRST: search for a maintained project before building anything
  non-differentiating. MIT/Apache/BSD ok. AGPL is NOT. docs/OSS_STACK.md
- Never resolve an OPEN_DECISION alone. docs/OPEN_DECISIONS.md
- TWO lanes only: LCC=server, RCC=client. Write only inside yours. Contract
  (docs/API_CONTRACTS.md) is FROZEN per sprint. BUILD_GUIDE.md

HOW TO WORK — the founder has asked for this repeatedly and it survives
compaction, a new session, and a fresh agent:
- WORK CONTINUOUSLY. Emitting prose ENDS THE TURN, so a status update IS a stop.
  Keep calling tools until every task is done. Do not stop at a milestone, a green
  CI run, or a successful deploy.
- SOLVE YOUR OWN BLOCKERS. A console action is not a blocker — Railway, Resend and
  Spaceship all have CLIs or APIs; try them. A missing design is not a blocker —
  build the server side behind an additive, documented, provisional shape. A
  missing token is not a blocker for the CODE — build the whole path behind an
  interface that works without it and refuses honestly in production, as
  packages/auth/src/mail.ts does.
- STOP ONLY FOR: an API key or secret you do not have, an account that must be
  created under the founder's identity, or something that costs money. State it in
  one or two lines, having already built everything around it.
- Batch reporting into ONE final message when the work is actually finished.

If context was compacted: re-read docs/OPEN_DECISIONS.md, docs/SCHEMA_TRUTH.md,
docs/CITATION_HARNESS.md before your next edit.
</lawmind-core>
CORE_TEXT

# jq builds the JSON so quotes, backslashes and newlines escape correctly.
# Hand-assembling this string is how one stray quote silently kills the hook.
if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$CORE" \
    '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
else
  # No jq on PATH: plain stdout is also accepted. Visible in the transcript
  # rather than a system reminder, but the core still lands. Degraded, not lost.
  printf '%s\n' "$CORE"
fi

exit 0
