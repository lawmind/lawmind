# TEXT RECOVERY POLICY — what to do with the 1.6M documents that are not text

**Owner:** NEW2 · **Written:** 21 Aug 2026 · **Measured, not remembered.**

Every number here was taken on this corpus on the stated date. Re-measure with
the commands in §6 rather than trusting the figures after the corpus moves.

---

## 1. The population

`text-damage.ts` (`text-damage-v2.0`) convicts a document only on positive
evidence in the byte stream. On 2,000 uniform draws over `judgments.id`:

```
TEXT_UNSAFE_VERIFIED    173    8.65%      ~1.61M documents corpus-wide
TEXT_DAMAGE_SUSPECT      45    2.25%
UNKNOWN               1,782   89.10%
```

```
Punjab and Haryana  57.2%      Bombay        4.6%
Karnataka           56.4%      Rajasthan     3.8%
                               Chhattisgarh  1.4%
```

`judgments.text_quality` scores **149 of the 168** scored VERIFIED-damaged rows at
or above the 0.85 eligibility floor, median **1.000**. It is not a weak signal on
this population; it is an inverted one. Nothing in the recovery path reads it.

---

## 2. The finding: OCR recovers these documents, re-extraction does not

Bounded probe, 40 PDFs, page 1, CPU only — no GPU, so it cannot compete with the
embedding sidecar. `scripts/new2-ocr-recovery-probe.py`, results in
`docs/ops/migration/new2-ocr-recovery-probe.json`.

Three readings of the **same file**, so the comparison is within-document:

| | stored readable | MuPDF readable | OCR readable |
|---|---|---|---|
| suspect (n=20) | **0** | **0** | **20** |
| control, same court (n=10) | 10 | 10 | 10 |
| control, other court (n=10) | 10 | 10 | 10 |

- **A different extractor recovers nothing.** MuPDF on the same bytes produces the
  same glyph dump — median control-character density **0.7014**. The claim "no
  re-extraction can fix it" is now tested rather than inferred, and the reason is
  in the file: the subset-embedded fonts carry no `/ToUnicode` map, so there is no
  character mapping for any extractor to find.
- **OCR recovers all twenty.** Median English rate **46.3**, control density **0**.
- **The controls are the point.** On documents whose stored text is already fine,
  OCR reproduces it — median English 53.3 stored against 49.4 OCR. A
  suspect-only run could have reported "OCR produced text" and meant nothing.
- **Cost: 3.7 s per page, CPU.**

### Verified against facts that never came from the text

Case number and judgment date arrive as source metadata, so they can adjudicate
the OCR rather than agree with it by construction:

```
case number recovered   20 / 20
date recovered          18 / 18   (2 pages print no date in the window read)
wrong                    0
```

### One systematic defect, and it decides the policy

**6 of 20 render a year with the letter O for zero — `2O17`, `2O19`, `2O18` — and
every one of the six is Karnataka.** A court-specific glyph shape the model reads
as a letter.

So OCR output is reliable for **prose** and unreliable for **digits**. In a
citation harness a digit is not cosmetic: a section number, a year, or a date read
wrong is a wrong authority. This is the existing `CLAUDE.md` rule — *OCR output is
never trusted silently* — arriving from a new direction, and it applies to
recovered corpus text exactly as it applies to an advocate's upload.

---

## 3. The states, and the one that must not be used

| state | meaning |
|---|---|
| `OCR_RECOVERY_CANDIDATE` | proven damaged, and a rendered-page OCR recovers readable text. **This is where the measured population sits.** |
| `TEXT_UNRECOVERABLE` | proven damaged, and OCR was tried on this document and failed. |
| `MANUAL_UNKNOWN` | proven damaged, OCR not attempted. |

**`TEXT_UNRECOVERABLE` must not be applied to the glyph-dump population.** Zero of
twenty failed. Naming a recoverable population unrecoverable would foreclose 1.6M
documents on evidence that says the opposite — and it is the kind of label that,
once written, nobody re-tests.

---

## 4. What recovered text may and may not be used for

Recovered text is a **derived artefact of an OCR engine**, not the court's
published text, and the truth ladder puts it below both.

**Permitted**

- semantic retrieval — embedding the recovered text, so a document that is
  currently unreachable becomes findable;
- reading by a person, with the recovery state visible.

**Not permitted without a second witness**

- any **numeric** field — section number, year, date, case number, citation year —
  because of the Karnataka digit defect above;
- **span verification** of a citation. A span "found" in OCR text is evidence that
  an OCR engine produced those characters, not that the court printed them.

**Never**

- overwriting `judgments.full_text`. Recovered text belongs beside the original
  with its own provenance and engine version, never in place of it. The original
  glyph dump is the evidence that recovery was needed, and destroying it makes the
  recovery unauditable.

---

## 5. Cost, so the decision has a number

At 8.65% of 18,660,626 High Court rows and 3.7 s per page:

```
documents            ~1,614,000
pages                page 1 only measured; a full document is many
CPU-seconds          ~6.0M for one page each  =  ~69 CPU-days single-threaded
```

That is a real bill and this document does not propose paying it. What it
establishes is that the bill BUYS something, which was the open question. A
sensible first tranche is the intersection of proven damage with what retrieval
actually needs, which is far smaller than the whole.

**Not run, and deliberately:** anything corpus-wide. The directive was a bounded
sample and this is a bounded sample.

---

## 6. Re-measuring

```bash
# the damage rate and its court distribution
pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
  src/text-damage-cli.ts --sample 2000

# the recovery probe (needs: pip install pymupdf; pip install --no-deps rapidocr-onnxruntime)
python scripts/new2-ocr-recovery-probe.py \
  --in <jsonl of {documentId,court,sourceUrl,storedText,group}> \
  --out docs/ops/migration/new2-ocr-recovery-probe.json
```

`rapidocr-onnxruntime` is Apache 2.0 and runs the PaddleOCR models on
onnxruntime, CPU. PaddleOCR is already the engine settled in OD-7
(`docs/OCR_PIPELINE.md`), so this is that decision's runtime and not a new vendor.
Installed with `--no-deps` because onnxruntime 1.29.0 is already present and its
DLL is held open by the GPU sidecar.

---

## 7. What is NOT established

- **Page 1 only.** Every figure is the first page of each document. A document
  whose first page OCRs cleanly and whose later pages do not would read as a
  success here.
- **n = 20 suspects.** Enough to say recovery works; not enough to put an interval
  on a failure rate. The honest statement is "0 of 20 failed", not "OCR never
  fails".
- **Two courts.** Punjab & Haryana and Karnataka, the two the damage concentrates
  in. Nothing here generalises to a court with a different failure mode —
  Devanagari deletion in particular was not tested and is a different mechanism.
- **No accuracy figure for prose.** Case number and date were checked. The body
  text was read for readability, not diffed against a reference, because for the
  suspect population no reference exists — that is what makes them suspects.
