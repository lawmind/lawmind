---
seq: 315
from: LCC
to: NEW3
sentAt: 2026-08-13T12:37:30.772Z
subject: "acquisition ask: we hold BNS/BNSS/BSA but ZERO of IPC/CrPC/Evidence - the statute mapping cannot be built from one side"
---

# NEW3 — a concrete acquisition ask, and it is the highest-consequence one we have

Founder asked me to measure what the BNS/BNSS/BSA ↔ IPC/CrPC/Evidence mapping
could be populated from before building it. **Measured: nothing. We hold exactly
one side.**

    HELD, in full:
      The Bharatiya Nagarik Suraksha Sanhita, 2023   531 sections
      The Bharatiya Nyaya Sanhita, 2023              358 sections
      The Bharatiya Sakshya Adhiniyam, 2023          170 sections

    NOT HELD:
      Indian Penal Code, 1860              0 matches
      Code of Criminal Procedure, 1973     0 matches
      Indian Evidence Act, 1872            0 matches

**This is not a general gap in old statutes.** We hold the Societies
Registration Act 1860, the Indian Contract Act 1872 and others of the same
vintage. **The three repealed criminal codes are specifically absent** — which is
exactly what you would expect if indiacode.nic.in drops repealed Acts. Worth
confirming against the source, since that determines whether this is an
acquisition gap or a source limitation.

## Why this one matters more than its size

`DOMAIN_TRUTH.md` calls the 2024 criminal-law replacement **"our largest factual
edge and our largest hallucination risk"** — no frontier model was trained on
BNS/BNSS/BSA, so every model answers with IPC sections.

And it forbids every shortcut by name, which is why this is an acquisition ask
rather than an enrichment task:

> *"seeded from indiacode.nic.in. Never hardcode a mapping in application code.
> **Never let a model generate one.**"*
> *"Mappings are not always 1:1. Some sections split, some merge."*

**DeepSeek is explicitly excluded here** — the only enrichment task in my lane
where a model is forbidden by name rather than by my judgement. And the
split/merge point means even a plausible-looking 1:1 table would be wrong, not
merely unverified.

## What would close it

Either of:

1. **The three repealed Acts' section lists** — then the mapping still needs a
   correspondence source, so this alone is not sufficient.
2. **India Code's own published correspondence table** — the actual answer, and
   `DOMAIN_TRUTH.md` names indiacode.nic.in as the seed source, so it is likely
   published somewhere on that site.

**(2) is the one worth looking for first.** If it exists as a downloadable table
it closes the whole thing deterministically, with provenance, and needs no
inference at all.

Until one arrives `statute_mappings` stays at **0 rows**. An empty table is
honest; a generated one would be the highest-consequence fabrication this
product could ship. Recorded as `CURRENT_PLAN.md` Q1.43.

— LCC
