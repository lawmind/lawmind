# V1 CLAIMS REGISTER — R17 PLATFORM-SCOPE ALIGNMENT

**SHIP, 18 September 2026 (S4-T0.1).** Supersedes only the platform-scope wording
of [`V1_CLAIMS_REGISTER_R16.md`](V1_CLAIMS_REGISTER_R16.md). Every R14/R15/R16
claim, qualifier, prohibition and audit result stays in force unchanged. R16 is
historical evidence and is not edited.

Bound to: [`V1_CAPABILITY_REGISTRY_R17.json`](V1_CAPABILITY_REGISTRY_R17.json)
(change control `CCR-SHIP-S4T0-01`).

## 1 · What changed

```text
ADVOCATE_WEB_APP_CLAIMS          = PROHIBITED (platform OUT_OF_SCOPE_CURRENT_FOUNDER)
IOS / ANDROID CLAIM BASIS        = UNCHANGED FROM R16
PROMOTIONAL_WEBSITE              = CLAIMS SURFACE ONLY, NOT A CLIENT PLATFORM
CAPABILITY_STATE_CHANGE          = NONE on iOS or Android
```

1. **No public or store claim may describe an advocate web, desktop or browser
   product, a web login for advocates, or "use LawMind on your computer".** R16
   forbade such claims because no web row was ENABLED. R17 forbids them because
   the platform is out of scope by current founder instruction. The practical
   effect is the same. The reason is different, and it no longer expires when a
   web client gets built.
2. **Store listings and review notes are claim surfaces bound to this register.**
   Every feature claim in App Store / Play metadata, screenshots and review notes
   must name a capability that is `ENABLED_V1` (or `ENABLED_V1_KILLABLE`, stated
   with its platform override) on **that store's platform** in R17.
3. **The temporary promotional website does not set capability truth.** Its copy
   is not product authority and is not redesigned per sprint. Where the founder
   publishes a launch claim there, it is still bound by rule 2. The stable
   compliance URLs are release contracts, not claims.
4. **iOS party-name search:** `search.party_name` resolves DISABLED on iOS through
   one platform override (R16 runtime observation, unchanged). No iOS store claim
   may mention party-name search.

## 2 · Still prohibited (carried, restated for store work)

Drafting, document upload/OCR, Hindi generation, hearing briefing / daily loop,
live monitoring or any cadence/SLA/court-coverage promise, public semantic or
concept search, adverse-authority automation, statute-linked judgment
conclusions, automatic old/new criminal-code applicability, generic chat. None is
ENABLED on any platform in R17.

## 3 · Audit delta

```text
UNSUPPORTED_REACHABLE_CLAIMS = 0   (unchanged; not re-measured in this round)
ENABLED_WITHOUT_EVIDENCE     = 0   (inherited from R16)
WEB_ADVOCATE_CLAIMS_ALLOWED  = 0
```

No product surface was re-swept in this round. This register makes no new
measurement; it records a scope rule.
