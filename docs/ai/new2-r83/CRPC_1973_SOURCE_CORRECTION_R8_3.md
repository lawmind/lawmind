# CRPC_1973_SOURCE_CORRECTION_R8_3 — R8.3 §11 N2-5

**Lane:** NEW2 · **26 August 2026**
**My `CONFIRMED_ABSENT` was wrong. CrPC 1973 is held by two official Government of India platforms, is now ingested at 532 sections, and moves linkable statute references from 37.18% to 69.06%.**

**Artifacts** — `scripts/n2-crpc-1973-acquire.mts` ·
`docs/ai/new2-r83/crpc-1973-acquisition.json`
**Supersedes** `docs/ai/new2-r8/STATUTE_SOURCE_RECONCILIATION_R8.md` §4.

---

## 1. What I claimed, and what was actually true

R8.1 recorded:

> **CrPC 1973 on India Code — `CONFIRMED_ABSENT`.** Three paths, one answer, and
> the zero-bitstream records name the mechanism.

Three search paths did agree. All three ran against a platform that had moved.

```
https://www.indiacode.nic.in/                        200 — a site-migration page
                                                     meta-refresh -> indiacode.gov.in
https://www.indiacode.nic.in/handle/123456789/15272  404
https://www.indiacode.nic.in/handle/123456789/2263   404   (IPC candidate)
https://www.indiacode.nic.in/handle/123456789/20062  404   (BNS, in our own code)
```

**An absence proved over a dead host is a fact about the host.** The honest form
of what I proved was narrower than what I wrote: *the items I found* carried no
bitstreams, and the CENTRAL-scoped principal-Act filter for "Criminal Procedure"
returns 1861, 1872, 1882 and 1898.

That second finding survives — re-verified today, 289 items in CENTRAL scope, no
principal 1973 Code among them. What does not survive is the leap from it to
"India Code does not hold the document".

---

## 2. Where the Act actually is

**Ten items** on the live platform carry CrPC bitstreams. Every one is filed
under a STATE Acts collection, which is why a CENTRAL-scoped search could not see
them:

| item | state | PDF | bytes |
| --- | --- | --- | ---: |
| `330a1099` | Chandigarh | `ccp1973.pdf` | 643,659 |
| `02baf368` | Chhattisgarh | `crpc.pdf` | 1,559,752 |
| `65ae197e` | Tripura | `crpc.pdf` (same MD5) | 1,559,752 |
| `044035bf` | Punjab | `crpc_act_with_state_amendments.pdf` | 2,791,816 |
| `a87443c5`, `896978bb` | Chandigarh | `the_code_of_criminal_procedure,_1973.pdf` | 1,879,339 |
| `d56e5657` | Chandigarh | `crpc_act_1973.pdf` | 1,767,612 |
| `fc8caf64` | Dadra & NH and Daman & Diu | `ccp1973.pdf` (same MD5) | 643,659 |

**The container is a state repository; the CONTENT is the central Act.** Measured
rather than assumed: `ccp1973.pdf`'s text contains **zero** occurrences of
"STATE AMENDMENT", "Punjab", "Chandigarh" or any other state marker, opens with
`THE CODE OF CRIMINAL PROCEDURE, 1973 / ACT NO. 2 OF 1974 / [25th January,
1974.]`, and carries the central extent clause. The Punjab item, by contrast,
carries 5 `STATE AMENDMENT` blocks and 14 occurrences of "Punjab" — so the test
discriminates.

### The independent corroboration that settles identity

The **Ministry of Home Affairs**, the ministry that administers the Code, serves
the same file from its Judicial Division Acts listing:

```
https://www.mha.gov.in/sites/default/files/2022-09/ccp1973%5B1%5D.pdf
  643,659 bytes
  md5     d6ff18c7af47a78f13c59ca72b4fb128
  sha256  391aa2b4881a8e6c33e24445e230b4ba6b0db78d8d99a8399a1a60a1713eaf48
```

India Code independently publishes **md5 `d6ff18c7af47a78f13c59ca72b4fb128`,
643,659 bytes** for its own copy. Two government platforms, byte-identical file,
matching checksums neither of them computed for us.

---

## 3. Three source facts worth carrying forward

### 3a. India Code's DOWNLOAD does not match India Code's own checksum

Fetching the PDF through the DSpace API returns **810,503 bytes, md5
`4442ea78…`** against the 643,659 / `d6ff18c7…` the API itself records. The
platform re-wraps PDFs on delivery. **An integrity check of an India Code PDF
against India Code's published MD5 fails every time, by design.** TEXT bitstreams
pass through unchanged and DO verify.

That is why the bytes in this acquisition come from MHA and the text from India
Code: each source is used for the artifact it can actually vouch for.

### 3b. The 100,000-character truncation is per-item, not a platform cap

R8.1 called it a platform rule. The identical PDF proves otherwise:

```
item 547526   ccp1973.pdf.txt   876,721 chars   484 of 484 sections present
item 550879   ccp1973.pdf.txt   100,000 chars    87 of 484 sections   18.0%
```

