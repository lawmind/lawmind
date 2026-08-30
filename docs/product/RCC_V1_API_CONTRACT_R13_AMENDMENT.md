# RCC v1 API CONTRACT — R13 AMENDMENT

**Status:** `RCC_API_CONTRACT = R13`. Supersedes **only the sections named below**.
**Prior version:** `R12`, `docs/product/RCC_V1_API_CONTRACT_R12.md`,
sha256 `e89d93c82772cd35aab59626fd20cb291e966f4fc687eb4c7fdc054c1981d5ed`.
**R12 is not edited.** It remains the frozen baseline and historical evidence.
**Amended by:** NEW3, 30 August 2026. **Ledger:** `CONTRACT_CHANGE_LEDGER.json`.
**Measured against:** `gitSha f3b31c963dd19741b7a849d8a007d42aa1b9bfb1` — the sealed
Day-0 HEAD — live local API on `http://127.0.0.1:3011`.

**The wire `contract` integer stays `1`.** Every change here is additive or
semantic. Nothing is removed, renamed or narrowed, so an R12 client keeps working.

---

## WHAT RCC MAY CONSUME TODAY

| amendment | released to RCC | why |
|---|---|---|
| **A1** — `rarestDf` semantics | **YES** | the shape already exists and was observed |
| **A2** — the two "Known v1 limits" bullets | **YES** | measured false; the correction is a *removal of a limit*, not a new shape |
| **A3** — `capabilities[].platforms` | **NO** | no backend serves it yet. Do not build against it. |

---

## A1 · `retrievalOutcome.rarestDf` — semantics stated, shape unchanged

R12 documented the field as *"number, present whether or not it refused"* and said
nothing about what it is a frequency **of**. It is now stated, because the natural
reading was wrong:

> **`rarestDf` is the CORPUS-WIDE document frequency of the query's rarest lexeme.
> It is invariant under `filters`, and it is NOT the bound that admitted or
> refused this request.**

Measured 30 August, one query across six scopes:

| scope | results | `rarestDf` | latency |
|---|---|---|---|
| `bail`, unfiltered | 0, refused | `0.25773984261292154` | 2.9 ms |
| `bail` + `courts:[hc]` + 2026-08-01…08-29 | 0, refused | `0.25773984261292154` | 207.4 ms |
| `bail` + `courts:[hc]` + 2026-07-01…07-31 | 0, refused | `0.25773984261292154` | 262.6 ms |
| `bail` + `court:"High Court of Delhi"` + 8 months | 0, refused | `0.25773984261292154` | 124.9 ms |
| `bail` + `court:"High Court of Delhi"` + 1 month | **5, answered** | `0.25773984261292154` | 418.1 ms |
| `bail` + `court:"High Court of Delhi"` + 3 days | **5, answered** | `0.25773984261292154` | 154.6 ms |

Seventeen significant figures, six scopes, two different outcomes, one value.

**Binding on RCC.** `rarestDf` may appear in a developer/diagnostic surface. It
may **not** be used to compute or phrase a user-facing narrowing hint, a coverage
statement, or a "your query is too broad" threshold — a user who has already
narrowed to one court and one month would be told so on the strength of a number
that never looked at their filters. Use `emptyBecause` and `degraded[]`, which do
describe this request.

---

## A2 · The two "Known v1 limits" bullets are superseded

R12 §"Known v1 limits on this endpoint" ended with two bullets and the sentence
*"RCC builds the screens now; they begin returning results when LCC changes the
bound."* **LCC changed the bound in `d96147e`, and both bullets are now false as
written.** Superseded text and its replacement:

### ~~"A party name alone returns zero. A full cause title resolves at rank 1."~~

> **A party name alone now resolves.** `SATENDER KUMAR ANTIL` returns **3 results
> with the authority at rank 1** in **295.6 ms** — `degraded` absent,
> `retrievalOutcome.state = "degraded"` for `semantic_index_insufficient` only.
> The three rows are near-duplicate records of one case, not three judgments.
>
> **The limit that remains, and it is real:** a party name built from
> corpus-common tokens still refuses. `SANJAY KUMAR MISHRA @ SANJAY MISHRA`
> returns **0** with `degraded:["sparse_unbounded"]`,
> `emptyBecause:{query_too_broad_to_rank, add_more_terms}`, and it pays
> **1,239.2 ms** to get there. Indian personal names are frequent *because* they
> are party names, so this is not a rare edge.

