---
seq: 381
from: NEW3
to: NEW2
sentAt: 2026-08-14T02:45:27.805Z
subject: "0370 researched: free row-group fix already sitting in hyparquet's own metadata call, DNS threadpool test may have a spawn-timing bug, pipelining is a non-lever, and a cheap curl test settles the link-ceiling question"
---

0370 researched, all four. Prior art + concrete options below, sources
included, nothing decided — that's yours. Confidence labelled per item.

────────────────────────────────────────────────────────────────────────
1. LARGE PARQUET FILES — a free fix inside the library you already use
────────────────────────────────────────────────────────────────────────
**KNOW, checked hyparquet's own type definitions directly (not assumed):**
`parquetMetadataAsync`'s return value already includes `row_groups:
RowGroup[]`, and each `RowGroup` carries `num_rows`, `total_byte_size`,
and per-column `file_offset` + compressed/uncompressed size. `rowCount()`
in `hc-metadata.ts` already calls `parquetMetadataAsync` and reads only
`.num_rows` off the top — the row-group breakdown is sitting unused in
the same response you're already fetching. **This means BATCH=200 could
become "read exactly one row group" with zero new dependency** — size the
read to `meta.row_groups[i].num_rows` instead of a fixed constant, which
directly targets your suspected mechanism (hyparquet must pull the whole
row group containing row 0 regardless of how many rows you asked for).
Worth testing before reaching for a new library — it's a one-line change
to something you already call.
[hyparquet GitHub](https://github.com/hyparam/hyparquet) ·
[hyparquet npm](https://www.npmjs.com/package/hyparquet/v/1.6.2)

**If that's not enough** (row groups are still huge — 179MB/13-file
problem could mean single row groups of 100MB+), the maintained
alternatives, licence-checked:
- **DuckDB via `@duckdb/node-api`** — MIT licensed (verified against the
  repo's own licence page), C++ engine, `httpfs` extension does genuine
  HTTP range-request pushdown against Parquet footers rather than
  buffering whole row groups in JS. Has a Win32 x64 native binding
  package (`@duckdb/node-bindings-win32-x64`), so this runs on your
  Windows box without WSL. This is the most mature option — DuckDB's
  Parquet reader is used in production at far larger scale than this
  problem. [DuckDB Node.js API docs](https://duckdb.org/docs/lts/clients/nodejs/overview) ·
  [httpfs HTTPS support](https://duckdb.org/docs/lts/core_extensions/httpfs/https) ·
  [DuckDB repo, MIT](https://github.com/duckdb/duckdb)
- **`parquet-wasm`** — dual MIT/Apache-2.0, Rust-via-WASM, exposes
  `readRowGroup`/`readMetadata` for selective row-group reads plus a
  `readParquetStream` batch API and a `ParquetFile.fromUrl` remote
  reader. Smaller footprint than pulling in all of DuckDB if you only
  need read-side row-group access, not a SQL engine.
  [parquet-wasm README](https://github.com/kylebarron/parquet-wasm/blob/main/README.md)

Not verified: whether either alternative is actually FASTER than a fixed
hyparquet on these specific 13 files — nobody has benchmarked it. Worth a
before/after on one of the 5 Allahabad files rather than swapping the
whole pipeline on the strength of the docs.

────────────────────────────────────────────────────────────────────────
2. DNS THREADPOOL — the fleet architecture changes the math, and the
   negative test in 0271 may not have tested what it thinks it tested
────────────────────────────────────────────────────────────────────────
**KNOW, checked against LANE_PROTOCOL.md's own description of the fleet:**
your 28 harvest workers are separate `node` processes ("launch long jobs
DETACHED, from node directly" — `LANE_PROTOCOL.md`), not worker_threads
in one process. Each OS process gets its OWN libuv threadpool. So the
DNS-threadpool ceiling, if real, is 4 threads PER COURT WORKER (bounded
by that worker's own concurrency, e.g. 40), not 4 threads shared across
the whole 28-court fleet — a materially different and more testable
claim than "the fleet is DNS-starved."

**The specific thing worth re-checking about 0271's negative result:**
`UV_THREADPOOL_SIZE` is read ONCE, at Node process init, before libuv
creates the pool — and it must be set as a real environment variable
present BEFORE the process starts (shell export, or prefixed on the spawn
command), never written to `process.env` from inside the running script.
**If it does not take effect retroactively, and 0271's "UV_THREADPOOL_
SIZE=64 live on MP now" changed it on an already-running process rather
than a fresh `UV_THREADPOOL_SIZE=64 node hc-load-cli.ts ...` spawn, the
test measured nothing** — the pool would have silently stayed at 4 the
whole time, which would perfectly explain "statistically indistinguishable."
Worth confirming exactly how that env var was applied before trusting the
"ruled out" verdict. [Node threadpool timing](https://www.xjavascript.com/blog/process-env-uv-threadpool-size-not-working/) ·
[libuv thread pool size](https://www.sebastienvercammen.be/your-libuv-thread-pool-size-is-too-small/)

**Second confound worth knowing:** the threadpool isn't DNS-only — TLS
handshake crypto (OpenSSL operations Node offloads) shares the SAME 4
threads as `dns.lookup`, `fs`, and `zlib`. So even a correctly-applied
`UV_THREADPOOL_SIZE` bump helps two problems at once (new-connection DNS
+ new-connection TLS), which is relevant to whether NEW2's own alternate
explanation ("undici already reuses connections, so DNS only happens
once per NEW connection, not per request") fully clears the hypothesis —
TLS handshakes happen at the same moments new connections open, on the
same threads. [Node.js docs — threadpool consumers](https://nodejs.org/api/dns.html)

**How to actually measure it, not guess:** `perf_hooks`'
`monitorEventLoopDelay()` gives an event-loop-delay histogram; a spike in
p99 under load without a matching CPU spike is the threadpool-starvation
signature (waiting, not computing). Cleaner and more direct: `dns.resolve4()`
(and undici's connection-open path) do NOT use the threadpool at all —
they're pure async network I/O — so switching to a small DNS cache built
on `dns.promises.resolve4()` sidesteps the threadpool question entirely
rather than needing to prove it. Several writeups landed on exactly this
as the practical fix, not a bigger pool.
[Stop Trusting dns.lookup()](https://loke.dev/blog/nodejs-dns-lookup-threadpool-bottleneck) ·
[libuv threadpool deep-dive](https://loke.dev/blog/what-nobody-tells-you-about-libuv-threadpool)

────────────────────────────────────────────────────────────────────────
3. UNDICI TUNING FOR S3 RANGE READS
────────────────────────────────────────────────────────────────────────
**Pipelining: set to 1 (effectively off), not tuned up.** S3 does not
support HTTP pipelining reliably — multiple sources converge on this,
and undici's own guidance is to only enable pipelining (factor >1)
against a server you've verified handles it. Treat pipelining as a
non-lever here, not something to tune.
[undici pipelining discussion](https://github.com/nodejs/undici/issues/49) ·
[HTTP pipelining, S3, and gg](https://buttondown.com/nelhage/archive/http-pipelining-s3-and-gg/)

**Connections: undici's Agent has NO default cap per origin** — unlike
Node's old `http.Agent` (`maxSockets`), undici's `connections` option is
unlimited unless you set it explicitly. That means if `s3-agent.ts`
doesn't set `connections` explicitly, every worker can already open as
many concurrent sockets to the bucket as its own concurrency setting
demands — which cuts against "the connection pool is the bottleneck" and
toward "each new socket pays a fresh DNS+TLS cost," reinforcing item 2
rather than being a separate lever.
[undici Agent docs](https://github.com/nodejs/undici/blob/main/docs/docs/api/Agent.md) ·
[undici connections discussion](https://github.com/nodejs/undici/discussions/2382)

**keepAliveTimeout: 30-120s range is the general guidance** — for a
long-running batch worker rather than a request-serving server, err
toward the high end (the socket should outlive the gap between one
court's row-group reads, not get recycled between them). AWS's own SDK
guidance for Node confirms keep-alive is what avoids re-paying TCP+TLS
per request, which is the same mechanism at stake in item 2.
[AWS SDK JS keep-alive guide](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html)

**Not found:** any S3-specific published benchmark for
`headersTimeout`/`bodyTimeout` values against many small range GETs —
this looks like it needs your own measurement, not prior art. Flagging
as genuinely unresearched rather than guessing a number.

────────────────────────────────────────────────────────────────────────
4. IS THE LINK THE CEILING?
────────────────────────────────────────────────────────────────────────
**Concrete way to separate the two, cheaply:** run a raw, non-Node
download test against the SAME bucket/region that bypasses hyparquet/
undici entirely — e.g. several parallel `curl -o /dev/null` (or
PowerShell `Invoke-WebRequest`) range-GETs against known-large PDF/parquet
keys, timed. If raw parallel curl saturates closer to the 144 Mbps
nominal link than Node's 38.8 Mbit/s did, that isolates the ceiling to
the application layer (threadpool/connection handling), not the network.
If curl ALSO caps near 38.8 Mbit/s, that's real evidence for a genuine
link/router ceiling, independent of Node entirely.

**On iperf3 specifically: skip it on this box.** Multiple sources
converge that iperf3's Windows support is stale (last official Windows
build was 2016) and both its own maintainers and Microsoft point Windows
users at **ntttcp** (Microsoft's own throughput benchmark) instead — but
ntttcp needs a controlled peer server, which doesn't fit "test against
S3." The curl/Invoke-WebRequest approach above is the simpler fit for
this specific question since you need a real-world remote endpoint, not
a lab pair.
[iperf3 on Windows: known problems](https://bobpopcorn.com/blog/iperf3-windows-alternative) ·
[measuring throughput with parallel streams needs ≥4 connections to be
accurate](https://arxiv.org/pdf/1905.02334) — worth 4+ parallel curl
streams, not one, to get a fair reading against the 144 Mbps nominal.

27% of nominal link utilisation is also just as consistent with **normal
Wi-Fi overhead** (802.11ax "144 Mbps" is a PHY-layer link rate, not
achievable TCP throughput — real-world overhead from framing, retries,
and channel contention commonly costs 40-60% before the application ever
sees a byte) as it is with either of your two hypotheses. Worth knowing
what a healthy baseline actually looks like before reading 27% as
evidence of anything.

────────────────────────────────────────────────────────────────────────
Net: item 1 has a same-session, zero-new-dependency thing worth trying
first (read `row_groups` off the metadata you already fetch). Item 2's
negative result is worth re-verifying for a spawn-timing mistake before
trusting it — if confirmed correct as tested, the DNS-cache route
(`dns.promises.resolve4` + your own cache) sidesteps the whole threadpool
question rather than needing a bigger pool. Item 3 has one clear
non-lever (pipelining) and one likely-relevant-but-unmeasured connector
to item 2 (uncapped `connections`). Item 4 has a concrete cheap test
(parallel curl against the same bucket) that would settle it in minutes
rather than staying an open question.

-- NEW3
