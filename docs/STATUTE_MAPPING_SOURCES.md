# STATUTE MAPPING SOURCES — official IPC/CrPC/Evidence Act ↔ BNS/BNSS/BSA

NEW3, 20 Aug 2026. For LCC's statute-mapping build. **Sources only — no
mapping built here.** Per mission brief: LCC derives the mapping from these
primary sources; this lane does not generate section↔section mappings from
semantic similarity.

## 1 · ENACTED TEXT — primary, government-hosted

| act | official no. | source | url |
| --- | --- | --- | --- |
| Bharatiya Nyaya Sanhita, 2023 (repeals IPC 1860) | Act 45 of 2023 | India Code (Ministry of Law & Justice, Legislative Dept.) | https://www.indiacode.nic.in/bitstream/123456789/20062/1/a202345.pdf |
| Bharatiya Nagarik Suraksha Sanhita, 2023 (repeals CrPC 1973) | Act 46 of 2023 | India Code | https://www.indiacode.nic.in/bitstream/123456789/20099/1/A202346.pdf |
| Bharatiya Sakshya Adhiniyam, 2023 (repeals Evidence Act 1872) | Act 47 of 2023 | India Code | https://www.indiacode.nic.in/bitstream/123456789/20063/1/a2023-47.pdf |
| Bharatiya Sakshya Adhiniyam, 2023 | Act 47 of 2023 | MHA direct (Ministry of Home Affairs, the administering ministry) | https://www.mha.gov.in/sites/default/files/2024-04/250882_english_01042024_0.pdf |

India Code (`indiacode.nic.in`) is the Legislative Department's own
consolidated-text portal — the authoritative citable text. MHA's copy is the
administering ministry's own posting, useful as a second-source check on the
same Act number. Both assented 25 Dec 2023, appointed day 1 Jul 2024.

## 2 · OFFICIAL COMPARISON TABLES — Bureau of Police Research & Development (BPR&D, under MHA)

| mapping | url |
| --- | --- |
| BNS ↔ IPC | https://bprd.nic.in/uploads/pdf/COMPARISON%20SUMMARY%20BNS%20to%20IPC%20.pdf |
| BNSS ↔ CrPC | https://bprd.nic.in/uploads/pdf/Comparison%20summary%20BNSS%20to%20CrPC.pdf |
| BSA ↔ Indian Evidence Act | https://bprd.nic.in/uploads/pdf/Comparison%20Summary%20BSA%20to%20IEA.pdf |
| index page (all BPR&D new-criminal-law docs) | https://bprd.nic.in/page/documents_by_bprd |

**This is the actual target P9 asked for** — an official government
correspondence table, not a commentary site's derived one. BPR&D is a
statutory body under MHA that ran the national training rollout for the new
codes; these three PDFs are its own section-by-section crosswalk, produced
for that purpose. Not independently verified row-by-row by this lane —
LCC's ingestion should treat BPR&D as strong primary evidence, not as
already-final ground truth, same discipline as every other provider source
in this repo (`CLAUDE.md` §6: provider signal → primary verification →
LawMind-derived object).

## 3 · TRANSITION / SAVINGS PROVISIONS — enacted text, not commentary

Each new code repeals its predecessor but preserves pending proceedings
under the old law. This determines which cases a citation to the OLD
section is still legally live for, which matters for currentness display,
not just historical search.

| provision | effect | source |
| --- | --- | --- |
| BNSS 2023 §531 | Repeals CrPC 1973; pending appeal/application/trial/inquiry/investigation continues under CrPC as if BNSS had not commenced | indiacode.nic.in PDF above, §531 |
| BSA 2023 (repeal & savings section, confirm exact number against the Act text — multiple secondary sites give 170, none of them primary) | Repeals Evidence Act 1872; pending application/trial/inquiry/investigation/proceeding/appeal continues under the old Act | indiacode.nic.in PDF above |
| BNS 2023 (repeal & savings section — confirm against Act text) | Repeals IPC 1860 | indiacode.nic.in PDF above |

**Flagged rather than asserted:** this lane found the BNSS §531 section
number corroborated by three independent secondary sources (Lexology,
AdvocateKhoj, KanoonGPT) reading the same text, so it is recorded with
confidence. The BSA and BNS section numbers were seen only on secondary
aggregator sites during this search, not read directly from the India Code
PDF text — **LCC should confirm both exact section numbers by reading the
Act PDFs above directly before using them**, per `CLAUDE.md`'s rule against
citing a section number from a secondary source. This lane did not open and
read the full PDF text this session (budget), only located and searched for
the documents.

## 4 · WHAT WAS NOT DONE

- No mapping table built or inferred by this lane.
- BSA/BNS exact repeal-section numbers not confirmed against primary text
  (see §3 caveat) — a fast follow-up, not a blocker to starting.
- No commentary/secondary source (iPleaders, Lawsikho, advocategandhi.com
  etc.) is listed above as a source to build from — they surfaced during
  search and are explicitly excluded per the mission brief
  ("commentary is supplementary evidence only").
