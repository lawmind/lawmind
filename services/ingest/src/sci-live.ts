import { createHash } from 'node:crypto';

import postgres, { type Sql } from 'postgres';

import { contentHash, upsertJudgments } from './load.ts';
import { toCaseType, type JudgmentRecord } from './sci.ts';
import { extractPdfBytes, isNativeText, warmPdfEngine } from './text.ts';

export const SCI_HOME = 'https://www.sci.gov.in/';
export const SCI_PUBLIC_CONDITIONS = 'sci-public-official-v1';

export type SciLiveCandidate = {
  viewUrl: string;
  pdfUrl: string;
  diaryNumber: string;
  caseTitle: string;
  caseNumber: string | null;
  judgmentDate: string;
  uploadedAt: string | null;
};

export type SciLiveResult = {
  observed: number;
  verified: number;
  inserted: number;
  linked: number;
  ambiguous: number;
  refused: number;
  newestSourceDate: string | null;
};

const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateFromDmy(value: string): string {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) throw new Error(`invalid SCI date ${value}`);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function uploadedIso(body: string): string | null {
  const match = /Uploaded On\s+(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/i.exec(body);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}+05:30`;
}

/**
 * Parse only links the Court labels `type=j` in the server-rendered Judgments
 * feed. Orders (`type=o`) and Landmark Judgment Summaries are intentionally not
 * candidates, even though both are hosted on sci.gov.in.
 */
export function parseSciJudgmentFeed(html: string): SciLiveCandidate[] {
  const candidates: SciLiveCandidate[] = [];
  const anchors = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchors)) {
    const href = match[1];
    const body = match[2];
    if (!href || !body) continue;
    let url: URL;
    try {
      url = new URL(href, SCI_HOME);
    } catch {
      continue;
    }
    if (!url.pathname.includes('/view-pdf/') || url.searchParams.get('type') !== 'j') continue;
    if (url.searchParams.get('from') !== 'latest_judgements_order') continue;
    const date = url.searchParams.get('order_date');
    const diaryNumber = url.searchParams.get('diary_no');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !diaryNumber) continue;

    const label = decodeHtml(body);
    const identity = /^(.*?)\s+-\s+(.+?\bNo\.\s*.+?\/\d{4})\s+-\s+Diary Number\s+\d+\s*\/\s*\d{4}\s+-\s+\d{2}-[A-Za-z]{3}-\d{4}/i.exec(label);
    const caseTitle = (identity?.[1] ?? label.split(/\s+-\s+Diary Number/i)[0] ?? label).trim();
    const caseNumber = identity?.[2]?.trim() ?? null;
    const pdfUrl = new URL(url.toString());
    pdfUrl.pathname = pdfUrl.pathname.replace('/view-pdf/', '/sci-get-pdf/');
    candidates.push({
      viewUrl: url.toString(),
      pdfUrl: pdfUrl.toString(),
      diaryNumber,
      caseTitle,
      caseNumber,
      judgmentDate: date,
      uploadedAt: uploadedIso(body),
    });
  }
  return [...new Map(candidates.map((candidate) => [candidate.pdfUrl, candidate])).values()];
}

export function officialSciRole(url: string, label = ''):
  | 'judgment_pdf'
  | 'order_pdf'
  | 'editorial_summary'
  | 'unrelated' {
  const lower = `${url} ${label}`.toLowerCase();
  if (lower.includes('landmark-judgment-summaries') || lower.includes('judgment summary')) {
    return 'editorial_summary';
  }
  try {
    const parsed = new URL(url, SCI_HOME);
    if (parsed.searchParams.get('type') === 'j') return 'judgment_pdf';
    if (parsed.searchParams.get('type') === 'o') return 'order_pdf';
  } catch {
    return 'unrelated';
  }
  return 'unrelated';
}

function isJudgmentText(text: string): boolean {
  const upper = text.slice(0, 20_000).toUpperCase();
  const summaryDisclaimer =
    upper.includes('LANDMARK JUDGMENT SUMMARY') ||
    (upper.includes('NOT PART OF THE DECISION') && upper.includes('LEGAL PROCEEDINGS'));
  return upper.includes('IN THE SUPREME COURT OF INDIA') && !summaryDisclaimer;
}

export function neutralCitation(text: string): string | null {
  const match = /\b(20\d{2}\s+INSC\s+(\d+))(?!\d)/i.exec(text.slice(0, 12_000));
  if (!match?.[1] || !match[2]) return null;
  // PDF text extraction can concatenate the page number to the neutral-citation
  // number. Observed live: `2026 INSC 9191\nREPORTABLE` on page 1 while adjacent
  // official judgments are 920 and 922. That string cannot be split truthfully
  // without another official identity source, so abstain instead of publishing
  // the invented citation 9191 (or guessing 919).
  const tail = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 40);
  if (match[2].length >= 4 && match[2].endsWith('1') && /^\s*(?:NON-)?REPORTABLE\b/i.test(tail)) {
    return null;
  }
  return match[1].toUpperCase().replace(/\s+/g, ' ');
}

function caseType(caseNumber: string | null): 'civil' | 'criminal' | null {
  if (!caseNumber) return null;
  if (/\b(?:Crl\.?\s*A\.?|Criminal)\b/i.test(caseNumber)) return 'criminal';
  if (/\b(?:C\.?\s*A\.?|Civil)\b/i.test(caseNumber)) return 'civil';
  return toCaseType(caseNumber);
}

async function fetchLedger(
  sql: Sql,
  input: {
    source: string;
    endpoint: string;
    outcome: 'ok' | 'refused' | 'error';
    httpStatus?: number | undefined;
    durationMs?: number | undefined;
    refusalReason?: string | undefined;
  },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO official_source_fetch_ledger
      (source, endpoint, outcome, http_status, duration_ms, refusal_reason,
       authorization_basis, conditions_version)
    VALUES
      (${input.source}, ${input.endpoint}, ${input.outcome}, ${input.httpStatus ?? null},
       ${input.durationMs ?? null}, ${input.refusalReason ?? null},
       'public_official', ${SCI_PUBLIC_CONDITIONS})
    RETURNING id
  `;
  if (!rows[0]) throw new Error('fetch ledger insert returned no id');
  return rows[0].id;
}

