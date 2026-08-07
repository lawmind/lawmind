# SPRINT 4 — DRAFTING AND TOOLS

**🟢 UNBLOCKED 2 Aug 2026 — OD-7 and OD-6 both resolved. OCR intake ships in v1.**
PaddleOCR primary, Tesseract fallback; the bake-off is tuning, not selection.
The countersigned DPA must be on file before uploads go live.

**OD-5 resolved: Hindi drafting ships**, built in S5 and released only when the
two Hindi law graduates approve the register on 20 sampled drafts. **English
drafting is not gated by that review** — the two ship independently.

**Read first:** `PRODUCT_DECISIONS.md` PD-7, PD-8, PD-9, PD-12 ·
`docs/CITATION_HARNESS.md` §Citations are locked in editing.

---

## LCC

**OWN:** `services/api/**`, `services/ocr/**`, `packages/templates/**`

**BLOCK ON:** nothing. OCR engine and sensitive-class routing are both settled.

**TASK**

1. **10 document types**, grouped criminal/civil, versioned in `draft_templates`
   and scored against a **200-item golden set** reviewed by a practising advocate.
   Gates per template: court-format compliance · no invented citations · no
   overruled authority cited as good law · Hindi parity.
   **Nothing ships below 90 without a founder override, and the override writes
   `template.override_gate` to `audit_log` with a mandatory reason.**
2. **Paragraph-level editing with citations locked — enforced server-side.**
   `PATCH /documents/:id` accepts **paragraph prose only**. The server re-extracts
   citation spans and **rejects `422` on any divergence** from the authoritative
   set in `citation_checks`; the document is not partially saved.
   **The client's lock glyph is presentation, not enforcement** — a replayed
   request or a modified client bypasses it entirely.
   Changing an authority goes through `POST /documents/:id/citations` with a
   `judgmentId`, which **re-runs the verification tiers** — never a citation
   string.
   *Why this is load-bearing:* a hand-edited citation breaks the verification
   chain, and the badge would assert something we never checked. That is the
   hallucination failure arriving through a different door, and harder to catch
   because the citation was genuinely verified once.
3. **Export.** **`.docx` is the default**, PDF second. Styles must survive intact;
   citations export as plain text. **A mangled export is worse than no export** —
   Word is where documents are finished.
   **No watermark, no hatched margin** (PD-8 superseded). A single line in the
   **export metadata** only.
4. **Limitation calculator.** Cause-of-action date + relief → limitation period
   and deadline. **Missing a limitation period is malpractice — this is the
   highest-anxiety calculation an advocate makes.** The result must state its
   **basis** — which Act, which article, which starting date — not just a date.
   A bare date the advocate cannot check is worse than no calculator.
5. **Court fee calculator.** Per state, per suit value.
6. **OCR** — blocked. When unblocked: nothing derived from an OCR job writes to a
   matter until `/confirm`.

**DONE**
- Advocate approves **>90% of 50 drafts**
- `.docx` **opens cleanly in Word** with styles intact — tested in Word, not a
  viewer
- A crafted `PATCH` attempting to alter a citation string is **rejected `422`**
- Limitation calculator output states its statutory basis
- **`ocr_confidence` non-null on every chunk whose source was a scan, and null on
  every chunk whose source was not.** *Moved here from Gate S1 on 7 Aug 2026 —
  see `sprints/SPRINT_1.md` §Gate correction.* S1 could not pass it because no
  scan had ever entered the corpus: every source to that point was born-digital
  text, and the column was correctly null on all 616,197 chunks. **S4 is the
  first sprint in which a scan exists**, because it is the sprint that ships
  document upload. Retrieval **down-ranks** low-confidence text rather than
  excluding it. Null must continue to mean *never measured*, never *measured as
  zero*.

**NEVER**
- Accept a whole-document `content` blob on `PATCH`
- Accept `watermarkRemoved` — the field is retired
- Send uploaded document content to any model while OD-6 is open

---

## RCC

**OWN:** `apps/mobile/**`

**TASK**

1. **Type picker** (canvas `1o`) → **input form** (`1p`, six fields,
   matter-prefilled, progress made visible so it feels short).
2. **Draft output** — canvas `8c`, `design/screens/renders/47-draft-output@2x.png`. Source Serif 4
   on `paper-desk #F2EFE8`, white page. **No AI-mark header band** — PD-8
   superseded, the component in `design/screens/IMPLEMENTATION.md` §4 is **not to be built**.
   **Draft footer carries "N of M citations verified"** — one line, in-app only.
3. **Paragraph editing** — tap a paragraph, edit its prose, neighbours drop to
   **34% opacity**. **Citations locked**, with a small lock glyph beside the mark.
   Removal happens through the authority list, **not by keystroke**.
4. **Export sheet** — `.docx` default, PDF second, copy-text third.
5. **Hindi output** (canvas `9a`, `design/screens/renders/36-hindi-parity@2x.png`) — Noto Serif
   Devanagari at 1.72, **citations stay in English** (PD-12/§9.6: that is how they
   must appear when filed). One explanatory line under the language toggle, shown
   once. **Ships only if OD-5 resolves for both.**
6. **Calculator UI** — limitation and court fee. Show the **basis**, not just the
   answer.
7. **OCR intake UI** — unblocked. Present field confirmation
   as a **normal review, not a warning** (`docs/PRIVACY_PII.md`) — it is a
   data-correctness step and the cautionary framing made a routine step feel risky.

**DONE**
- A draft generates, edits at paragraph level, and exports to `.docx`
- **Free-typing over a citation is impossible in the UI** and rejected by the
  server if attempted
- Hindi draft renders with no clipped matras at any size
- Reduce Motion on: no transforms anywhere, opacity only

**NEVER**
- Build the `AIMarkBar` or the AI-mark header band
- Rich text editing. Paragraph-level only — **Word wins that fight**

---

## GATE S4
Advocate approves >90% of 50 drafts · `.docx` opens cleanly in Word · citations
cannot be free-text edited · `ocr_confidence` non-null on scanned sources and
null on everything else · **law graduates approve the Hindi register** if Hindi
ships here.
