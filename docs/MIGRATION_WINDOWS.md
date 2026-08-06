# MIGRATION — macOS → Windows

Written 5 August 2026, on the Mac, as the last act before the move. Everything
below was verified on that machine, not recalled.

> ## MIGRATION COMPLETE — 6 August 2026
>
> **This file is now history.** It is kept for its reasoning, not its numbers.
> Several of those numbers were superseded within hours of the move and are
> corrected here rather than edited in place, so the record of what was believed
> at the time survives.
>
> | Said here | Actually |
> |---|---|
> | RTX 4070 Ti | **RTX 4060 Ti, 8 GB** |
> | 38,342 judgments | **38,341** — the asset table below was right, the Done section was not |
> | 1,624 chunks embedded | **6,113** — a Railway CPU job kept running after the doc was written |
> | ~383,000 chunks total | **~623,000**, measured from real text lengths |
> | Embed "well under an hour" | **~10 hours** on this GPU at 0.05 s/chunk |
> | "delete the chunks or measure fp16-vs-q8 agreement" | Both were too narrow — see below |
>
> **The q8 trap was worse than described.** This file frames it as a precision
> mismatch between fp16 and q8. The real problem is that q8 is *dynamic*
> quantisation: a chunk's vector depends on which chunks shared its batch **and
> on which CPU computed it**. Measured on 48 real chunks — batch effect 0.976,
> platform effect 0.977. No batching discipline could have fixed it. The corpus
> and the query path are now **fp32**, which is bit-exact across batches, holds
> 0.999709 minimum GPU-vs-Railway, and is *faster* at inference on CPU than fp16
> because CPUs have no native fp16 arithmetic.
>
> **Current state lives in `docs/LCC_PLAN.md`**, not here.

**Why:** the Mac sat at 96% disk (9.8 GiB free) and that constraint repeatedly
cost real work — it killed an ingest run mid-flight, killed three CoreML probes,
and forced local Postgres to be retired entirely. The Windows box has ~2 TB free
and an **RTX 4070 Ti**, which turns the corpus embed from a 15-day Railway job
into roughly half an hour.

---

## Nothing is trapped on the Mac

Verified before writing this. Do not spend time hunting for files.

| Asset | Lives in | Action |
|---|---|---|
| Lawmind repo | `github.com/lawmind/lawmind`, clean, in sync | `git clone` — 44 MB |
| Marketing site (`website/`, 395 MB) | `github.com/lawmind/lawmind-site`, clean, in sync | `git clone` separately |
| Corpus — 38,341 judgments, 1,059 statute sections | **Railway Postgres** (production) | nothing to move |
| Live API | Railway, `api-production-1c0b4.up.railway.app` | nothing to move |
| Design bundles (`*.zip`, 165 MB) | local only, gitignored | **optional** — extracted content is already tracked under `design/` |
| Claude session history (83 MB) | `~/.claude/projects/-Users-x-Documents-Lawmind` | **optional**, see below |

**Carry on the pen drive only:** the `*.zip` design bundles if you want the
originals, and the Claude history if you want conversation continuity. Both are
optional. **Do not copy `node_modules`, `.models`, or any Postgres data** — all
are regenerated or already on Railway.

---

## Install on Windows

| Tool | Version | Why that version |
|---|---|---|
| Git | latest | |
| **Node** | **22.23.0** | matches `.nvmrc`; other majors are untested here |
| pnpm | 11.x | `packageManager` field pins `pnpm@11.5.2` |
| GitHub CLI | latest | CI checks, PRs |
| Railway CLI | latest | **the whole server workflow runs through this** |
| **JDK 17** | **17, not 26** | JDK 26 breaks the Android Gradle Plugin at `JdkImageTransform`. This was hit for real; AGP wants 17. |
| Android platform-tools | latest | real-device testing over USB |
| Python | 3.11+ | GPU embed |
| CUDA PyTorch | cu121+ | GPU embed |

### Git and Windows setup — do this before cloning

```powershell
git config --global core.autocrlf false   # repo is LF-authored; true causes whole-tree churn
git config --system core.longpaths true   # pnpm nests past the 260-char limit
```

Also enable **Win32 long paths** in Group Policy or the registry
(`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`).
Git's setting alone is not enough — pnpm's store will exceed 260 characters.

### Clone and authenticate

```powershell
git clone https://github.com/lawmind/lawmind.git
git clone https://github.com/lawmind/lawmind-site.git
cd lawmind
pnpm install --frozen-lockfile --filter "!./apps/*"
gh auth login
railway login
railway link                              # project: lawmind
```

### Railway SSH — generate a NEW key, do not copy the Mac one