async function artifact(
  sql: Sql,
  input: {
    source: 'sci_homepage' | 'sci_pdf';
    role: 'judgment_index' | 'judgment_pdf';
    state: 'observed' | 'verified_judgment' | 'duplicate_linked' | 'refused_nonjudgment' | 'fetch_failed' | 'identity_ambiguous';
    sourceUrl: string;
    sourceDocumentKey?: string | undefined;
    contentType?: string | undefined;
    bytes: Uint8Array;
    metadata: unknown;
    extractionNote?: string | undefined;
    fetchLedgerId: string;
    judgmentId?: string | undefined;
    sourceAssertedAt?: string | null | undefined;
  },
): Promise<void> {
  await sql`
    INSERT INTO official_source_artifact
      (source, artifact_role, observation_state, source_asserted_at, source_url,
       source_document_key, content_type, payload_sha256, payload_bytes, raw_bytes,
       metadata, extraction_note, authorization_basis, conditions_version,
       fetch_ledger_id, judgment_id)
    VALUES
      (${input.source}, ${input.role}, ${input.state}, ${input.sourceAssertedAt ?? null},
       ${input.sourceUrl}, ${input.sourceDocumentKey ?? null}, ${input.contentType ?? null},
       ${sha256(input.bytes)}, ${input.bytes.byteLength}, ${Buffer.from(input.bytes)},
       ${sql.json(input.metadata as Parameters<typeof sql.json>[0])}, ${input.extractionNote ?? null}, 'public_official',
       ${SCI_PUBLIC_CONDITIONS}, ${input.fetchLedgerId}, ${input.judgmentId ?? null})
  `;
}

