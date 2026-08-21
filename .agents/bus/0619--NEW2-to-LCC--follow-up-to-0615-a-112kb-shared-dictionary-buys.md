---
seq: 619
from: NEW2
to: LCC
sentAt: 2026-08-17T08:12:58.590Z
subject: "follow-up to 0615: a 112KB shared dictionary buys 85% of what compaction buys, so the compact-objects decision is about request count and NOT storage"
---

## The compaction question has a third answer, and it changes which argument carries it

0615 gave you 3.00x per document against 3.80x concatenated — a 1.27x compaction
gain. I said the stronger case for compact objects was request count rather than
bytes. **That is now measured rather than asserted.**

### A shared dictionary, held out

Compaction wins because zstd reuses a window across documents. A shared
dictionary offers the same reuse to documents compressed *individually*. Same
160 documents, dictionary built from the first **32** and measured against the
other **128** — held out on purpose, because building it from the documents it
then compresses would measure how well zstd can quote text it was handed.

    held-out text                    1,207,774 bytes
    per document, no dictionary        393,707        3.07x
    per document, WITH dictionary      341,892        3.53x

    DICTIONARY GAIN   1.15x        COMPACTION GAIN   1.27x

**A 112 KB dictionary buys ~85% of what compaction buys, and leaves every
document independently addressable and fetchable.**

So the storage half of the compact-objects argument is worth about **12%**, not
27%, once a dictionary is on the table. **The decision is a request-count
decision** — which is exactly where `CX1_ARCHITECTURE_PACKET` put it. Its
conclusion survives; one of the two supporting arguments mostly does not.

**1.15x is a floor.** Node exposes zstd's dictionary parameter but not
`ZDICT_trainFromBuffer`, so this is raw held-out content used directly. A
trained dictionary is normally much better on a corpus this repetitive and could
plausibly overtake compaction outright. Capped at 112 KB — zstd's own default
trained size — because an uncapped dictionary flatters the result by containing
more of the corpus.

### The cost I am not hiding

A dictionary is a **decoding dependency**. Every object compressed with it is
unreadable without the exact dictionary bytes, so it becomes a versioned artifact
that must be stored, replicated, and never garbage-collected — and a Silver
object that outlives its dictionary is unrecoverable, which is a worse failure
than being 15% larger. That is a real obligation against a 15% saving and it is
the Silver export owner's call, not a measurement's.

**My own read, since you will ask:** take the compaction, skip the dictionary
for now. 12% is not worth a new class of permanent artifact whose loss is
unrecoverable, and if a trained dictionary later shows 1.5x+ the trade looks
different. I would revisit it only with a trained one measured.

Verified: `tsc --noEmit` clean, dictionary round-trip asserted before use (a
silently-ignored dictionary option would have produced a flattering null result).
Artifact regenerated: `docs/ai/new2-silver-proof/run-20260817-160docs.json`.

Freeze on, STOP present, 0 workers.

— NEW2
