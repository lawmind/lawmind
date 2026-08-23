/**
 * NEW2 — DISPLAY EQUIVALENCE. What a search result page may collapse, and what
 * it must never.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT DEDUPLICATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 26.3% of citation-bearing rows share their neutral citation with another row.
 * Measured on the source PDFs (`SHARED_NEUTRAL_CITATION_TRUTH_2026-08-22.md`),
 * that is overwhelmingly the courts being complicated rather than us being
 * wrong: 53.89% duplicate ingestion, 30.74% connected matters under one common
 * order, 13.85% several orders in one case, and only 0.11% extractor
 * contamination.
 *
 * So the corpus is NOT collapsed. **Nothing in this module deletes, merges or
 * rewrites a row.** It answers one narrower question: given a set of judgments a
 * search is about to show, which of them are the SAME THING TO A READER and may
 * therefore be shown once with the rest folded behind it.
 *
 * A wrong collapse hides an authority the advocate needed. A missing collapse
 * shows the same order 253 times. Both are real, and they are not symmetric —
 * hiding is worse — so only the two classes that rest on *document* evidence
 * collapse automatically.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIVE CLASSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   BYTE_IDENTICAL_DUPLICATE        one content_hash across every member. The
 *                                   same bytes ingested more than once.
 *                                   → COLLAPSE
 *
 *   SAME_SOURCE_DOCUMENT_DUPLICATE  one source document (same source_url, or the
 *                                   same storage_key) behind members whose hashes
 *                                   differ — re-extraction, not a second
 *                                   decision.
 *                                   → COLLAPSE
 *
 *   CONNECTED_MATTER_COMMON_ORDER   one court, one date, one registry citation,
 *                                   DIFFERENT case numbers. The court disposed of
 *                                   many petitions by a single order. Each row is
 *                                   a real, separately-numbered matter.
 *                                   → GROUP, never auto-collapse
 *
 *   MULTIPLE_ORDERS_SAME_CASE       one case (same CNR, or same normalised case
 *                                   number) across different dates. Interim order,
 *                                   then final judgment.
 *                                   → GROUP, never auto-collapse: the advocate
 *                                     usually wants the LATEST, sometimes an
 *                                     earlier one, and never a silent choice.
 *
 *   DISTINCT_JUDGMENTS_SHARED_CITATION
 *                                   different authorities that happen to carry the
 *                                   same citation string.
 *                                   → NEVER group. Showing these as one judgment
 *                                     is the citation-identity failure this whole
 *                                     lane exists to prevent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REPRESENTATIVE IS CHOSEN FROM EVIDENCE, NEVER FROM ROW ORDER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ORDER BY` with no tiebreak returns whatever the heap hands back, so the same
 * query can pick a different representative on two runs and paginate the same
 * judgment onto two pages. Every criterion below is a property of the DOCUMENT,
 * applied in a fixed order, and the last one is total — so the choice is stable
 * across runs, across machines, and across a re-index.
 */

/** The classes, most collapsible first. */
export const GROUP_TYPES = [
  'BYTE_IDENTICAL_DUPLICATE',
  'SAME_SOURCE_DOCUMENT_DUPLICATE',
  'CONNECTED_MATTER_COMMON_ORDER',
  'MULTIPLE_ORDERS_SAME_CASE',
  'DISTINCT_JUDGMENTS_SHARED_CITATION',
] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

/** Only these two may be folded without a human ever having looked. */
export const AUTO_COLLAPSIBLE: readonly GroupType[] = [
  'BYTE_IDENTICAL_DUPLICATE',
  'SAME_SOURCE_DOCUMENT_DUPLICATE',
];

export function isAutoCollapsible(t: GroupType): boolean {
  return AUTO_COLLAPSIBLE.includes(t);
}

export type Member = {
  id: string;
  content_hash: string | null;
  source_url: string | null;
  storage_key: string | null;
  case_number: string | null;
  cnr: string | null;
  judgment_date: string | null;
  court: string | null;
  case_title: string | null;
  full_text_chars: number | null;
  native_text: boolean | null;
  /** 'damaged_other' and friends; null means no verdict has ever been recorded. */
  script_quality: string | null;
};

export type DisplayGroup = {
  group_id: string;
  group_type: GroupType;
  auto_collapsible: boolean;
  representative_id: string;
  representative_reason: string;
  member_ids: string[];
  members_hidden_if_collapsed: number;
  evidence: Record<string, unknown>;
  confidence: 'DOCUMENT_EVIDENCE' | 'REGISTRY_EVIDENCE' | 'WEAK';
};

const norm = (s: string | null | undefined): string =>
  String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Case numbers vary in punctuation and padding between sources. */
export function normaliseNumber(raw: string | null): string | null {
  const n = norm(raw);
  return n.length >= 4 ? n : null;
}

const distinct = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/**
 * The class of a group, decided by document evidence before registry evidence.
 *
 * Order matters: a set of byte-identical rows also shares a case number, and
 * calling it MULTIPLE_ORDERS_SAME_CASE would refuse a collapse that the bytes
 * themselves authorise.
 */
