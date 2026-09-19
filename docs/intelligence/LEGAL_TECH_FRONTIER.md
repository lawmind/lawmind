# LAWMIND — LEGAL-TECH FRONTIER RADAR

```text
GOVERNING            = NO
AUTO_PROMOTE_TO_ROADMAP = NO
DATED_INTELLIGENCE   = YES
```

**This file is not authority.** It is a dated watch list. Nothing in it changes
scope, enables a capability, or creates an implementation task. Installed by
Amendment A2 (roadmap v7.4 §26.12), 19 September 2026.

Authority lives in `docs/CURRENT_STATE.md` →
`docs/roadmaps/LAWMIND_MASTER_ROADMAP_V7_4.md` →
`docs/roadmaps/LAWMIND_SPRINT_PROMPTS_V5.md`. An agent that reads this file and
starts building has skipped every one of them.

---

## 1 · Why this file exists rather than a paragraph in the roadmap

A roadmap that absorbs competitor announcements has adopted a vendor's marketing
as its own evidence. The failure is quiet: six months later nobody can tell which
lines were measured and which were read in a press release.

So frontier material is kept **outside** the governing documents, dated, and
labelled by verification class. Promotion into v7.4 happens only through §26.12's
path, and only on evidence.

## 2 · Entry format — every field is required

```text
OBSERVATION            what was seen, stated plainly
DATE                   when it was observed (not when it was published)
SOURCE                 where, with a URL where one exists
VERIFICATION CLASS     VERIFIED | INFERRED | UNVERIFIED
VENDOR CLAIM?          YES | NO
INDEPENDENTLY VERIFIED? YES | NO | NOT_ATTEMPTED
POSSIBLE LAWMIND IMPLICATION   the hypothesis, phrased as a hypothesis
FALSIFIER / TEST       what would show the implication is wrong
PROMOTION STATE        WATCH | TESTING | PROMOTED | REJECTED
```

`VENDOR CLAIM? = YES` with `INDEPENDENTLY VERIFIED? = NO` is a rumour with a
citation. It may be recorded. It may not be acted on.

## 3 · Promotion path (roadmap §26.12)

```text
EXTERNAL DEVELOPMENT → FRONTIER WATCH → PRIMARY-SOURCE VERIFICATION → FRONTIER RADAR
        ↓
DURABLE STRATEGIC IMPLICATION?
   NO → WATCH
   YES → FALSIFY / TEST → EVIDENCE STRONG?
                             NO  → RADAR
                             YES → ROADMAP AMENDMENT
```

Competitor behaviour creates **hypotheses**, not roadmap authority. A capability
gate is never opened because someone else shipped something.

## 4 · Standing rules

- **A model release is not a product implication.** LawMind's moat is data,
  provenance, retrieval, authority intelligence and workflow (roadmap §26.10); a
  frontier model that reasons better does not change any of those.
- **Never paste a competitor's product announcement into v7.4.**
- **Do not let a radar entry consume the release critical path** (roadmap §24, A2
  block) unless it uncovers a genuine P0 truth or safety defect.
- **Feature envy is not a gate.** `PUBLIC_SEMANTIC = DISABLED`,
  `CITATION_BULK_APPLY = HOLD` and the monitoring/briefing disabled states are
  unaffected by anything recorded here.

---

## 5 · Entries

### 5.1 Android developer verification — enforcement geography and the 20-device cap

```text
OBSERVATION   Google's limited-distribution path caps installs at 20 devices per
              APK (no government ID, no fee; aimed at students, teachers,
              hobbyists). User-facing enforcement begins 30 Sep 2026 in Brazil,
              Indonesia, Singapore and Thailand on participating app stores,
              expanding globally in 2027 and beyond. India is not in the
              September 2026 wave.
DATE          19 September 2026
SOURCE        https://developer.android.com/developer-verification
VERIFICATION CLASS      VERIFIED (vendor's own current documentation, read on the date)
VENDOR CLAIM?           YES — but the vendor is the rule-setter, which is the one
                        case where a vendor statement IS the primary source
INDEPENDENTLY VERIFIED? YES — corroborated against secondary reporting of the same
                        regional list and the 2027 global expansion
POSSIBLE LAWMIND IMPLICATION
              The ~100-lawyer private beta cannot use limited distribution (20 < 100)
              and does not need it: India is outside the current enforcement wave, so
              a directly distributed signed APK is unblocked today. Verified-developer
              status is a FUTURE distribution requirement to close before broad
              enforcement reaches India.
FALSIFIER / TEST
              India appearing in an enforcement wave, or the device cap changing.
              Recheck before Wave 2 and before public release.
PROMOTION STATE  PROMOTED — roadmap §16.4 (A2)
```

This entry is the reason §16.4 exists in the roadmap rather than a remembered rule.
A remembered version of this policy is exactly how a false blocker — "we must
publish to Play before the beta" — enters a plan.

---

*New entries append below. Do not edit an existing entry's OBSERVATION or DATE;
supersede it with a new dated entry and set the old one's PROMOTION STATE.*
