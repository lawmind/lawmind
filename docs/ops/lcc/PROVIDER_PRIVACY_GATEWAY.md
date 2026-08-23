# PROVIDER PRIVACY GATEWAY — every path that can send content to a model vendor

**LCC, 23 August 2026.** Inventory, policy, and the one gap this round did not
close. Implementation: `services/api/src/llm/provider-policy.ts`, wired into
`services/api/src/llm/call.ts`, 10/10 tests in `provider-policy.test.ts`.

---

## 1. What was actually wrong

`route.ts` decides **which MODEL** by data sensitivity, and it is correct —
`CLAUDE.md` §5, sensitive traffic refused entirely until the DPA lands (OD-6).

**Nothing decided which COMPANY'S SERVER.** `call.ts` chose between inferx.net,
OpenRouter and Anthropic by **whichever API key happened to be set in the
environment**:

```
const key = inferx ? inferxKey
          : openRouter ? (deps.openRouterKey ?? process.env['OPENROUTER_API_KEY'])
          : (deps.anthropicKey ?? process.env['ANTHROPIC_API_KEY']);
```

A deployment variable was making a confidentiality decision. It has leaked
nothing, because the sensitive path is refused twice over — no countersigned
DPA, and no pseudonymiser exists — but the SHAPE is the kind that is discovered
late: the day the DPA is signed and the pseudonymiser lands, the provider is
still selected by `INFERX_API_KEY ?? OPENROUTER_API_KEY ?? ANTHROPIC_API_KEY`.

---

## 2. The inventory — every provider egress in the repository

Found with `grep -rl "openrouter.ai\|api.anthropic.com\|inferx"` over
`services/`, `packages/`, `apps/`, excluding `node_modules`.

| # | Module | Sends | Class today | Behind the gate? |
| --- | --- | --- | --- | --- |
| 1 | `services/api/src/llm/call.ts` | prompts from `hyde.ts`, counter-arguments, drafting | PUBLIC_LEGAL_TEXT / PUBLIC_QUERY | **YES — as of this round** |
| 2 | `services/ingest/src/inferx.ts` | adjudication prompts over judgments | PUBLIC_LEGAL_TEXT | **NO** |
| 3 | `services/ingest/src/openrouter.ts` | same | PUBLIC_LEGAL_TEXT | **NO** |
| 4 | `services/harness/src/generate.ts` | generated benchmark queries | PUBLIC_LEGAL_TEXT | **NO** |

Callers of 2/3: `concordance-adjudicate-cli.ts`, `concordance-gold-cli.ts`,
`enrich-cli.ts`, `hc-adjudicate-cli.ts`.

**The honest statement about 2–4: all three are corpus-only today, so nothing
private is exposed by their being outside the gate. What is missing is the
STRUCTURE that would stop a private payload being added to one of them later.**
They are `services/ingest` and `services/harness`, which are NEW2's and NEW1's
lanes; the finding is sent rather than edited (bus).

`route.ts` already documented a live instance of exactly this drift: the
concordance pass writes `llm_calls` directly rather than routing through
`routeCall`, and survived unnoticed because it broke nothing.

---

## 3. The policy contract

`canSendToProvider(payloadClass, provider)` — one function, asked before any
bytes are sent, after the key is resolved (the key is what determines the
provider) and before the fetch.

### Payload classes

| class | meaning | maps to `DataClass` |
| --- | --- | --- |
| `PUBLIC_LEGAL_TEXT` | a judgment, a statute, published law | `public` |
| `PUBLIC_QUERY` | **what the advocate typed** | `sensitive` |
| `PRIVATE_MATTER_METADATA` | matter titles, courts, dates, party names | `sensitive` |
| `PRIVATE_CLIENT_FACTS` | notes, instructions, the advocate's own account | `sensitive` |
| `PRIVATE_DOCUMENT` | an uploaded document or any extract | `sensitive` |
| `OTHER` | unclassified | `sensitive` |

**`PUBLIC_QUERY` is private in substance.** "anticipatory bail twin conditions
for a co-accused in a 2024 NDPS matter" describes a client's position. It keeps
the wire-compatible name and gets the private-class treatment.

**A judgment is not private and refusing it protects nothing** — Copyright Act
s. 52(1)(q)(iv), and it is on the court's own website. Refusing published law to
protect it would stop search working in exchange for nothing.

### The provider table, with the eight required fields

| field | inferx | openrouter | anthropic |
| --- | --- | --- | --- |
| permits | PUBLIC_LEGAL_TEXT | PUBLIC_LEGAL_TEXT | PUBLIC_LEGAL_TEXT |
| retention | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** (pending DPA) |
| training use | **UNVERIFIED** | **UNVERIFIED** — and it is a ROUTING layer, so two terms to read | **UNVERIFIED** (pending DPA) |
| contract status | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| redaction | required for any private class | same | same |
| logging | `llm_calls`: provider, model, feature, data_class, tokens, cost, latency. **Never the prompt.** | same | same |
| fallback | OpenRouter, or refuse | refuse — no silent downgrade | **refuse; never fall back to a cheaper provider** |
| data classes | public only | public only | public only |

**`UNVERIFIED` is the module working, not a gap in it.** `CLAUDE.md` forbids
inventing a contract term as firmly as a section number, and a confidently wrong
"30 days, no training" in a policy file is worse than a blank — it is the
sentence somebody quotes to a client. An unverified provider receives public law
and nothing else.

**Anthropic permits only public text too, and that is deliberate.** §5 names
Claude as the destination for sensitive traffic *after pseudonymisation and
under written data-processing terms*. OD-6 says the DPA is owed and the refusal
has no founder override. When it is countersigned, this changes in ONE place:
status to `RECORDED`, the real terms written in, and the private classes added to
`permits`. `policyIncoherences()` makes those inseparable — a private class with
an unrecorded contract status fails the test.

### Answer to the round's question

> If no approved private-data provider exists: private premium generation must
> refuse safely or use an approved local path.

**No approved private-data provider exists today. Private premium generation
refuses.** `SPEC_V1` §7 reaches the same conclusion from the product side. It is
not weakened to make the 10-matter walkthrough pass; the walkthrough uses
synthetic seeded data, per the founder's own instruction.

---

## 4. Proved, not asserted

`provider-policy.test.ts`, 10/10:

- every provider accepts published law
- **no** provider accepts any private class, and each refusal names the
  unrecorded term
- the coarse `DataClass` entry point maps `sensitive` to the STRICT private
  class, not a lenient one
- an unknown provider is refused rather than defaulted
- **a private payload makes ZERO outbound requests** — driven through
  `callModel` with a counting fetch, so the assertion is that the network was
  never touched, not that a refusal came back afterwards
- the refusal holds even when `dataClass: 'public'` is passed and the fine class
  is private, i.e. the lenient coarse class cannot override the strict fine one

---

## 5. Not done

- **Items 2–4 of the inventory are outside the gate.** Corpus-only today; the
  structural fix belongs in NEW2's and NEW1's lanes and is sent, not edited.
- **No pseudonymiser exists.** `call.ts` refuses rather than sending raw
  sensitive text with `pseudonymised = true` in the ledger. `docs/PRIVACY_PII.md`
  owns it.
- **Retention and training-use terms are unread for all three providers.**
  That is a founder/counsel item, filed as `FQ-PROVIDER-TERMS`.