export function classify(members: readonly Member[]): GroupType {
  if (members.length < 2) return 'BYTE_IDENTICAL_DUPLICATE';

  const hashes = distinct(members.map((m) => m.content_hash).filter((h): h is string => !!h));
  if (hashes.length === 1 && members.every((m) => m.content_hash)) return 'BYTE_IDENTICAL_DUPLICATE';

  const urls = distinct(members.map((m) => m.source_url).filter((u): u is string => !!u));
  const keys = distinct(members.map((m) => m.storage_key).filter((k): k is string => !!k));
  if ((urls.length === 1 && members.every((m) => m.source_url))
    || (keys.length === 1 && members.every((m) => m.storage_key))) {
    return 'SAME_SOURCE_DOCUMENT_DUPLICATE';
  }

  const cnrs = distinct(members.map((m) => norm(m.cnr)).filter(Boolean));
  const numbers = distinct(members.map((m) => normaliseNumber(m.case_number)).filter(Boolean));
  const dates = distinct(members.map((m) => m.judgment_date).filter(Boolean));
  const courts = distinct(members.map((m) => m.court).filter(Boolean));

  // One case, several dates: orders within one proceeding.
  if ((cnrs.length === 1 || (numbers.length === 1 && courts.length === 1)) && dates.length > 1) {
    return 'MULTIPLE_ORDERS_SAME_CASE';
  }
  // One court, one date, several separately-numbered matters: a common order.
  if (courts.length === 1 && dates.length === 1 && numbers.length > 1) {
    return 'CONNECTED_MATTER_COMMON_ORDER';
  }
  return 'DISTINCT_JUDGMENTS_SHARED_CITATION';
}

/**
 * Pick the row a reader should be shown, from the document's own properties.
 *
 * Never `LIMIT 1` off an unordered scan: two runs would disagree and the same
 * judgment would appear on two pages of one result set.
 */
export function representative(members: readonly Member[]): { id: string; reason: string } {
  const score = (m: Member): readonly number[] => [
    // 1. a readable document beats an unreadable one
    m.script_quality && m.script_quality !== 'clean' ? 0 : 1,
    // 2. a real text layer beats an extraction we had to fight for
    m.native_text === true ? 1 : 0,
    // 3. more text beats less — a truncated copy is the worse copy
    m.full_text_chars ?? 0,
    // 4. a fetchable source beats one we cannot show the paper for
    m.source_url ? 1 : 0,
  ];
  const reasons = ['readable text', 'native text layer', 'longest full text', 'has a source document'];

  let best = members[0] as Member;
  let bestScore = score(best);
  let why = 'only member';
  for (const m of members.slice(1)) {
    const s = score(m);
    let decided = false;
    for (let i = 0; i < s.length; i += 1) {
      const a = s[i] as number;
      const b = bestScore[i] as number;
      if (a === b) continue;
      if (a > b) { best = m; bestScore = s; why = reasons[i] as string; }
      decided = true;
      break;
    }
    // Every document property tied. Fall through to a TOTAL order so the answer
    // is the same on every run rather than whatever the heap returned first.
    if (!decided) {
      const cmp = (m.content_hash ?? '').localeCompare(best.content_hash ?? '') || m.id.localeCompare(best.id);
      if (cmp < 0) { best = m; bestScore = s; why = 'tied on every document property; lowest content_hash then lowest id'; }
    }
  }
  return { id: best.id, reason: why };
}

/**
 * A group id that is stable for the same membership and says nothing about
 * order. Two runs over the same rows produce the same id; adding a member
 * changes it, which is correct — the group is different.
 */
export function groupId(members: readonly Member[]): string {
  const ids = [...members.map((m) => m.id)].sort();
  // FNV-1a over the sorted ids. Short, stable, and not a claim of security.
  let h = 0x811c9dc5;
  for (const ch of ids.join('|')) {
    h ^= ch.codePointAt(0) as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `dg_${h.toString(16).padStart(8, '0')}_${ids.length}`;
}

export function buildGroup(members: readonly Member[]): DisplayGroup {
  const group_type = classify(members);
  const rep = representative(members);
  const hashes = distinct(members.map((m) => m.content_hash).filter(Boolean));
  const dates = distinct(members.map((m) => m.judgment_date).filter(Boolean));
  const numbers = distinct(members.map((m) => normaliseNumber(m.case_number)).filter(Boolean));
  const auto = isAutoCollapsible(group_type);
  return {
    group_id: groupId(members),
    group_type,
    auto_collapsible: auto,
    representative_id: rep.id,
    representative_reason: rep.reason,
    member_ids: [...members.map((m) => m.id)].sort(),
    members_hidden_if_collapsed: auto ? members.length - 1 : 0,
    evidence: {
      members: members.length,
      distinct_content_hashes: hashes.length,
      distinct_dates: dates.length,
      distinct_case_numbers: numbers.length,
      distinct_courts: distinct(members.map((m) => m.court).filter(Boolean)).length,
    },
    confidence: group_type === 'BYTE_IDENTICAL_DUPLICATE' || group_type === 'SAME_SOURCE_DOCUMENT_DUPLICATE'
      ? 'DOCUMENT_EVIDENCE'
      : group_type === 'DISTINCT_JUDGMENTS_SHARED_CITATION' ? 'WEAK' : 'REGISTRY_EVIDENCE',
  };
}
