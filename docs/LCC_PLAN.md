# LCC EXECUTION PLAN — server lane

Working document. Updated as facts change, not as intentions change.

Its job is to stop two failure modes that have both already happened today:
**drifting into whatever is most recently on fire**, and **reasoning from logs
instead of reproducing the failing path**.

---

## 0 · Rules I follow without being asked

**Keep going.** A blocker is a thing to route around, not a thing to report and
stop at. Report *while* continuing, never *instead of* continuing.

**Reproduce before theorising.** Today's model-loading bug cost four wrong
diagnoses — external-data fetching, a per-request timeout, the resolved cache
path, tsx — because each was reasoned from a log line. The one that worked was
running the API's exact import path on the container. **If a fix is a guess, say
so and test it in the same breath.**

**Verify by observation, never by inference.** A green typecheck is not a working
endpoint. A SHA in `/health` is not a deployed build — it is an env var I set by
hand, and it lied to me today. Probe the actual behaviour: does the route return
200, does the field appear, did the row land.

**Three failed attempts at the same thing → stop and state the hypothesis.** Not a
fourth guess.

**Never invent.** No API shape, column, section number or citation from memory.
`SCHEMA_TRUTH.md` for data, `API_CONTRACTS.md` for the seam, `DOMAIN_TRUTH.md` for
law. If it is not in a primary source it does not exist.

### The only things I stop for

Everything else has a way forward. I stop **only** when proceeding would:

- put an unverified citation in front of a user, or show one as confirmed
- silently drop a citation
- send sensitive-class data to a model unpseudonymised, or mix two documents in
  one call
- destroy data that is not reproducible
- take an irreversible or outward-facing action nobody asked for — a spend, a
  public exposure, a force-push

Those are the product, not a workflow preference.

---

## 1 · Where things actually stand

Facts, each observed rather than assumed.

| | |
|---|---|
| Corpus | 38,341 judgments, 1,059 statute sections, 3 statutes |
| Embedding | fp32, in flight — see §2 |
| Precision | q8 rejected: batch 0.976, platform 0.977. fp32 GPU-vs-Railway min 0.999709 |
| ivfflat | **dropped** for the bulk load, not yet rebuilt |
| `judgment_citations` | table live, 300 judgments extracted, ~38,000 to go |
| `overruled_status` | `none` on all 38,341 — nothing has been back-filled yet |
| Tests | 75 server-side |
| Deployed | `a420957` |
| Volume | 50 GB, ~12% used |
| TCP proxy | **open** — must be closed when the embed finishes |

---

## 2 · The ordered work

Each item states its own done-criterion. **Done means observed.**

### A · Finish the corpus embed
Running. ~625,000 chunks at 0.05 s/chunk.
**Done when:** `judgments needing chunks` returns 0 and the chunk count is stable.

### B · Rebuild ivfflat
`lists = rows/1000`, `maintenance_work_mem = 1GB`, then `ANALYZE`.
**Done when:** `EXPLAIN` on the dense query shows `Index Scan using
judgment_chunks_embedding_idx` and no `Seq Scan`.

### C · Tune `probes` by measurement
Current default of 10 is a rule of thumb, not a measurement. Compare against exact
sequential-scan ground truth at probes 1/5/10/20/40/lists.
**Done when:** the cheapest setting reaching ≥95% recall@50 is recorded and set.

### D · Re-verify retrieval, with dense actually on
Every latency number quoted today was lexical-only and is provisional.
**Done when:** paraphrase and Hindi→English both return correct authorities, and
p95 is measured against Gate S1's 3 s with `operativeParagraph` non-empty.

### E · Close the TCP proxy
`railway tcp-proxy delete`. It exposes production Postgres publicly and only ever
existed for the embed.
**Done when:** `tcp-proxy list` is empty.

### F · Citation extraction across the corpus
~9 h at 1.2 judgments/s. Deferred until A completes — they contend for the same
database.
**Done when:** every judgment has rows, and a fresh sample of ≥8 treatment edges
verifies against source text.

### G · Back-fill `overruled_status`
The graph is worthless while every judgment reads `none`. Derive from
`judgment_citations` where `relationship = 'overruled'`, writing
`overruled_status`, `overruled_by_judgment_id` and `overruled_status_changed_at`
in one transaction.
**Done when:** the count is non-zero, spot-checked against source text, and a
`LAW MOVED` render is observed end to end.

### H · The nine feature-parity endpoint groups
Treatment, graph, review, compare, upload-chat, counter-arguments, saved searches,
annotations — all specced in `API_CONTRACTS.md`. Treatment and graph first: RCC is
building 01/02/03 against them.
**Done when:** each returns real data from the corpus, with all three citation
fields and `asOf`, and has a test.

### I · Deploy and re-run the suite on Railway
**Done when:** the suite passes on the container and every new route answers 200
with real data.

---

## 3 · Standing hazards, learned the hard way

| Hazard | Rule |
|---|---|
| `/health` SHA is an env var I set | Probe the **route**, never the SHA |
| PowerShell writes UTF-8 **with BOM** | `[System.IO.File]::WriteAllText` with `UTF8Encoding($false)`, or `scp` |
| PowerShell mojibakes UTF-8 in pipelines | Never put corpus bytes through PowerShell — Node or `scp` |
| transformers.js does not create its cache dir | Fixed in `embed.ts`; never assume a library creates its own paths |
| A rejection can escape `.catch()` | `unhandledRejection` handler is load-bearing, not defensive style |
| ivfflat cannot index a multiplied expression | Two-stage query behind a `MATERIALIZED` fence |
| pnpm auto-installs peers, masking undeclared ones | Three found in `apps/mobile` so far |
| Machine-derived legal relationships | Never ship without a sample verified against source text |

---

## 4 · Not mine, and not blocking

Recorded so I stop re-raising them: the `sfo` vs Singapore region contradiction
(OD-2), rotating the Postgres password exposed in this session, the
`CITATION_HARNESS.md:90` vs `DESIGN_SYSTEM.md:283` copy conflict, the PD-5
saved-search reframe, OD-11 sequencing, and the OD-6 DPA.

Each is flagged where it belongs. **None of them blocks server work**, and I do
not wait on any of them.
