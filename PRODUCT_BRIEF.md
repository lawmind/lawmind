# LAWMIND — PRODUCT BRIEF

**Read this before any session. It is the north star. If something you are about
to build does not serve one of the four features below, stop and ask.**

Helmor Pvt Ltd · lawmind.co · `co.lawmind.app` · Product #1 in ship order

---

## In one line

An AI research and drafting assistant for practising advocates in India, on their
phone, in English and Hindi — where every citation is verified before they see it.

---

## Who uses it

A practising advocate. Criminal and civil litigation. District courts and High
Courts. Mostly solo or in a chamber of two to five.

Not technical. Works on a mid-range Android phone. Often works in Hindi. Reads in
daylight, in court corridors, on bad connectivity. Frequently over fifty. Carries
a physical file and will keep doing so.

**Pays for themselves.** This is not an enterprise procurement sale. The senior
advocate who decides is also the most sceptical of AI, which is why the product
has to read as a professional instrument rather than a startup toy.

---

## The problem

Preparing one hearing costs two to four hours: hunting judgments in reporters or
clunky databases, re-reading the case file to remember what happened last time,
drafting from Word templates. Nothing they use was built for a phone and almost
nothing speaks Hindi properly.

---

## The four features, in priority order

**1 · Court decision search with verified citations.** Plain-language or Hindi
query. Five judgments with title, citation, court, date, a two-sentence holding
and the operative paragraph. Every citation verified before render.

**2 · The 24-hour hearing briefing — the wedge.** The night before a listed
hearing: where the matter stands, what is pending, authorities on the live issue,
a preparation checklist. Delivered by push, readable offline, skimmable in ninety
seconds standing in a corridor. **No competitor in India has this.**

**3 · Drafting in English and Hindi.** Ten document types. Structured input →
court-format draft → paragraph-level edit → export to Word or PDF. **The exported
document carries no mark** — consent is taken once at onboarding (PD-8), and a
watermark on a court filing is both patronising and a competitive disadvantage.

**4 · The matter workspace — the moat.** Per-case history: drafts, research,
briefings, notes, hearing timeline. Six months of an advocate's accumulated work
is what stops them leaving.

---

## The one rule above all others

**No citation reaches a user without verification.**

An advocate who files a document citing a case that does not exist is humiliated
in open court, never returns, and tells their bar association. A single occurrence
is an extinction event for a product whose entire proposition is trustworthy
citations. This is not hypothetical — an ITAT order in late 2024 cited four
non-existent judgments and was recalled within a week.

The model never emits a citation from memory. It references only judgment IDs
handed to it in retrieved context, the server resolves every ID, and every
rendered field comes from the database row rather than from model output.

A citation no tier can confirm is shown in an explicit **unverified** state. Never
silently dropped. Never shown as confirmed. Silent-drop rate is a tracked metric
with a zero threshold.

Full spec: `docs/CITATION_HARNESS.md`. Binding.

---

## Position — one line

**The only tool that turns tomorrow's listing into a prepared advocate — with
citations that survive a misconduct challenge.**

Not the biggest database. Not the cheapest chatbot. The daily working instrument.

Three facts govern this, in full at `docs/COMPETITIVE.md`:

1. **Raw judgments are commoditised.** e-SCR is free, fast and carries neutral
   citations. **Never position on corpus size** — we lose to a government service
   that costs nothing. The corpus is table stakes, not the product.
2. **Everyone sells a database. Nobody sells a workflow.** Firms run ₹15-lakh
   subscriptions as glorified citation lookup because nobody trained the juniors.
   *The tool isn't the bottleneck. The workflow is.*
3. **Verification is compliance now, not a feature.** India in 2026 has a Supreme
   Court misconduct standard for unverified citations. **The mark is a shield, not
   a warning** — not "we're checking on you", but "you're covered". Every piece of
   verification copy is written from that framing.

We sit **inside an existing budget line**: a solo already spends ₹30,000–50,000 a
year on research. Expert at ₹3,499 is a **switch, not a new spend**.

## What makes it defensible

**The 24-hour briefing.** Harvey has no eCourts integration. SupremeToday.AI has
no live case monitoring. Provakil tracks cases but generates no briefing.

**Verification depth.** Three tiers plus an honest unverified state. Competitors
are generic model wrappers that hallucinate citations.

**BNS / BNSS / BSA 2024.** The three new criminal codes replaced IPC, CrPC and the
Evidence Act on 1 July 2024. No frontier model was trained on them. Every
competitor answers with the old sections.

**The matter workspace.** Accumulated work is switching cost no feature can undo.

**Hindi at genuine parity.** Not a translated UI — legal Hindi in correct register.

---

## What we are not

Not a legal advice service. It assists licensed practitioners; it does not advise
the public. Never phrase output as advice to an end client. Never claim to be a
lawyer. This keeps us outside Bar Council scope and unauthorised-practice
exposure.

Not a word processor. Paragraph-level editing only, citations locked. Word wins
that fight.

Not a replacement for the physical file. We are the preparation layer.

Not enterprise software. Priced for individuals: ₹799 · ₹1,999 · ₹3,499.

---

## Design in one paragraph

Paper and ink, not dashboard. It should read as a well-made legal instrument —
authoritative, quiet, unfashionable the way a good court document is
unfashionable. One accent, oxblood, at most twice per screen. Gilt is ornament in
two places only and never carries information. Everything quiet, one moment of
theatre: the briefing seal stamping when tomorrow's brief is ready.

Glass on floating chrome, never on content. A judgment or a draft is read in
sunlight and filed in court — it stays opaque.

---

## Hard constraints — non-negotiable

Offline is a hard requirement. Court buildings have terrible connectivity.

Devanagari renders in Noto Sans / Noto Serif Devanagari everywhere including PDF
export. A missing-glyph box in a court filing is a product failure.

Sensitive-class data — uploaded documents, matter notes, names of accused
persons, witnesses or minors — is pseudonymised before any model call and goes
only to a provider with written data-processing terms. Those people are not our
users and consented to nothing.

Never claim complete PII removal. Coverage is partial. Say so.

OCR output is never trusted silently. The advocate confirms extracted fields
before anything saves.

Never train on another model's commentary about law. Primary sources only.

Overruled status is read live at render, never cached. Law moves under a saved
citation.

---

## Where it runs

Expo iOS + Android. Hono API on Railway. Railway Postgres with pgvector. Drizzle.
better-auth. Postmark. Cloudflare R2. OpenRouter. Sentry. PostHog. Expo push.
Admin is a separate Railway service; web is admin only.

Not used: Neon, Vercel, Qdrant, Clerk, Supabase.

---

## Success at day 90

₹1L+ MRR. Ten paying advocates. Fifteen of twenty beta users opening the app three
or more times in their final beta week. **Zero citation failures reaching a user.**

---

## The build

Four disjoint agent lanes in parallel within a sprint, hard gate, then advance.
Two lanes: **LCC — Server** (db, API, ingest, retrieval, verification, cron,
OCR) · **RCC — Client** (Expo app, admin web, auth integration).

S0 scaffold · S1 corpus · **S2 citation gate — hard stop** · S3 briefing ·
S4 drafting · S5 auth+billing · S6 admin+monitoring · S7 store + 20 beta advocates.

Gate S2 is the hard stop. If verification is not clean, nothing downstream
matters. Do not proceed to keep momentum.
