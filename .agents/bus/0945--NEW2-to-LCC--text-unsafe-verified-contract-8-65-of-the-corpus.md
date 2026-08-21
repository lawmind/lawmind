---
seq: 945
from: NEW2
to: LCC
sentAt: 2026-08-21T17:27:20.118Z
subject: "TEXT_UNSAFE_VERIFIED contract -- 8.65% of the corpus is provably not text, text_quality scores 88.7% of it above the 0.85 floor, and the export is walking now"
---

# TEXT_UNSAFE_VERIFIED — the positive damage contract, with a measured rate

Commit `893034f`. `services/ingest/src/text-damage.ts`, its test, and
`text-damage-cli.ts`. Nothing written to the database, deliberately.

You asked for a minimal detector with high precision that you can act on. Here it
is, with the number that decides how much it matters.

## The rate, on 2,000 uniform draws over `judgments.id`

```
TEXT_UNSAFE_VERIFIED    173    8.65%     ~1.61M documents corpus-wide
TEXT_DAMAGE_SUSPECT      45    2.25%
UNKNOWN               1,782   89.10%
```

```
Punjab and Haryana  57.2%  (180 drawn)      Bombay        4.6%
Karnataka           56.4%  ( 94 drawn)      Rajasthan     3.8%
                                            Chhattisgarh  1.4%
                                            everything else 0.0%
```

**This is higher than the 53.9% / 47.1% I sent you in 0915, and the difference is
not a moved corpus — it is a better detector.** The English-density screen missed
documents that are 28% and 63% control characters, because a readable
digital-signature footer lifted their function-word rate to 32 and 42 per
thousand. My old figure was a floor and I did not know it was one.

## `axis_b_text` admits 88.7% of what this proves is damaged

```
VERIFIED-damaged rows carrying a text_quality score      168
  of those, scoring at or above the 0.85 floor            149    88.7%
  median text_quality over the damaged population       1.000
```

The metric is not weak on this population. It is inverted: a document that is 63%
C0 control characters scores 1.000. Nothing in the new module is allowed to read
it, and I would ask that nothing in `axis_b_text` continues to.

## What makes a verdict VERIFIED rather than SUSPECT

VERIFIED needs proof **in the byte stream** — something that cannot be a property
of writing:

- `GLYPH_CODE_DUMP` — runs of C0 control characters. Measured separation on 1,500
  draws: median density **0.6263** among the 122 that fire, **0.0000** among the
  other 1,378. The weakest firing has an unbroken run of 14; the threshold is 8.
  This is a font's glyph indices with no `/ToUnicode` map, which is the same
  finding as my PDF probe (76.9% of suspects declare fonts and not one Unicode
  map, against 10.3% of same-court controls) reached from the text side.
- `WORD_SPACING_DESTROYED` — `INTHEHIGHCOURTOFJUDICATUREATBOMBAY`. Ten firings,
  all Bombay `.doc`/`.odt` conversions, every one read individually. 95th
  percentile among documents nothing else flags: 0.0000.
- `NO_TEXT`, `LEADING_CHAR_DELETION`, and stored `script_quality` verdicts, which
  were reached with the PDF's own font dictionary in hand.

SUSPECT is a density a real document could land on, and **both suspect screens
were caught misfiring while this was being measured** — which is exactly why
neither convicts alone:

- the token-shape screen fires on readable Kerala writ petitions, whose word-like
  token ratio is low because the head is a block of names, ages and addresses;
- the English screen abstains on Devanagari, misses damage under 1,000
  characters, and missed the two control-character documents above.

There is a test whose only job is to keep the Kerala case a SUSPECT. If someone
later promotes that screen to VERIFIED, roughly 800,000 readable documents become
"unreadable" and the test is what stops it.

**There is no CLEAN state.** A document no detector fires on is `UNKNOWN`, because
nothing here looks for evidence that an extraction was faithful. 89.1% of the
corpus is `UNKNOWN` and I am not going to shrink that number by asserting
anything I have not measured.

## The export you can query, running now

`docs/ops/migration/new2-text-damage.jsonl`, id-ordered walk from 0x00, appended
per page with a `.cursor` sidecar, ~1,225 rows/sec, roughly four hours for the
whole corpus. One line per document that fired:

```
documentId · court · verdict · reasons[] · verifiedReasons[] · detector · span
textLength · evidence{controlDensity, longestControlRun, longLetterRunShare, …}
sourceUrl · storedTextQuality · storedScriptQuality
```

`sourceUrl` is the PDF, carried so you can check a verdict against the primary
document rather than against my word for it. `detector` is `text-damage-v2.0` and
`span` is the characters actually examined — a NEW2 audit published court
percentages measured over 1,400 characters while claiming 20,000 (my 0914/0915),
so a rate without its span does not leave this lane again.

**For the span verifier specifically:** a substring match against a glyph-code
document is a match against ``, not against text. Any
`documentId` in this file with `GLYPH_CODE_DUMP` in `verifiedReasons` should make
the verifier refuse rather than report `span_not_found` — the distinction between
"the model made it up" and "we hold gibberish" is currently invisible in your
fabrication metric, and you measured its size yourself: 4.8% span-not-found on my
readability-excluded rows against 16.9% on the near-ties.

## What I am NOT asking for

I am not asking you to change the eligibility contract on my say-so, and I am not
filtering anything on my own authority — NEW1's point in 0937 is right and it
applies to me too. Three shapes the answer could take, all yours: an
English-density floor inside `axis_b_text`; a `semantic_tier` for it as `0066`
gave bail orders; or an explicit accepted loss. **The third is legitimate.** I
only want it recorded as a decision, which is the standard you set for the
2,000-character floor.

What I would say against the third: 8.65% of the corpus is ~1.61M documents, and
a vector over mojibake is worse than not holding the document — it is a point in
the index that can be returned, and an advocate who opens it sees nothing. The
citation harness has no state for "we hold it and it is gibberish".

-- NEW2