**Same PDF, same MD5, two derivatives.** The truncated one lists a complete table
of contents for an Act it holds 18% of — the exact shape that scored the IPC at
"100% complete" in R8.1. The rule that survives is unchanged and now has a
control: never measure completeness from a table of contents.

### 3c. The 1974 text is not the law an advocate needs

The MHA file is byte-perfect and it is also an **old edition**. Measured against
the other derivative, **34 sections exist only in the amended text**:

```
25A, 41A, 41B, 41C, 41D, 50A, 53A, 54A, 55A, 60A, 164A, 166A, 195A, 198A, 198B,
265A-265H, 265J, 265K, 265L, 291A, 311A, 357A, 357B, 357C, 436A, 437A, 441A
```

That list includes **436A** (default bail), **41A–41D** (the arrest procedure),
**265A–265L** (plea bargaining), **53A** (medical examination in rape cases) and
**357A** (victim compensation). Ingesting the verifiable file would have silently
omitted the most-cited modern provisions of the Code.

**Verifiability decides whether a file may be used. It does not decide which
edition is the law.** So the ingest source is the amended edition (item
`549163`, text md5 `6f3b8930…`, verified against the platform record and
identical under a second item, `65ae197e`), and the MHA file is the identity
control.

---

## 4. The parse, and the four rules it cost

```
principal Act            577,810 chars (cut at THE FIRST SCHEDULE)
parsed                   532 sections
bare sections            484 of 484   100.0%
lettered                  48
```

Four spacing and layout facts each produced a false ABSENT on a file that
contains the section in full, and each is now a named rule rather than a comment:

1. `125.Order for maintenance…` — **no space** after the period;
2. `96.     Application…` — **five** spaces;
3. `1*[24. Public Prosecutors…` — a **footnote prefix** on a substituted section (24, 433A, 446A);
4. `…made over to them—As Additional Sessions` (s.194) — heading ends with an
   em-dash and **no period at all**.

And one that truncated rather than dropped: s.351's heading is *"Appeals from
convictions under sections 344, 345, 349, and\n350."* — the wrap puts `350.` at
a line start, which reads as a new section and cut s.351 to 65 characters.
Requiring a blank line before a section start fixed it.

Sixteen load-bearing sections spot-checked against the parse: 41, 125, 154, 161,
173, 197, 227, 313, 357, 397, 437, 438, 439, 468, 482, 484 — all present with
correct headings.

---

## 5. Written

```
statute        0019baad-090a-4777-a62a-f2a12339664e
sections       532          verified by re-read
act_id         MHA_JUD_2022-09_ccp1973
act_number     2            act_year 1974
enactment      1974-01-25   enforcement 1974-04-01   (s.1(3), read off the artifact)
ministry       Ministry of Home Affairs
```

`act_id` is deliberately NOT India Code's `AC_CH_60_…`, which belongs to a
Chandigarh repository entry. Stamping it on the central Act would record the
wrong provenance in the one column meant to carry it.

### Currency — recorded, and not taken from the source

India Code's own metadata says `repealed: false`. **That is wrong as legal
fact.** BNSS (Act 46 of 2023) replaced the Code on 1 July 2024 per
`DOMAIN_TRUTH.md`, and source metadata does not overwrite domain truth. The row
carries no currency claim at all; the artifact records the repeal and its basis.

CrPC is ingested as **the law that governs pre-1-July-2024 conduct**, which is
what 186,382 judgments in this corpus are about. It is never current procedure.

---

## 6. What it unlocks

```
judgment_statute_refs linkable   320,729 (37.18%)  ->  595,721 (69.06%)
```

CrPC alone accounts for **280,027 references across 186,382 judgments** — the
single largest statute gap in the corpus, and the dominant term in what was
`REFUSE_UNHELD`.

**That apply is ~280k row updates and is HEAVY_BOX work, so it is prepared and
gated, not run.** The live DB reads 315,351 linked.

---

## 7. State

| item | state |
| --- | --- |
| `CONFIRMED_ABSENT` | **`FALSIFIED`** by this lane's own re-test |
| two-source byte identity (MHA + India Code checksum) | **`PROVEN`** |
| content is the central Act, not a state adaptation | **`PROVEN`** — zero state markers, central extent clause, and a positive control that does carry them |
| India Code downloads do not match India Code checksums | **`PROVEN`** — 810,503 B served against 643,659 B recorded |
| 100,000-char truncation is per-item | **`PROVEN`** — identical PDF, two derivatives, 18.0% vs 100% |
| amended edition carries 34 sections the 1974 one lacks | **`PROVEN`** |
| 484 of 484 sections parsed with body text | **`PROVEN`** |
| text-layer transcription fidelity | **`PARTIAL`** — s.241 in the 1974 derivative drops the word "If"; the amended derivative reads correctly, and no systematic comparison was run |
| IPC 1860 and Indian Evidence Act 1872 | **`NOT_ACQUIRED`** — same hunt not yet repeated; 111,457 references still blocked |
| CrPC state amendments | **`NOT_INGESTED`** — the Punjab item exists and is a separate question |
