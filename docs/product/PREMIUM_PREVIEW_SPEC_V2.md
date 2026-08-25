# PREMIUM PREVIEW — product specification V2

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-3. **Supersedes
`PREMIUM_GROWTH_SPEC_V1.md` §6**, which specified a supporting/contrary stance
split that the schema cannot produce. RCC implements this; NEW3 owns it; LCC owns
the endpoint.

---

## 0 · The one-line rule

**Show that real value exists. Charge for automation and synthesis. Never charge
for a safety fact, and never obscure one to create desire.**

The Tinder/Hinge principle is *"there are 6 people who liked you"* — a true,
computed, non-fabricated count, shown for free, where the paid thing is the
convenience of acting on it. It is **not** blurring a face. Applied here:

| Free, always, unconditionally | Premium |
| --- | --- |
| That an authority has been overruled, set aside, doubted | A written matter review that reasons over them |
| That a citation could not be confirmed | Issue extraction |
| A court date | Counter-position drafting |
| An unresolved filing | Risk synthesis |
| Every count below | The document |

An advocate who never pays must still never file a case that has moved. If the
paywall can cause a bad filing, it is the wrong paywall.

---

## 1 · What the server actually computes

`GET /matters/:id/premium-preview` → `hearingPackPreview()`. **Every field is a
`COUNT(*)` over the advocate's own rows.** No retrieval, no model call,
`costClass: 'cheap'`, and a test asserts zero `llm_calls` rows.

```
authorityCount      matter_authorities, not removed
eventCount          matter_events
adverseAuthorities  saved authorities whose judgments.overruled_status <> 'none'
nextHearingDate     matters.next_hearing_date
unresolvedFilings   a filing with no order on or after its own date
stanceNotComputed   true, always
notComputed[]       the four things that require generation, named
asOf                render time
```

`unresolvedFilings` uses the same date-based rule as `briefings/assemble.ts`
deliberately, so the preview and the briefing can never report different numbers
for the same matter — two surfaces disagreeing is how an advocate stops trusting
both.

**Verified live**, 10 matters, `ten-matter-regression.json`: 404 on every matter
with the flag off (correct — see §5), and in the 23 Aug run with flags on, real
counts drawn from live tables with `stanceNotComputed: true`.

### 1.1 The V1 error, and why it stays recorded

`PREMIUM_GROWTH_SPEC_V1.md` §6 specified *"2 supporting, 1 contrary"*.
**No stance column exists anywhere in the schema** (LCC bus 1053). Any such split
would have been invented at render time and shown to an advocate as a fact about
their own case. LCC refused to build it and returned `stanceNotComputed: true`
with a named `notComputed` list instead.

That is the correct behaviour and this spec makes it permanent: **the preview may
never state, imply, or tease whether an authority helps or hurts.**

---

## 2 · The states, and the exact copy

Four states. Copy is licence protection, not an audit (`CLAUDE.md`): it says what
the advocate can act on.

### State A — the matter is empty (`authorityCount = 0`, `eventCount = 0`)

> **Nothing saved to this matter yet.**
> Save an authority or add a hearing date, and LawMind can build a matter review from it.

No price. No teaser. An empty matter has no value to preview and pretending
otherwise is the fake-scarcity failure. **No CTA to purchase in this state.**

### State B — the matter has substance, nothing has moved

> **6 authorities · 4 events · hearing on 1 March**
>
> **Generate a structured matter review** →
> *Issues, counter-positions and unresolved risks, written from what you have saved.*
> *LawMind does not store whether an authority helps or hurts your case — the review works that out.*

The third line is required, not optional. It is what converts an absence into an
honest statement of scope rather than letting the reader assume a stance split
exists behind the button.

### State C — something has moved (`adverseAuthorities > 0`)

The count renders **as a free safety fact, above and visually separated from any
purchase control**:

> **1 of your saved authorities has a recorded change of status.** [View →]
>
> ——————————————
>
> **6 authorities · 4 events · hearing on 1 March**
> **Generate a structured matter review** →

Rules, all binding:

1. `[View →]` goes straight to the authority. **It is never gated, never behind the paywall, and never requires an account upgrade.**
2. The line may not say *which way* it moved beyond the three LAW MOVED states already rendered on the authority itself.
3. The line may not be phrased as urgency. **"1 of your saved authorities has a recorded change of status"** — never "⚠️ Your case is at risk", never "Act before your hearing".
4. `adverseAuthorities` counts `overruled_status <> 'none'`, which includes `doubted`. Copy must therefore say *"a recorded change of status"*, not *"has been overruled"* — the count is broader than that word.

