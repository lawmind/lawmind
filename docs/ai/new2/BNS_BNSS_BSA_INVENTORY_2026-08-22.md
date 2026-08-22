# BNS / BNSS / BSA — the official inventory, and the three questions that must not be merged

**NEW2 · 22 August 2026 · P5.** Three separate questions, kept separate because
success on the first has already been described as progress on the third.

```
1. ACT NAME NORMALIZATION   "BNS" -> Bharatiya Nyaya Sanhita          LCC's canonicalAct fix
2. SECTION CORRESPONDENCE   old provision <-> new provision           statute_mappings
3. TEMPORAL APPLICABILITY   which enactment governs this event         NOT BUILT, and must not be
```

---

## 1. Act name normalization — LCC's `canonicalAct` repair, audited

Bus 1015. LCC re-derived `act_key` on `judgment_statute_refs`, a table this lane
owns, because `ACT_SYNONYMS` had no entry for the three 2023 codes and `act:BNS`
therefore matched 0 of 20,440 references. The instruction for this round is to
verify the moved rows and the refusals, and **not** to revert a correct repair
merely because another lane wrote it.

**Verdict: the repair is correct, and it is incomplete.** Both halves matter.

### Correct — every row it moved

```
distinct act_named spellings now folded into the three codes        273
of those, spellings that do not actually name that statute            0
references now keyed to the three codes                         150,966
   BHARATIYA NAGARIK SURAKSHA SANHITA   129,295   (204 spellings)
   BHARATIYA NYAYA SANHITA               21,175   ( 47 spellings)
   BHARATIYA SAKSHYA ADHINIYAM              496   ( 22 spellings)
act_named rows emptied or altered by the repair                        0
```

`act_named` — how the court printed it, the evidence column — is untouched,
which is the only reason this audit was possible at all.

### Correct — the refusals, which are the half that can go silently wrong

A merge rule keyed on "ends in SANHITA or ADHINIYAM" could sweep in State
statutes. It did not:

```
MADHYA PRADESH RAJYA SURAKSHA ADHINIYAM        44 refs   correctly left alone
CHHATTISGARH PANCHAYAT RAJ ADHINIYAM           62        correctly left alone
NAGAR TATHA GRAM NIVESH ADHINIYAM              43        correctly left alone
MADHYA PRADESH KRISHI UPAJ MANDI ADHINIYAM     39        correctly left alone
MADHYA PRADESH MADHYASTHAM ADHIKARAN ADHINIYAM 26        correctly left alone
```

### Incomplete — 40 keys and 592 references the rule could not reach

The rule keys on an ending bigram, so it survives misspellings of the *first*
word and not of the *key* word. What is left behind is a catalogue of OCR damage
in exactly the population that will silently fail `act:BNSS`:

```
 280  BHARATIYA SURAKSHA NAGARIK SANHITA     words transposed
 168  BHARATIYA NAGARIK SURASKHA SANHITA     SURASKHA
  43  BHARATIYA NAGARIK SUREAKSHA SANHITA    SUREAKSHA
  22  BHARATIYA NAYAY SANHITA                NAYAY
  18  BHARATIYA NAYAYA SANHITA               NAYAYA
   5  BHARATIYA NAYA SANHITA                 NAYA
   5  BHARATIYA NAGARIK SURKSHA SANHITA
   3  BHARATIYA NAGARIK SURUKSHA SANHITA
   3  BHARATIYA NAGARIK SURKASHA SANHITA
   2  BHARATIYA NAGARIKSURAKSHA SANHITA      no space
   2  BHARATIYA NAGARIK SIURAKSHA SANHITA
   2  BHARATIYA NYANA SANHITA
   ... 28 more, 592 references in total
```

**Not all of them are safe to fold, and that is the point.** Three are genuinely
ambiguous and must not be resolved by picking one:

```
BHARATIYA NAGARIK SANHITA      7 refs   SURAKSHA dropped — probably BNSS, not certainly
BHARATIYA SANHITA              2        neither key word present
BHARATIYA SURAKSHA ADHINIYAM   2        BNSS's key word with BSA's suffix
```

592 references is 0.39% of the 150,966 now keyed. Small, and it is the tail an
`act:` filter loses without saying so. **Recommendation to LCC: extend the rule
by edit distance on the key word only, and leave the three ambiguous keys
unmerged with the reason recorded.** Not done here — it is a normalization
change and normalization now lives with the module owner.

Artifacts: `docs/ai/new2/canonicalact-audit.json`, `canonicalact-residue.json`.

---

## 2. Section correspondence — the official inventory, typed

Source: the BPR&D comparison summaries, `authority_class = OFFICIAL_CORRESPONDENCE`.
Per `DOMAIN_TRUTH.md` these are a **correspondence table** — usable as a mapping,
never as the text of a section, and never trainable as statute.

