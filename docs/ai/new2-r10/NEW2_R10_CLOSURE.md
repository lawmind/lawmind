# NEW2 R10 closure receipt

Taken 29 August 2026. This is the narrow HC accounting, freshness,
Supreme Court authorization, and citation-apply closure requested for R10.
No broad OCR, role classification, semantic work, or provider experimentation
was run.

## High Court parity

Definition: `HC_PARITY_V2_2026-08-29`.

| Metric | Count |
|---|---:|
| upstreamUnique | 18,945,988 |
| sourceArtifactHeld | 18,724,704 |
| textReadable | 18,714,138 |
| imageOnlyOcrPending | 10,318 |
| sourceUnavailableCurrent | 221,284 |
| policyRefused | 0 |
| actionableFailures | 0 |
| neverAttempted | 0 |
| accountedPercent | 100% |
| actuallyHeldPercent | 98.832% |

The held total also includes 248 retained malformed PDFs whose source bytes are
held but whose text is neither readable nor represented as image-only. The
accounting identity is exact:
`18,724,704 + 221,284 + 0 + 0 + 0 = 18,945,988`.

The original retry-exhausted ledger outcomes (`no_text`, `pdf_failed`,
`pdf_timeout`, `pdf_unavailable`, `pdf_missing`) now have zero rows. Retry
exhaustion was not used as a terminal source state.

## PDF recovery and image-only retention

The complete 811-row `pdf_failed` population was re-probed:

- 375 already-canonical PDFs were re-fetched and retained as
  `TEXT_AVAILABLE`/`duplicate_linked`.
- 173 were newly recovered as canonical text-readable judgments.
- 10 were retained as `IMAGE_ONLY_OCR_PENDING` without fabricated text.
- 248 live malformed PDFs were retained as source artifacts with text
  unavailable.
- 5 were current source-unavailable fetch failures with direct evidence.

Thus 806/811 source PDFs are now held. Together with the original 10,308
`no_text` artifacts, 10,318 held PDFs are explicitly
`IMAGE_ONLY_OCR_PENDING`. No OCR was run.

## Source-unavailable revalidation

The daily HC delta path now revalidates source-unavailable rows when their
owning partition is `NEW`, `GROWN`, `SHRUNK`, or `CHANGED`, or after the
90-day revalidation window. Revalidation is capped at 2,500 rows per cycle
with concurrency four. The latest dry selection was zero because no rows were
due; recoverable rows are not permanently blacklisted.

## Freshness contract

Canonical files and SHA-256:

- `hc-parity-definition-v2.json`:
  `1e5bdd9060d527116b2ca0c9a013d30d3dfe7e687d2c503755bd7fd989dbc0e7`
- `parity-matrix.json`:
  `f44404ae59edd655659deebc8a4503abd98779833791172f3f91921b9db8555e`
- `source-freshness.json`:
  `76ae6a08e9221e413fa98845bc8b0b297ac530533bbcc42a6311223667f4116a`

The freshness summary uses the newest 12 `decisionMonth` buckets from the
same matrix: latest upstream and local decision date `2026-08-27`, last
successful ingest `2026-08-29T07:49:03+00`, lag zero days, completeness
`0.9696` (`1,492,335 / 1,539,083`), and 46,748 source-unavailable rows.
All-time values remain separately nested (`0.9883`, 221,284 unavailable).

## Supreme Court authorization

The controlling record is `CLAUDE.md` §6a, which is committed and says
`SCI_AUTHORISATION_STATE = UNCHANGED` — the separate SCI automated-access
question is CONTESTED, and the 29 Aug 2026 founder decision was eCourts only.
`docs/SCI_AUTHORISATION.md` is NOT_IN_HEAD and is therefore evidence of
nothing; an earlier revision of this section named it as the controlling
record, which is how an uncommitted document becomes true by citation.
Nothing below depends on that question resolving either way — the public
homepage Judgments feed rests on `public_official`, not on the written grant,
and remains on at exactly that scope.
The observed cycle made one homepage fetch and 25 official PDF fetches, all
under `public_official`, and made zero search/expanded-access fetches. Expanded
SC access remains off. The AWS metadata-partition-year retrieval fallback in
`services/ingest/src/sci.ts#fetchUrlCandidatesFor` remains in place.

## Citation apply gate

FIFTH's sampled signature covered `citation-resolver-v0.1` and 2,556,146
signed `UNIQUE` rows. Before any write, the exact resumable preflight checked
all 2,556,146 rows at the current key frontier and found two rows that now
resolve `AMBIGUOUS`:

- `2026:JHHC:24297`, edge `0e0f69b3-dec3-4e5f-904c-14c870c88b3a`
- `2026:KHC:39949-DB`, edge `1959a76d-e3a6-48c4-8ce6-90a4b2d2b4f8`

The exact signature therefore does not match the current population. FIFTH
subsequently issued `CITATION_APPLY_SIGNATURE = HOLD` on those exact two
falsifiers. Apply state is `DECIDE_ONLY_HOLD`; zero signed rows were written,
no subset was silently applied, and the resolver was not tuned around the
falsifiers. The graph currently has 227,382 resolved rows and 200,626 distinct
citing-to-cited edges; signed-apply edge growth is zero. Any future application
requires a new explicit FIFTH PASS over a newly named immutable population.

## Verification

The bounded parity recomputation produced 7,730 court/month cells and zero gap
rows. The API freshness projection and image-only evidence-state tests pass
4/4. Supreme Court homepage-path tests pass 36/36.