### State D — the surface is off (HTTP 404, `NOT_ENABLED`)

**Render nothing.** No skeleton, no "coming soon", no disabled button. A client
that shows a premium control the server will not serve is a client claiming a
capability the backend does not have, which is exactly what `premium/gate.ts`
exists to prevent. Verified: 404 on all ten matters, flags off.

---

## 3 · The seven prohibitions

Each has a reason; none is stylistic.

1. **Never blur, pixelate, or padlock a citation.** A citation is either shown or not shown. A blurred one tells the advocate law exists that they cannot read, which is the opposite of the product's purpose.
2. **Never hide adverse treatment, in whole or in part, including behind a count.** `CLAUDE.md`: adverse-treatment information is never gated.
3. **Never hide an unresolved filing or a court date.** These are the advocate's own facts, and a missed date is the harm the product exists to prevent.
4. **Never fabricate a number.** No "2 contrary authorities". No stance column exists. If a number is not in §1's list, it is not computed and must not appear.
5. **Never fabricate urgency.** No countdowns, no seat counts, no "N advocates upgraded today", no red. A grep of the codebase found no such pattern today (NEW3-9); none may be introduced.
6. **Amber `#B4690E` is reserved.** It means the law has moved. It may not appear on a premium control, a price, or a CTA — using the LAW-MOVED colour to sell is the single fastest way to teach advocates to ignore it.
7. **Never imply the review has already been generated.** The counts describe stored rows; `notComputed[]` describes what does not exist yet. Both are on the wire and both must reach the screen.

---

## 4 · One addition V1 did not have, and it is a requirement

**A generated matter review must be able to say it found nothing.**

NEW1 carried this forward and this round's own evidence makes it mandatory:

- `/arguments/counter` has **no abstention field**. `counterKeys` is exactly `position, asOf, authorities, excluded, unverifiedReferences`.
- It returns 12 nearest authorities or 0, with nothing distinguishing confidence from a shrug.
- M06 returned an IPC §394 robbery conviction, at rank 1, for a commercial breach-of-contract position — reproduced deterministically two days running.
- `adverse_authority` and `statute` concept classes score **zero for every representation NEW1 has tested** (bus 1093).

So a paid synthesis surface built on today's retrieval would confidently
assemble a matter review out of wrong-domain authorities, and an advocate who
paid for it has more reason to trust it, not less.

**Requirement:** before any generation capability is sold, the pipeline must
carry a first-class *"No sufficiently relevant authority found"* state, and the
review must render it rather than its nearest neighbour. Until then the
`matter_automation` capability stays behind its OFF-by-default flag.

This is a **precondition on selling**, not on building. The entitlement spine,
the preview and the job pipeline may all ship dark.

---

## 5 · Entitlement behaviour, verified

- `GET /me/entitlements` → 404 with the flag off; `capabilities: []` and every catalogue entry `PROVISIONAL` with it on.
- `POST /premium/jobs` → **402 `NOT_ENTITLED`** for a free user, every time, on a real `idempotencyKey` and a real matter (23 Aug run, 10/10).
- Both are fail-closed and observed, not assumed.

**Client rule:** the client never decides entitlement. It renders what
`/me/entitlements` returns. A jailbroken, stale or replayed client must not be
able to reach a paid surface, and the only way to guarantee that is for the
server to be the sole authority.

---

## 6 · What RCC implements

| # | Item | Depends on |
| --- | --- | --- |
| 1 | The four states above, exact copy | nothing — server contract is live |
| 2 | State D as *render nothing* | nothing |
| 3 | `adverseAuthorities` as a free, ungated, visually separated safety line | nothing |
| 4 | `notComputed[]` rendered, not dropped | nothing |
| 5 | Entitlement read from `/me/entitlements` only | nothing |
| 6 | Exposure event through the durable server contract, not a client tap | LCC's activation writes (landed) |
| 7 | Abstention state in any generated review | §4 — **blocked, and correctly so** |

Items 1–6 are unblocked today. Item 7 gates **sale**, not build.

## 7 · What NEW3 will check (NEW3-7)

Against this file, per state: PASS / PARTIAL / FAIL with evidence. Specifically —
that State C's safety line is reachable without an upgrade; that no fabricated
count appears anywhere; that State D renders nothing; that amber appears on no
premium control; and that `notComputed[]` reaches the screen.