### Coverage against the enacted text we hold

```
                     sections held   official rows   sections with a usable row   coverage
BNS   (replaces IPC)          358              14                            8      2.23%
BNSS  (replaces CrPC)         531              95                           87     16.38%
BSA   (replaces IEA)          170             117                          101     59.41%
TOTAL                       1,059             226                          196     18.51%
```

**81.49% of the three codes has no official correspondence row at all.** That is
`NO_OFFICIAL_MAPPING_FOUND` — a fact about our holdings, not about the law.

### The typed inventory

| type | BNS | BNSS | BSA |
|---|---|---|---|
| OFFICIAL_EXACT | 7 | 70 | 101 |
| OFFICIAL_ONE_TO_MANY | 1 | 1 | 0 |
| OFFICIAL_MANY_TO_ONE | 0 | 14 | 0 |
| OFFICIAL_PARTIAL | 0 | 9 | 0 |
| COMPLEX | 6 | 1 | 16 |
| NO_OFFICIAL_MAPPING_FOUND | 350 | 444 | 69 |
| OFFICIAL_NO_EQUIVALENT | 0 | 0 | 0 |
| NEW_PROVISION | 0 | 0 | 0 |
| REPEALED_NO_DIRECT_EQUIVALENT | 0 | 0 | 0 |

The last three types are **empty and stay empty**. The BPR&D summaries as parsed
produced no evidence for them. Populating them would mean deciding, from a
model, that a provision has no equivalent — which is the one thing this table
must never contain.

### Row-level validity, checked against primary material

We hold the enacted text of all three new codes, so every row's `new_section`
can be checked against the sections that actually exist:

```
new_section exists as parsed                                       134
new_section exists ONLY after stripping a trailing capital letter   69
new_section does not exist in the enacted text at all               23
```

**69 rows carry a mangled section number.** The parser glued the first letter of
the heading to the number: `531R` for section 531 of a row whose own evidence
reads *"531 Repeal and savings. 484 No change"*. Sixty-five of those 69 are BNSS
— 68% of that act's rows.

**23 rows name a section that does not exist**, typed COMPLEX and unusable.

### The old section has no primary witness at all

We hold the enacted text of the three new codes and of **none** of the three
they replaced. So `old_section` — the half an advocate actually asks for
("what is section 302 IPC now?") — cannot be checked against primary material.
Its only witness is the row's own evidence string:

```
old_section agrees with the row's evidence     214 of 226
old_section contradicts the row's evidence      12 of 226   (5.3%)
```

The contradictions are mostly a systematic off-by-one:

```
stored old 98  <- evidence says CrPC 97    for BNSS 100  "Search for persons"
stored old 141 <- evidence says CrPC 140   for BNSS 159
stored old 146 <- evidence says CrPC 145   for BNSS 164
stored old 149 <- evidence says CrPC 148   for BNSS 165
stored old 172 <- evidence says CrPC 171   for BNSS 191
stored old 1   <- evidence says CrPC 175   for BNSS 195   (gross)
stored old 2   <- evidence says IPC 370A   for BNS  149   (gross)
```

**Correction to my own first pass:** twelve further BSA rows looked like
contradictions until I read them. `3(1)` against an evidence string reading
*"3, para 8"* is the BPR&D spelling of section 3 paragraph 8, and the stored
value was right — my reader was wrong. That number is not in the table above
because it was never real.

### What this means for the product

**`statute_mappings` is not fit to answer "what is section 302 IPC now?" today.**
Coverage is 2.23% for BNS, 69 of 226 rows carry a mangled new-section number, and
the old-section half has a 5.3% measured error rate against its own evidence with
no primary witness available. Any surface that answers a correspondence question
must read the row, state that it is official correspondence and not the text, and
**refuse where no row exists** — which is four times out of five.

Artifact: `docs/ai/new2/bns-correspondence-inventory.json` — every row typed,
validated and carrying its source URL.

---

## 3. Temporal applicability — not built, and correspondence does not build it

A correspondence row says *this provision corresponds to that one*. It does not
say *which enactment governs an offence committed in May 2024*. That second
question is answered from the **commencement date**, read from `statutes`:

```
The Bharatiya Nyaya Sanhita, 2023            act 45 of 2023   in force 2024-07-01
The Bharatiya Nagarik Suraksha Sanhita, 2023 act 46 of 2023   in force 2024-07-01
The Bharatiya Sakshya Adhiniyam, 2023        act 47 of 2023   in force 2024-07-01
```

and from the offence date, which is an **input**. `services/api/src/statutes/transition.ts`
already refuses rather than guessing when the offence date is absent, and reads
the commencement date from the `statutes` row rather than from a constant. That
is the correct shape and nothing here should be taken as licence to mount
applicability on top of a correspondence row.

**Success on question 1 is not coverage of question 2, and neither is question 3.**
