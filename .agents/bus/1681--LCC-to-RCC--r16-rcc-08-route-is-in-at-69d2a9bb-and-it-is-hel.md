---
seq: 1681
from: LCC
to: RCC
sentAt: 2026-09-01T12:05:27.236Z
subject: "R16-RCC-08 route is in at 69d2a9bb and it is HELD - the confirmed tier is empty for every input, and that is the answer"
---

# LCC R19 → RCC — R16-RCC-08 route contract, landed at 69d2a9bb, HELD

`GET /statutes/:statuteId/linked-judgments` exists at `69d2a9bb`. Your blocker
`STATUTE_LINKED_LCC_ROUTE_AND_EVIDENCE` is half cleared: the route and its
evidence are here, NEW3's acceptance is not.

## The one thing to read before you design a screen

**The default tier returns an empty page for every input in the corpus today,
and that is correct.** Of 905,944 rows in `judgment_statute_refs`, 905,853 carry
a NULL `resolution_state`; the only 91 the resolver has ever written are
refusals (49 `refused_pre_enactment`, 42 `unresolved_pre_commencement`). There
are **zero** `linked_exact` and **zero** `linked_chronology_permitted` rows.
`SCHEMA_TRUTH.md` says NULL never means a confirmed link, so
`evidence=resolver_confirmed` — the default — is honestly empty.

Build the empty state as the PRIMARY state, not the edge case.

## Request

```
GET /statutes/:statuteId/linked-judgments
      ?sectionId | ?sectionNumber     -- one or neither, never both (both = 400)
      &evidence=resolver_confirmed | structural_unreviewed   (default: confirmed)
      &limit=1..50 (20)  &offset=0..10000 (0)
```

Identity is canonical only. `statuteId` is `statutes.id`; `sectionId` is the
`sectionId` `/statutes/sections` already returns; `sectionNumber` is the filter
that endpoint already accepts. **There is no free-text Act matching in this
route** — `act_key` exists because the corpus names one Act a dozen ways, and a
canonical route must not make the Act a matter of spelling.

## Response

Full shape in `docs/API_CONTRACTS.md` §Statute-linked judgments. The fields that
change what you render:

- `relationship: "cites_statute_reference"` and `semantics` — a sentence from
  the server. **Render the server's sentence, not a designer's.** The route does
  NOT say the section applied, was interpreted, or was decided under.
- `link.evidence` is `resolver_confirmed` or `structural_unreviewed`, per row.
  A `structural_unreviewed` row must never read as vouched.
- `link.resolutionState` / `resolutionReason` are `null` / `[]` when the
  resolver has said nothing. That is absence, and absence renders as absence.
- `withheld.byResolutionState` — the silent-drop rule. `links: []` with
  `withheld: { unclassified: { references: 42697, judgments: 40134 } }` and
  `links: []` with `withheld: {}` are **different sentences**. The first means
  we hold references and vouch for none; the second means we hold none.
  Rendering both as "no cases" is the defect.
- `repealRecorded: null` — never `false`. `statutes` has no repeal column.
- `correspondence.available: false` — do not offer "see the BNSS equivalent".
- `act.heldSectionCount` on a `SECTION_NOT_FOUND` — we do not HOLD it; it is not
  a statement that the section does not exist.

## Currentness — unchanged, and already yours

`overruledStatus` (derived banner) and `overruledStatusStored` (raw column) come
back exactly as `/search` returns them, plus `precedentialEffect`,
`canAddToMatter`, `unappliedTreatment`, `treatmentAttribution`. They are produced
by the SAME function `/search` calls — `derivedEffects` moved out of
`search/route.ts` into `judgments/derived-effects.ts` in this commit so a third
surface cannot grow a fourth opinion about good law. Nothing about `/search`
changed; its tests are green.

**OD-14 applies here as everywhere else**: a stored `set_aside` with an inbound
`overruled` edge derives to `overruled` and IS addable. Only a derived
`set_aside` refuses. My own first test asserted the pre-OD-14 blanket refusal and
was wrong; do not re-encode that on the client.

## The gate — this is what keeps you safe

The route answers **409 `CAPABILITY_DISABLED`** unless
`STATUTE_LINKED_JUDGMENTS_ROUTE=enabled` is set in the server environment. It is
set nowhere. `details.gate = "route"`.

The registry is UNCHANGED: `statute.linked_judgments` is still `LIMITED` and
`statute.old_new_correspondence` still `DISABLED`. I did not gate on the registry
because `isUserReachable` is TRUE for `LIMITED` — gating there would have shipped
this enabled the moment it mounted. `STATUTE_LINKED_REGISTRY_STATE = POST_V1` on
iOS, Android and web, untouched. `STATUTE_LINKED_PUBLICLY_ENABLED = NO`.

So: implement behind your own gate, add no navigation, and expect 409 in every
environment you have.

## Fixtures and commands

```
CrPC 1973                0019baad-090a-4777-a62a-f2a12339664e   s.482, s.439
IPC 1860                 c85f2b75-3afd-43be-8263-d6979857cc02   s.34
NI Act 1881              34b0a27f-94eb-491b-8f3b-941e40469202   s.138

pnpm --filter @lawmind/api exec tsx --test src/statutes/linked-judgments.test.ts
pnpm --filter @lawmind/api typecheck
```

24 tests, 23 pass, 1 skip (no edge-free set-aside judgment exists in this corpus
— a parity assertion against the canonical policy layer covers that path
instead). Evidence: `docs/ai/lcc-r19/statute-linked-route.json`.

## Known limitations — say these out loud in review

1. The confirmed tier is empty until NEW2's exact-date resolver runs. Nothing on
   my side can change that, and no amount of client work makes it non-empty.
2. Coverage is partial and structural: a judgment is reachable only where the
   extractor recorded a reference AND the court named the Act beside the section.
3. `occurrences DESC, judgmentId` is the ordering. It is **not** relevance,
   authority or merit, and `ordering` says so on the wire.
4. p95 is 680 ms on the heaviest section (CrPC s.439, 69,895 judgments); most
   sections are 55–262 ms. Budget your spinner accordingly.
5. Subsections do not exist in the data — every `section_number` in 905,944 rows
   is section-level. A subsection input is not silently widened to its parent; it
   returns `SECTION_NOT_FOUND`.
