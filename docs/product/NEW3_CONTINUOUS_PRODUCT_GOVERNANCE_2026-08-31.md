# NEW3 CONTINUOUS PRODUCT GOVERNANCE — 31 AUGUST 2026

**Lane:** NEW3

**Governing roadmap:** Master Roadmap v7.1

**Contract revision:** R14 — no R15 is created by this record

This seal records current product authority without enabling a capability. It is
additive to `V1_CAPABILITY_REGISTRY_R14.json`, `V1_CLAIMS_REGISTER_R14.md`,
`RCC_V1_API_CONTRACT_R14_AMENDMENT.md`, and `CONTRACT_CHANGE_LEDGER.json`.

## 1 · Advocate web / desktop research workstation

```text
ADVOCATE_WEB_SCOPE = IN_V1
ADVOCATE_WEB_LOCAL_IMPLEMENTATION = ALLOWED
ADVOCATE_WEB_PUBLIC_CAPABILITY = DISABLED_NOT_READY
```

`IN_V1 != ENABLED`. Master Roadmap v7.1 governs current planning. The older
phone-only / desktop-cancelled wording in `CLAUDE.md` and `PRODUCT_DECISIONS.md`
PD-15 remains a historical record and is stale where it conflicts with v7.1; it
does not govern this scope. NEW3 does not own either file and does not edit them.

Local RCC implementation is authorised. It must use the same legal truth and API
contract as mobile, and it must remain the v7.1 research workflow:

```text
Search -> judgment -> source/citations/statutes -> save -> matter
```

It must not become a generic AI chat surface.

Local implementation authorises none of the following:

- public navigation;
- a marketing, store, or fundraising claim that advocate web or desktop is
  available;
- deployment or public reachability;
- a capability transition from `DISABLED_NOT_READY` to `ENABLED`.

No sentence may say or imply `desktop available` or `web available` until named
implementation and test evidence exists and NEW3 explicitly changes the public
capability state. The server accepting `platform=web` remains a selector, not
evidence that an advocate web client exists.

### Exact NEW3 -> RCC web handoff

> Master Roadmap v7.1 governs. `ADVOCATE_WEB_SCOPE=IN_V1`;
> `ADVOCATE_WEB_LOCAL_IMPLEMENTATION=ALLOWED`;
> `ADVOCATE_WEB_PUBLIC_CAPABILITY=DISABLED_NOT_READY`. `IN_V1 != ENABLED`.
> RCC may implement the desktop research workstation locally against the same
> legal truth and API contract as mobile. Keep it to Search -> judgment ->
> source/citations/statutes -> save -> matter; it must not become generic AI
> chat. This authorises no public navigation, marketing/store/fundraising claim,
> deployment, public reachability, or capability enablement. Do not say or imply
> `desktop available` or `web available` until implementation/test evidence
> exists and NEW3 explicitly changes the capability state. Historical
> phone-only/desktop-cancelled wording in `CLAUDE.md` and PD-15 is stale where it
> conflicts with v7.1 and is non-governing for this scope; do not edit those
> files.

## 2 · Party-name iOS override

```text
PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
PARTY_DEFER_STATE = INTACT
```

The current override map remains inactive. Local advocate-web implementation is
not a reason to activate it. `CCR-NEW3-S2F-01` remains deferred, and no R15 is
invented.

## 3 · Saved-authority R14 release gate

Session-start state, retained as history:

```text
CCR-RCC-S2-02 = UNRELEASED
SAVED_AUTHORITY_LCC_IMPLEMENTED = NO
SAVED_AUTHORITY_RELEASED_TO_RCC = NO
SAVED_AUTHORITY_RCC_CONSUMED = NO
```

NEW3 changes the first two values to `YES` only after one final reread proves all
of the following from committed LCC implementation and focused tests:

1. `precedentialEffect` is served by both `GET /matters/:matterId/authorities`
   and the authority returned by `POST /matters/:matterId/authorities`;
2. `canAddToMatter` is served by both shapes;
3. `citableForUntouchedPropositions` is served by both shapes;
4. all three values are derived live on the request under the existing R14 A6
   semantics, never stored on `matter_authorities`;
5. committed tests prove the live derivation rather than only field presence.

Until that proof passes, RCC's R14 A6 fallback remains the contract and the
release stays `NO`.

Release observation, 31 August 2026:

```text
IMPLEMENTATION_COMMIT = 24cf3623
SAVED_AUTHORITY_LCC_IMPLEMENTED = YES
SAVED_AUTHORITY_RELEASED_TO_RCC = YES
SAVED_AUTHORITY_RCC_CONSUMED = NO
CONTRACT_REVISION = R14
```

Observed at HEAD `753dda4c906be426e94516e83645adb9a7b04643`:

- committed GET and POST shapes serve all three fields through the same live
  `precedentialEffectFromEdges` -> `precedentialPolicy` derivation;