Railway registers any given public key **once per account**. Copying the Mac key
will be rejected — that exact failure happened during setup.

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\lawmind_railway -N '""'
railway ssh keys add --key $env:USERPROFILE\.ssh\lawmind_railway.pub --name lawmind-win
railway ssh --service api --environment production "node -v"   # smoke test
```

### Claude history (optional)

Copy `~/.claude/projects/-Users-x-Documents-Lawmind` to
`%USERPROFILE%\.claude\projects\`. **The folder name encodes the project path**,
so rename it to match the Windows location, e.g.
`C--Users-you-Documents-Lawmind`.

---

## Verify the migration worked

```powershell
pnpm lint
pnpm format
pnpm --filter "./services/*" --filter "./packages/*" typecheck
railway ssh --service api --environment production "cd /app && pnpm --filter './services/*' --filter './packages/*' test"
curl https://api-production-1c0b4.up.railway.app/health
```

The server test suite **runs on Railway, not locally** — there is no local
Postgres by design. All 56 tests passed there on the Mac before the move.

---

## Where the project actually stands

**HEAD at migration: `1956a8d`**, in sync with `origin/main`. Working tree clean.

### Done
- **Corpus complete.** 38,342 of 38,351 distinct Supreme Court judgments,
  1950–2026, on Railway. The 9 absent are source defects (6 × HTTP 404, 3 ×
  corrupt PDF), each checked individually. **Note: the published metadata has
  43,532 rows but only 38,351 distinct judgments** — the same judgment is listed
  under two adjacent year partitions. Auditing against 43,532 concludes 5,190 are
  missing; they are duplicates. `docs/DATASETS.md` records this.
- **BNS 358 · BNSS 531 · BSA 170 sections**, complete, from indiacode.
- `POST /search` (hybrid, RRF-fused), `GET /statutes`, `/statutes/sections`,
  `GET /health` — all live on production.
- Gate S1 latency **passes**: p95 428 ms on the production instance, 3 s threshold.
- Client: search, judgment reading view, bare acts reader, the inverted-trust UI,
  and the full motion/UI overhaul from three audits.

### Not done, and why
- **Embeddings: 1,624 chunks of ~383,000 (0.4%).** This is the last S1 item and
  the reason for the move. Retrieval is currently **lexical-only** — it works well
  on legal terms of art but cannot do paraphrase or Hindi-query-to-English-judgment
  matching, which the Hindi parity promise needs.
- **Gate S0 item 8 (iOS)** — never built or run. Needs Xcode. Deferred to S7;
  EAS Build can compile iOS in the cloud when that time comes.
- **Gate S1 60fps floor** — emulator numbers were on a software GPU and are not
  evidence. Needs the real Android phone, which the founder has.

---

## The GPU embed — first job on the new machine

**Read this before writing any embedding code.**

The 1,624 chunks already in Railway were embedded with **transformers.js q8 ONNX**
(`Xenova/bge-m3`). Query-time embedding uses the same q8 path
(`services/embed/src/embed.ts`).

**Cosine similarity between vectors produced at different precisions is not
meaningful.** If the corpus is embedded in fp16 on the GPU while queries stay q8,
search degrades silently — no error, just quietly worse results. This is the one
trap that matters.

Two acceptable resolutions, pick one deliberately:

1. **Measure first.** Embed a sample in fp16, compute cosine agreement against the
   q8 vector for identical text. If ≥ 0.999, the mix is safe and the q8 query path
   stays. If not, query-time embedding must move to the same precision.
2. **Make it uniform.** Delete the 1,624 existing chunks, embed the whole corpus
   in one precision on the GPU, and serve queries from a matching path.

Either way: **delete the existing chunks before a full run** unless you have
measured the agreement. `judgment_chunks` has a unique index on
`(judgment_id, chunk_index)`, and the embed CLI selects judgments with no chunks,
so a partial mixed index is easy to create accidentally.

Facts to build on:
- BGE-M3 dense is **CLS pooling then L2 normalisation**, 1024 dims, verified
  against the model's own config. `judgment_chunks.embedding` is `vector(1024)`.
- The chunker orders **recent-first** (`services/embed/src/cli.ts`) — advocates
  cite recent law, and the 1950s scans are the most OCR-damaged text in the corpus.
- Measured rates for comparison: laptop CPU q8 **0.70 s/chunk**, Railway shared
  vCPU **3.3–3.9 s/chunk**.
- The **ivfflat index was built on an empty table** and must be rebuilt after the
  corpus is embedded, or recall will be poor.
- `SPRINT_1.md` says to validate chunking on a sample before a full run. Do that —
  on the GPU a re-run is 30 minutes, but it is still worth not wasting.

---

## Open decisions — none of these are the agents' to make

1. **Tier A vs Tier B sequencing.** `PRODUCT_BRIEF.md` says the daily loop ships
   before the research library; the sprint plan builds the library first. The brief
   states these cannot both be followed and that **no lane may settle it by
   building**. Six daily-loop screens have been designed and are ready
   (`7sc.zip`). Until this is decided, RCC has little legitimate work.
2. **`inkFaint` `#8A8578` fails WCAG AA** at **3.53:1** on paper — independently
   verified twice. It is the colour of **citations, dates and CNR numbers**, for
   users frequently over fifty, read in daylight. Passing candidates that keep the
   warm-grey character: `#767065` (4.71:1), `#726C61` (4.99:1), `#6F6A5E` (5.16:1).
   This is a `design/DESIGN_SYSTEM.md` token — founder's call.
3. **IPC↔BNS mapping.** `statute_mappings` is empty and stays empty.
   `DOMAIN_TRUTH.md` says it is seeded from indiacode, but indiacode publishes both
   statutes and **no correspondence table between them** — verified against the
   site. The mapping must never be model-generated and is not always 1:1. Needs an
   official MHA comparative table, or advocate-seeded rows with per-row provenance.

---

## Standing rules that survive the move

These are settled. Violating one is a correctness failure, not a taste question.

- **Verified is silent.** No badge on a verified citation. Only `unverified` and
  `overruled` render. `failed` renders exactly as `unverified`.
- **Amber `#B4690E` means the law has moved, and nothing else.** Never loading,
  never errors, never our own confidence. A design bundle was corrected for using
  it on unpaid fees.
- **`overruled_status` is never cached** — read live at render on every surface.
- **Never bypass the eCourts CAPTCHA.** The advocate solves it; cache forever.
- **Glass never behind content.**
- **Devanagari never gets negative tracking** (breaks conjuncts); line-height ≥ 1.65.
- **No hex outside `apps/mobile/src/theme/tokens.ts`** — there is a check script.
- **One document per model call**, pseudonymise sensitive class first.
- **Primary sources only.** Never train on a model's commentary about law.
- **Two lanes: LCC = server, RCC = client. Write only inside yours.**
