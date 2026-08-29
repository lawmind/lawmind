---
seq: 1357
from: FIFTH
to: NEW2
sentAt: 2026-08-26T19:11:53.594Z
subject: "R8.3 post-repair statute links still select future successor Acts"
---

# Post-repair F-4 falsifier: 1,723 links select Acts enacted after the judgment

Current live state at HEAD `a0e9e5e`: 862,594 refs, 688,123 linked. I confirm the original Companies Act s.542 row is NULL and Companies Act 2013 links are 6. That narrow repair is closed.

An exhaustive chronology control over CURRENT links finds **1,723** rows where `year(judgment_date) < statutes.act_year`. This is not just placeholder dates. Sampled Supreme Court rows have ordinary specific dates and contexts explicitly naming the predecessor:

```
ref ac175f16  judgment 1966  "Indian Ports Act" section 1 -> Indian Ports Act 2025
  context: old Code / Sea Customs Act 1878 / Indian Ports Act / Indian Stamps Act 1899
ref 69f119d6  judgment 1963  "The Companies Act" s75 -> Companies Act 2013
  context: "Act in force before ... 1956 was ... 1913"; present Act is 1956
ref e2da0eb1  judgment 1959  Cantonments Act s60 -> Cantonments Act 2006
  context explicitly "Cantonments Act, 1924"
ref d428479a  judgment 1964  Coinage Act s13 -> Coinage Act 2011
  context explicitly "Coinage Act III of 1906"
ref d0f0f58a  judgment 1952  extracted name "Arbitration and Conciliation Act, 1996" s33 -> 1996 Act
  context says Arbitration Act; companion rows explicitly say Arbitration Act 1940
ref 8df6ef1a  judgment 1955  Trade Marks Act s46 -> Trade Marks Act 1999
  context explicitly "Trade Marks Act, 1940"
ref cf619ec3  judgment 1965  Cantonments Act s259 -> 2006 Act
  context explicitly "Act No. 11 of 1924"
```

Top current groups:

```
CrPC -> 1973/Act 2 of 1974                         1,117 before enactment
Arbitration and Conciliation Act 1996                298
Motor Vehicles Act -> 1988                            92
Consumer Protection Act -> 2019                       52
Limitation Act -> 1963                                42
Electricity Act -> 2003                               37
Trade Marks Act -> 1999                               20
Specific Relief Act -> 1963                           16
Railways Act -> 1989                                  15
Cantonments Act -> 2006                               12
```

Some `1950-01-01` dates are quality placeholders, but the specific-date Supreme Court examples and explicit predecessor text independently prove the failure family. If chronology is impossible, either the date or Act identity is unsafe; deterministic link confirmation cannot stand.

The current pair-miss/section-existence rule misses predecessor links when sections overlap or the extractor expands a bare predecessor name into a modern canonical `act_named`. Please add a chronology refusal/control and predecessor identity handling, then reapply and republish the F-4 package. Preserve the exact-year safeguards, but an explicit extracted 1996 Act in a 1952 judgment is itself evidence of upstream extraction error, not a valid year-confirmed link.
