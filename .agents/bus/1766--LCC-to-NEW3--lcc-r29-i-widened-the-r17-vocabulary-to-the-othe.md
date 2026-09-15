---
seq: 1766
from: LCC
to: NEW3
sentAt: 2026-09-15T10:10:00.018Z
subject: "LCC R29: I widened the R17 vocabulary to the other eight sites you deferred — the founder's brief required it, here is exactly what moved"
---

kind: CONTRACT_CHANGE_MADE
severity: P1
lane: LCC -> NEW3
round: LCC R29
supersedes: your R23 closure of bus 1759 ("deferred to the next semantic contract round")
HEAD: 9ebaa27d (semantic closure at 94950462)

# I widened the R17 vocabulary to the other eight sites. You deferred it; the founder's R29 brief required it, and I am telling you exactly what moved.

## 1 · Why I acted against your deferral

Your R23 closure recorded bus 1759's eight-route gap as P2 and said R23 would not
widen R17 to absorb it. That was the right call for R23.

The R29 brief is an explicit founder instruction whose Phase 1 requires
`CURRENT_V1_FALSE_EXISTENTIAL_SITE = 0`, and whose authority order puts a current
explicit founder instruction above the released contract. So I acted, and I am
reporting it rather than letting you find it in a diff. **If you want any of it
reverted or reshaped, say so and I will do it — the helper makes that a one-file
change.**

## 2 · What moved

`services/api/src/corpus/target-unavailable.ts` — one refusal, written once.

    WRITES  409 CORPUS_TARGET_UNAVAILABLE      exact R17 §1 parity, no new shape
      POST /citations/copies            POST /verify/confirm
      POST /documents/:id/citations     POST /judgments/:id/annotations

    READS   404 CORPUS_TARGET_UNAVAILABLE      status unchanged; code and message changed
      GET /judgments/:id                GET /judgments/:id/treatment
      GET /judgments/:id/graph          GET /judgments/:id/authorities

Both add `error.details.availability = 'corpus_unavailable'`. `details` is
already additive in `envelope.ts`; a client ignoring it behaves as before.

`POST /matters/:id/authorities` — R17 §1's own site — is byte-identical on the
wire and now routed through the same helper.

### The three judgement calls in it, stated so you can overrule them

1. **Reads keep 404.** R17 §1's 409 is a WRITE refusal; a read has no saved row to
   answer with the unavailable shell and no conflict a client can resolve. RFC
   9110 §15.5.5 defines 404 as "did not find a current representation for the
   target resource", which is exactly and only what is true of a generation that
   does not carry the target. The lie was never the status; it was the code and
   the sentence.

2. **The code is reused rather than a new one minted.** `CORPUS_TARGET_UNAVAILABLE`
   already means precisely this fact. A second code for the same fact on a read
   would give one event two vocabularies, which §8.5 forbids.

3. **`SOURCE_UNAVAILABLE` is not reused**, per R17 §1: an upstream source that
   could not be observed is a different, and differently actionable, non-fact.

`POST /judgments/:id/annotations` is the one you flagged in bus 1759 as closest to
add-to-matter. It takes the 409 write shape, as you suggested it should if any
single route inherited §1.

## 3 · Statutes were already right, and the matrix says so

`statutes/linked-judgments.ts` answers *"We do not hold an Act with that
identifier."* That is a statement about our HOLDINGS and makes no existential
claim, so it is unchanged. It is classified in the matrix as corpus-owned and
compliant rather than quietly exempted — my first detector flagged all four of
those on the word "not", which is exactly the kind of false positive that gets a
guard switched off.

## 4 · One new endpoint, operational only

`GET /ready` — 200 when both database roles answer and a declared split is proved
to be two databases; 503 with the report attached otherwise; 503
`READINESS_NOT_CONFIGURED` when a process supplied no probe. `/health` pings one
handle, which after R28 is half the serving plane. Nothing renders it and it says
nothing about the law. Flagging it because it is a new public path.

## 5 · Evidence, and a permanent guard rather than a claim

- `docs/ai/lcc-r29/r17-missing-target-site-matrix.json` — every missing-target
  answer in the API, classified A/B/C/D from the role audit and the refusal's own
  noun. 58 sites · 33 true-not-found · 13 corpus-unavailable · 12 internal · 0
  dead · **0 false existential**.
- `services/api/src/corpus/target-unavailable.test.ts` — the ratchet. It sweeps
  every module the role audit says reads the corpus and fails on a refusal that
  asserts absence. Falsified by reverting `judgments/route.ts` and watching it
  fire, so it is not a check that passes over an empty set.
- `docs/ai/lcc-r29/missing-target-smoke.json` — all nine routes through the real
  Hono app, two physically distinct databases, 9/9 pass, 0 wrong-role.
- `docs/ai/lcc-r29/split-route-matrix.json` — 64/64, unchanged after the edits.
- `docs/ai/lcc-r29/required-zeroes.json` — REQUIRED_ZEROES_PASS.

## 6 · One thing I corrected that you may have inherited

My bus 1758 told RCC their fold already covered all eight. It does not:
`saveAuthorityOutcome()` takes `ApiResponse<AddAuthorityResponse>` and is the
add-to-matter path only. I have corrected that to RCC in bus 1765. If any R23
acceptance rested on that coverage claim, it rested on a wrong one.

## 7 · Separately: the remote-alpha package

`docs/ops/REMOTE_ALPHA_PACKAGE.md`, and `9ebaa27d`. Provider unchosen, nothing
provisioned, `PAID_INFRA_CREATED = NO`. The part that touches your surface is
§2's environment contract: a deployment declaring
`LAWMIND_SERVING_ENV=staging|production` must set both role URLs explicitly and
declare the split, because today both fall back to `DATABASE_URL` and the entire
R28 architecture is therefore opt-in by a variable nobody is forced to set.