async function identityMatches(
  sql: Sql,
  identity: { neutralCitation: string | null; caseNumber: string | null; judgmentDate: string; hash: string },
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT DISTINCT id
      FROM judgments
     WHERE (${identity.neutralCitation}::text IS NOT NULL AND upper(neutral_citation) = upper(${identity.neutralCitation}))
        OR (${identity.caseNumber}::text IS NOT NULL AND upper(case_number) = upper(${identity.caseNumber})
            AND judgment_date = ${identity.judgmentDate}::date)
        OR content_hash = ${identity.hash}
  `;
  return rows.map((row) => row.id);
}

export async function runSciLive(input: {
  databaseUrl: string;
  apply: boolean;
  limit?: number;
  fetchImpl?: typeof fetch;
}): Promise<SciLiveResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sql = postgres(input.databaseUrl, { max: 2, onnotice: () => {} });
  const result: SciLiveResult = {
    observed: 0,
    verified: 0,
    inserted: 0,
    linked: 0,
    ambiguous: 0,
    refused: 0,
    newestSourceDate: null,
  };
  try {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetchImpl(SCI_HOME, { headers: { 'user-agent': 'Lawmind/1.0 official-source canary' } });
    } catch (error) {
      await fetchLedger(sql, { source: 'sci_homepage', endpoint: SCI_HOME, outcome: 'error', durationMs: Date.now() - started, refusalReason: String(error) });
      throw error;
    }
    const homepageBytes = new Uint8Array(await response.arrayBuffer());
    const homepageLedger = await fetchLedger(sql, {
      source: 'sci_homepage',
      endpoint: SCI_HOME,
      outcome: response.ok ? 'ok' : 'error',
      httpStatus: response.status,
      durationMs: Date.now() - started,
      refusalReason: response.ok ? undefined : `HTTP ${response.status}`,
    });
    const html = new TextDecoder().decode(homepageBytes);
    const allCandidates = response.ok ? parseSciJudgmentFeed(html) : [];
    await artifact(sql, {
      source: 'sci_homepage',
      role: 'judgment_index',
      state: response.ok ? 'observed' : 'fetch_failed',
      sourceUrl: SCI_HOME,
      contentType: response.headers.get('content-type') ?? undefined,
      bytes: homepageBytes,
      metadata: { candidateCount: allCandidates.length, parser: SCI_PUBLIC_CONDITIONS },
      fetchLedgerId: homepageLedger,
    });
    if (!response.ok) throw new Error(`GET ${SCI_HOME} -> ${response.status}`);

    const candidates = allCandidates.slice(0, input.limit ?? 10);
    result.observed = candidates.length;
    result.newestSourceDate = candidates.reduce<string | null>(
      (latest, row) => (latest === null || row.judgmentDate > latest ? row.judgmentDate : latest),
      null,
    );
    await warmPdfEngine();
    for (const candidate of candidates) {
      const pdfStarted = Date.now();
      let pdfResponse: Response;
      try {
        pdfResponse = await fetchImpl(candidate.pdfUrl, { headers: { 'user-agent': 'Lawmind/1.0 official-source canary' } });
      } catch (error) {
        await fetchLedger(sql, { source: 'sci_pdf', endpoint: candidate.pdfUrl, outcome: 'error', durationMs: Date.now() - pdfStarted, refusalReason: String(error) });
        continue;
      }
      const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
      const pdfLedger = await fetchLedger(sql, {
        source: 'sci_pdf', endpoint: candidate.pdfUrl,
        outcome: pdfResponse.ok ? 'ok' : 'error', httpStatus: pdfResponse.status,
        durationMs: Date.now() - pdfStarted,
        refusalReason: pdfResponse.ok ? undefined : `HTTP ${pdfResponse.status}`,
      });
      if (!pdfResponse.ok) {
        await artifact(sql, { source: 'sci_pdf', role: 'judgment_pdf', state: 'fetch_failed', sourceUrl: candidate.pdfUrl, sourceDocumentKey: candidate.diaryNumber, contentType: pdfResponse.headers.get('content-type') ?? undefined, bytes, metadata: candidate, fetchLedgerId: pdfLedger, sourceAssertedAt: candidate.uploadedAt });
        continue;
      }

      let extracted: Awaited<ReturnType<typeof extractPdfBytes>>;
      try {
        // pdf.js may transfer/detach the ArrayBuffer it receives. The original
        // observation must remain byte-for-byte available for the append-only
        // evidence row, so extraction receives its own copy.
        extracted = await extractPdfBytes(bytes.slice(), candidate.pdfUrl);
      } catch (error) {
        await artifact(sql, { source: 'sci_pdf', role: 'judgment_pdf', state: 'fetch_failed', sourceUrl: candidate.pdfUrl, sourceDocumentKey: candidate.diaryNumber, contentType: pdfResponse.headers.get('content-type') ?? undefined, bytes, metadata: candidate, extractionNote: String(error), fetchLedgerId: pdfLedger, sourceAssertedAt: candidate.uploadedAt });
        continue;
      }
      if (!isJudgmentText(extracted.text)) {
        result.refused++;
        await artifact(sql, { source: 'sci_pdf', role: 'judgment_pdf', state: 'refused_nonjudgment', sourceUrl: candidate.pdfUrl, sourceDocumentKey: candidate.diaryNumber, contentType: pdfResponse.headers.get('content-type') ?? undefined, bytes, metadata: candidate, extractionNote: 'PDF did not satisfy official judgment text controls', fetchLedgerId: pdfLedger, sourceAssertedAt: candidate.uploadedAt });
        continue;
      }

      result.verified++;
      const citation = neutralCitation(extracted.text);
      const hash = contentHash(extracted.text);
      const matches = await identityMatches(sql, { neutralCitation: citation, caseNumber: candidate.caseNumber, judgmentDate: candidate.judgmentDate, hash });
      if (matches.length > 1) {
        result.ambiguous++;
        await artifact(sql, { source: 'sci_pdf', role: 'judgment_pdf', state: 'identity_ambiguous', sourceUrl: candidate.pdfUrl, sourceDocumentKey: candidate.diaryNumber, contentType: pdfResponse.headers.get('content-type') ?? undefined, bytes, metadata: { ...candidate, neutralCitation: citation, candidateJudgmentIds: matches }, extractionNote: 'multiple canonical identity matches; no write', fetchLedgerId: pdfLedger, sourceAssertedAt: candidate.uploadedAt });
        continue;
      }

      let judgmentId = matches[0];
      let state: 'duplicate_linked' | 'verified_judgment' = 'duplicate_linked';
      if (!judgmentId && input.apply) {
        const record: JudgmentRecord = {
          caseTitle: candidate.caseTitle,
          neutralCitation: citation,
          reporterCitations: [],
          court: 'Supreme Court of India',
          bench: null,
          judgmentDate: candidate.judgmentDate,
          fullText: extracted.text,
          language: 'en',
          sourceUrl: candidate.pdfUrl,
          caseNumber: candidate.caseNumber,
          caseType: caseType(candidate.caseNumber),
          sourceDocumentType: 'JUDGMENT',
          nativeText: isNativeText(extracted.text.length, extracted.pages),
          textExtractionMethod: extracted.method,
        };
        const load = await upsertJudgments(sql, [record]);
        result.inserted += load.inserted;
        judgmentId = (await sql<{ id: string }[]>`SELECT id FROM judgments WHERE source_url = ${candidate.pdfUrl}`)[0]?.id;
        state = 'verified_judgment';
      } else if (judgmentId) {
        result.linked++;
      }
      await artifact(sql, { source: 'sci_pdf', role: 'judgment_pdf', state: judgmentId ? state : 'verified_judgment', sourceUrl: candidate.pdfUrl, sourceDocumentKey: candidate.diaryNumber, contentType: pdfResponse.headers.get('content-type') ?? undefined, bytes, metadata: { ...candidate, neutralCitation: citation, apply: input.apply }, extractionNote: judgmentId ? `canonical judgment ${judgmentId}` : 'verified observation; canonical apply disabled', fetchLedgerId: pdfLedger, judgmentId, sourceAssertedAt: candidate.uploadedAt });
    }
    return result;
  } finally {
    await sql.end();
  }
}
