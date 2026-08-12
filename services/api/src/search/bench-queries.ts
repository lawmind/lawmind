/**
 * Real-shaped retrieval queries, shared by `bench.ts` (Gate S1 latency) and
 * `retrieval-regression-cli.ts` (structural regression across runs).
 *
 * **These are queries, not a gold set.** No relevance judgment is attached to
 * any of them — `docs/CURRENT_PLAN.md`'s own standing rule against inventing
 * gold answers applies here: a query an advocate would plausibly type is
 * something this file can respons`ibly assert; "and the right answer is
 * judgment X" is not, without a human or an audited source behind it. What
 * IS honestly measurable without a gold set: does a query return anything,
 * does its top result stay stable run over run, and how fast is it — that is
 * exactly what the regression tool checks.
 *
 * Labelled by shape so a regression run can report per-category, matching
 * `docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md`'s stratification intent without
 * waiting on the full graded benchmark that document scopes separately.
 */
export type BenchQuery = {
  query: string;
  shape:
    | 'concept' // a plain-language legal situation, no citation or section number
    | 'section' // names a statute section explicitly
    | 'citation' // shaped like an exact citation
    | 'case-name' // names parties
    | 'procedural'; // a procedural/forum question rather than a substantive one
};

export const BENCH_QUERIES: BenchQuery[] = [
  { query: 'anticipatory bail custodial interrogation', shape: 'concept' },
  { query: 'special leave to appeal criminal jurisdiction', shape: 'procedural' },
  { query: 'parity with co-accused in bail', shape: 'concept' },
  { query: 'dying declaration corroboration', shape: 'concept' },
  { query: 'preventive detention grounds communicated', shape: 'concept' },
  { query: 'specific performance of agreement to sell', shape: 'concept' },
  { query: 'compassionate appointment policy', shape: 'concept' },
  { query: 'dishonour of cheque legally enforceable debt', shape: 'concept' },
  { query: 'quashing of FIR inherent powers', shape: 'procedural' },
  { query: 'maintenance to wife and minor children', shape: 'concept' },
  { query: 'Section 138 Negotiable Instruments Act', shape: 'section' },
  { query: 'Section 482 CrPC inherent powers', shape: 'section' },
  { query: 'Section 34 Specific Relief Act', shape: 'section' },
  { query: 'Article 226 writ jurisdiction alternative remedy', shape: 'section' },
  { query: 'bail under Section 439 CrPC', shape: 'section' },
  { query: 'State of Punjab v. Baldev Singh', shape: 'case-name' },
  { query: 'K.M. Nanavati v. State of Maharashtra', shape: 'case-name' },
  { query: 'Kesavananda Bharati basic structure', shape: 'case-name' },
  { query: 'transfer petition matrimonial dispute jurisdiction', shape: 'procedural' },
  { query: 'condonation of delay sufficient cause', shape: 'procedural' },
];
