/**
 * The ten document types, and what each one needs before it can be drafted.
 *
 * `GET /documents/types` exists so the client never hardcodes this list — the
 * types are a product decision (`PRD.md`, `documents.document_type`) and a client
 * that carries its own copy drifts the moment one is added.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * requiredFields IS A CONTRACT, NOT A HINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A bail application drafted without the section charged, or without the date of
 * arrest, is not a weaker draft — it is a **wrong** one, and the advocate cannot
 * see what is missing because fluent prose fills the gap. So generation refuses
 * rather than guessing, and the field list is served from here so the client can
 * ask for everything up front.
 *
 * The fields are drawn from what the form actually requires in an Indian court,
 * not from what a model finds convenient. Nothing here is invented: where a field
 * names a statute it names the BNSS provision, because **BNS/BNSS/BSA replaced
 * IPC/CrPC/Evidence on 1 July 2024** and no frontier model knows them
 * (`DOMAIN_TRUTH.md`).
 */
import type { Context } from 'hono';

import { ok } from '../envelope.ts';

export type DocumentTypeSpec = {
  type: string;
  label: string;
  /** Without these, generation refuses. See the module note. */
  requiredFields: { name: string; label: string; kind: 'text' | 'date' | 'longtext' }[];
  /** Shown to the advocate before they start. */
  note?: string;
};

const F = {
  court: { name: 'court', label: 'Court', kind: 'text' as const },
  caseNumber: { name: 'caseNumber', label: 'Case number', kind: 'text' as const },
  applicant: { name: 'applicant', label: 'Applicant / petitioner', kind: 'text' as const },
  respondent: { name: 'respondent', label: 'Respondent', kind: 'text' as const },
  facts: { name: 'facts', label: 'Facts', kind: 'longtext' as const },
  grounds: { name: 'grounds', label: 'Grounds', kind: 'longtext' as const },
  relief: { name: 'relief', label: 'Relief sought', kind: 'longtext' as const },
};

export const DOCUMENT_TYPES: DocumentTypeSpec[] = [
  {
    type: 'bail',
    label: 'Bail application',
    requiredFields: [
      F.court,
      F.caseNumber,
      F.applicant,
      { name: 'offenceSections', label: 'Sections charged (BNS)', kind: 'text' },
      { name: 'arrestDate', label: 'Date of arrest', kind: 'date' },
      { name: 'custodyStatus', label: 'Present custody status', kind: 'text' },
      F.facts,
      F.grounds,
    ],
    // The regime turns on the date of the OFFENCE, not the date of the
    // application — DOMAIN_TRUTH.md. An offence before 1 July 2024 is charged
    // under the IPC and the application must say so.
    note: 'Sections are stated under BNS/BNSS unless the offence predates 1 July 2024.',
  },
  {
    type: 'anticipatory_bail',
    label: 'Anticipatory bail application',
    requiredFields: [
      F.court,
      F.applicant,
      { name: 'offenceSections', label: 'Sections apprehended (BNS)', kind: 'text' },
      { name: 'firNumber', label: 'FIR number, if registered', kind: 'text' },
      { name: 'apprehension', label: 'Grounds of apprehension', kind: 'longtext' },
      F.facts,
    ],
    note: 'Filed before arrest. The apprehension of arrest is the operative fact.',
  },
  {
    type: 'plaint',
    label: 'Plaint',
    requiredFields: [
      F.court,
      { name: 'plaintiff', label: 'Plaintiff', kind: 'text' },
      { name: 'defendant', label: 'Defendant', kind: 'text' },
      { name: 'causeOfAction', label: 'Cause of action', kind: 'longtext' },
      { name: 'causeOfActionDate', label: 'Date the cause of action arose', kind: 'date' },
      { name: 'suitValue', label: 'Value of the suit', kind: 'text' },
      F.facts,
      F.relief,
    ],
    // Limitation runs from the cause of action, which is why the date is
    // required rather than optional.
    note: 'The date the cause of action arose determines limitation.',
  },
  {
    type: 'written_statement',
    label: 'Written statement',
    requiredFields: [
      F.court,
      F.caseNumber,
      { name: 'plaintParas', label: 'Paragraphs of the plaint being answered', kind: 'longtext' },
      { name: 'defence', label: 'Defence', kind: 'longtext' },
    ],
  },
  {
    type: 'legal_notice',
    label: 'Legal notice',
    requiredFields: [
      { name: 'sender', label: 'On behalf of', kind: 'text' },
      { name: 'recipient', label: 'Addressed to', kind: 'text' },
      { name: 'demand', label: 'Demand', kind: 'longtext' },
      { name: 'complyBy', label: 'Time to comply', kind: 'text' },
      F.facts,
    ],
  },
  {
    type: 'notice_reply',
    label: 'Reply to legal notice',
    requiredFields: [
      { name: 'noticeDate', label: 'Date of the notice replied to', kind: 'date' },
      { name: 'sender', label: 'On behalf of', kind: 'text' },
      { name: 'recipient', label: 'Addressed to', kind: 'text' },
      { name: 'response', label: 'Response', kind: 'longtext' },
    ],
  },
  {
    type: 'affidavit',
    label: 'Affidavit',
    requiredFields: [
      F.court,
      { name: 'deponent', label: 'Deponent', kind: 'text' },
      { name: 'deponentAddress', label: 'Address of the deponent', kind: 'text' },
      { name: 'statements', label: 'Statements sworn to', kind: 'longtext' },
    ],
    note: 'The verification clause states which paragraphs are on knowledge and which on belief.',
  },
  {
    type: 'vakalatnama',
    label: 'Vakalatnama',
    requiredFields: [
      F.court,
      F.caseNumber,
      { name: 'client', label: 'Client', kind: 'text' },
      { name: 'advocateName', label: 'Advocate', kind: 'text' },
      { name: 'enrolmentNumber', label: 'Enrolment number', kind: 'text' },
    ],
  },
  {
    type: 'writ_petition',
    label: 'Writ petition',
    requiredFields: [
      F.court,
      { name: 'petitioner', label: 'Petitioner', kind: 'text' },
      F.respondent,
      { name: 'rightViolated', label: 'Right violated', kind: 'text' },
      { name: 'writType', label: 'Writ sought', kind: 'text' },
      F.facts,
      F.grounds,
      F.relief,
    ],
  },
  {
    type: 'rti',
    label: 'RTI application',
    requiredFields: [
      { name: 'publicAuthority', label: 'Public authority', kind: 'text' },
      { name: 'informationSought', label: 'Information sought', kind: 'longtext' },
      { name: 'applicant', label: 'Applicant', kind: 'text' },
    ],
  },
];

export function listDocumentTypes(c: Context): Response {
  return ok(c, {
    types: DOCUMENT_TYPES,
    /**
     * Stated rather than left for the client to discover from a 409: an account
     * with no accepted terms cannot generate a draft (PD-8), and that is the ONLY
     * thing consent gates.
     */
    consentRequired: true,
    asOf: new Date().toISOString(),
  });
}
