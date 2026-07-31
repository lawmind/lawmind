# TEST FIXTURES

Deterministic. Never generate test data with a model — a fixture that changes
between runs is not a fixture.

## Judgments
20 real Supreme Court judgments from the corpus:
- 5 criminal, pre-July-2024 (IPC regime)
- 5 criminal, post-July-2024 (BNS regime)
- 5 civil
- 3 overruled, **one per state** — `set_aside` · `partly_set_aside` · `doubted` —
  each pointing at a real overruling judgment. The `partly_set_aside` fixture must
  populate `overruled_paras`. Three states means three fixtures: a boolean fixture
  cannot exercise the `set_aside` add-to-matter block or the `doubted` no-banner
  case.
- 2 Hindi-language

SQL seed file. Checked in. Never regenerated.

## Citation harness set
30 queries with known-correct answers. Composition and thresholds in
`CITATION_HARNESS.md`. Each records: query text, language, expected judgment IDs
in top 5, expected regime (IPC or BNS).

## Adversarial set — must fail correctly
From `docs/DATASETS.md`, drawn from real errors in public legal datasets:
- Bail application requested for a civil employment matter
- Dissenting opinion requested for a unanimous judgment
- "Did Indra Sawhney permit reservation in promotions?"
- IP-law implications of a labour judgment
- Criminal question with no date, so no regime specified
- A plausible-sounding case name that does not exist
- A real case name with a wrong year
- An IPC section with no clean BNS equivalent
- A query in Hinglish (Roman-script Hindi)

Correct behaviour is refusal, correction, or an honest unverified state. A
confident wrong answer fails.

## OCR fixtures
10 real scanned orders: 3 clean scans, 3 poor photocopies, 2 angled phone
photographs, 2 Hindi-language. Expected extracted fields recorded per file.
Tests measure field accuracy, not character accuracy.

## PII fixtures
5 documents with known entity lists — Indian names including transliteration
variants, Devanagari names, addresses, phone numbers, a minor's identifier.
Measures recall, not just precision: a missed entity is the failure that matters.

## Matters
3 fixtures: one with a hearing tomorrow (drives the sweep test), one disposed,
one with no hearing date.

## Users
`advocate_verified`, `advocate_unverified`, `admin`. Fixed UUIDs.

## Drafting
One golden output per document type per language — 20 files. Diffed on change. A
diff is not automatically a failure but requires a human look before merge.