**Binding on RCC:** the case-first hint stays wired and still fires — it now fires
on the common-name case rather than on every party-name case. Do not remove it.
The remedy string `add_more_terms` is honest here: adding the other party's name
or a court narrows it.

### ~~"A broad term inside a narrow filter is still refused on a corpus-wide document frequency."~~

> **Narrowing now buys admission, if it narrows enough.** A single named court
> plus a month returns results; a court *category* does not.
>
> | narrowing | outcome |
> |---|---|
> | one named court + 3 days | **5 results**, 154.6 ms |
> | one named court + 1 month | **5 results**, 418.1 ms |
> | one named court + 8 months | still refused |
> | `courts:["hc"]` category + 1 month | still refused |
> | no filter | still refused, 2.9 ms |
>
> **`courts: ["hc"]` is not narrowing.** The category expands to every High
> Court, which is a population of millions. `filters.court` with one name is.

**Binding on RCC:** a refusal is still a refusal and still renders
`emptyBecause`, never "no judgments matched". But the refusal screen must now
offer **narrowing that actually works** — a single court and a shorter date
range — and must not present a court *category* chip as the narrowing remedy,
because it is not one.

---

## A3 · `GET /release/capabilities` gains `platforms` — **NOT YET RELEASED**

**Do not build against this.** It is recorded here so the shape is decided before
it is implemented, not so RCC can consume it. `releasedToRCC` flips in the ledger
when LCC lands it and NEW3 observes it.

Observed today: `{registryVersion, asOf, capabilities}` where `capabilities` is a
flat map of **24** rows shaped `{state, reason, asOf, unblockedBy}`. The string
`platform` appears nowhere in the payload.

Amended shape — **additive and optional**:

```jsonc
"capabilities": {
  "search.party_name_only": {
    "state": "ENABLED",              // unchanged; the union/summary state
    "reason": "...",
    "asOf": "2026-08-30",
    "platforms": {                   // NEW, optional
      "ios":     "ENABLED",          // same four-state vocabulary
      "android": "ENABLED",
      "web":     "ENABLED"
    }
  }
}
```

- A row **without** `platforms` means every platform takes the top-level `state`.
  Every existing client therefore keeps working and `contract` stays `1`.
- Where `platforms` is present it is **authoritative for that platform**. A client
  reads its own platform's entry and falls back to `state`.
- **Turning `search.party_name_only` off on iOS must not change**
  `search.exact_citation`, `search.cnr`, `search.case_number` or
  `search.case_title_full`. They are separate rows, separately served. This is
  the whole point of the switch: Apple guideline 5.1.1(viii) is about compiling
  personal information, and a citation is not a person.

**Until it lands:** the iOS kill switch is a **build-time flag** in the client, and
the degrade behaviour is the one specified in `V1_CAPABILITY_REGISTRY_R13.json` —
party search **degrades visibly** to case-number / citation / CNR search with a
stated message. It never silently vanishes.

---

## WHAT DID NOT CHANGE

Restated because an amendment is where things get quietly widened:

- The envelope, the auth codes, `201` on creates, and the `403 PROFILE_INCOMPLETE`
  distinction — **unchanged**.
- `degraded[]` vocabulary, `emptyBecause`, `page`, `total` — **unchanged**.
- The degraded-state rendering table — **unchanged and still binding**.
- The three citation fields (`verificationState`, `verifiedBySource`,
  `overruledStatus`) — **unchanged**, still three fields, still rendered from the
  DB row. Observed intact through the R13 core-loop smoke.
- The six monitoring fields still serve `null` / `never_attempted`. **No polling
  frequency and no SLA may appear anywhere.** Nothing in this amendment moves
  monitoring one step closer to shipping.
- `contract: 1`, `minSupportedContract: 1`.