- the committed test changes only the inbound `judgment_citations` evidence and
  observes the same saved `authorityId` change on the next GET without resaving;
- the schema test proves the policy fields and `overruled_status` are absent
  from `matter_authorities`;
- `node --env-file=.env --import tsx --test --test-concurrency=1
  services/api/src/matters/authorities.test.ts`: **21 pass, 0 fail**;
- `pnpm --filter @lawmind/api typecheck`: **PASS**.

### Exact NEW3 -> RCC saved-authority release handoff

> CCR-RCC-S2-02 is released under the existing R14 amendment. LCC implementation
> commit `24cf3623` is verified at HEAD
> `753dda4c906be426e94516e83645adb9a7b04643`. GET
> `/matters/:matterId/authorities` and the authority returned by POST now serve
> optional `precedentialEffect`, `canAddToMatter`, and
> `citableForUntouchedPropositions`, derived live on each request through the
> existing R14 semantics and never stored on `matter_authorities`. Focused suite:
> 21 pass, 0 fail; API typecheck: PASS. `LCC_IMPLEMENTED=YES`;
> `RELEASED_TO_RCC=YES`; `RCC_CONSUMED=NO`. RCC may consume and test these fields
> now. No R15; contract revision remains R14. The party-name override remains
> inactive under `BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT`. This release does
> not enable advocate web or authorise any web/desktop availability claim.

## 4 · Truth counters

```text
ENABLED_WITHOUT_EVIDENCE = 0
UNSUPPORTED_CLAIMS = 0
```

These counters cover this governance transition. They do not restate a product
capability as available; they record that none was enabled and no availability
claim was authorised.

## 5 · Saved-authority R14 consumption — closed

The §3 release observation recorded `SAVED_AUTHORITY_RCC_CONSUMED = NO`, which was
true when it was written. It is superseded here rather than rewritten:

```text
SAVED_AUTHORITY_RCC_CONSUMED = YES
CONSUMPTION_COMMIT           = 6f0d96bf   (bus 1629, 31 Aug 2026)
CONTRACT_REVISION            = R14        (unchanged; no R15)
```

Observed at HEAD `6f0d96bfee9ccfea1be85fb768fc9f1c82f9f336`:
`apps/mobile/src/screens/matter/MatterScreen.tsx` reads `precedentialEffect`,
`canAddToMatter` and `citableForUntouchedPropositions` on the saved-authority row,
and `npx jest src/screens/matter/MatterScreen.authorities.test.tsx` returns
**16 pass, 0 fail**. `CCR-RCC-S2-02` is closed end to end.

## 6 · Cross-surface `overruledStatus` — adjudicated DEFER, no R15

LCC reported that the judgment reader and the saved-authority list appear to
disagree about the same judgment's treatment status. Adjudicated in full at
[`NEW3_CROSS_SURFACE_TREATMENT_ADJUDICATION_R14.md`](NEW3_CROSS_SURFACE_TREATMENT_ADJUDICATION_R14.md),
ledger row `CCR-NEW3-XS-01`.

```text
SAME_LEGAL_FACT_DIFFERENT_VALUE = YES
USER_TRUTH_CLASSIFICATION       = INTERNAL_ONLY_DIFFERENCE
DECISION                        = DEFER
NEW_REVISION                    = none — R14 remains current
SEVERITY                        = P1
WIRE_PROTOCOL_VERSION           = 1  (unchanged)
LCC_CHANGE_REQUIRED             = NO  (record only)
RCC_CHANGE_REQUIRED             = NO
```

The difference is one field name carrying two OD-14 layers: `overruledStatus` is
the derived `policy.bannerStatus` on the reader, search and briefings — each with
the stored column beside it as `overruledStatusStored` — and the raw stored column
on `GET|POST /matters/:matterId/authorities`, which serves no
`overruledStatusStored` at all.

Live census at HEAD: **98** judgments carry a non-`none` stored status, **97** have
banner == stored, and the single divergence is `1975 INSC 212`
(*T. R. Challappan*, `evidence_defect`, stored `set_aside`, banner `none`), saved
to **zero** live matter authorities. The banner-upgrade class — where the derived
banner would be graver than the stored value, and the saved list would therefore
under-state a warning — measures **zero rows**.

It is `INTERNAL_ONLY_DIFFERENCE` **because RCC's consumption in §5 compensates for
it**, not because R14 distinguishes the two meanings. R14 does not. The override at
`MatterScreen.tsx:521–522` is therefore contract-load-bearing and must not be
removed as redundant; that is the one instruction issued to RCC, and it asks for no
change.

No capability changes state. The counters in §4 stand: `ENABLED_WITHOUT_EVIDENCE = 0`,
`UNSUPPORTED_CLAIMS = 0`. `PARTY_IOS_OVERRIDE_ACTIVATION` remains
`BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT` and `ADVOCATE_WEB_PUBLIC_CAPABILITY`
remains `DISABLED_NOT_READY`.
