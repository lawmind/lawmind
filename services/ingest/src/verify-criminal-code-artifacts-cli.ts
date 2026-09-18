import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { extractPdfBytes, warmPdfEngine } from './text.ts';

const OUTPUT = resolve('docs/ai/lcc/criminal-code-official-artifacts.json');

const sources = [
  {
    key: 'ipc_1860',
    role: 'predecessor_enacted_text',
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/5d3f98b8-a7c9-4723-bef8-96956c6128c3/content',
    title: /THE INDIAN PENAL CODE/i,
    provision: /ACT NO\.?\s*45 OF 1860/i,
  },
  {
    key: 'crpc_1973',
    role: 'predecessor_enacted_text',
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/617b8548-fc73-4e7b-97dd-a888ca539445/content',
    title: /THE CODE OF CRIMINAL PROCEDURE,?\s*1973/i,
    provision: /ACT No\.?\s*2 OF 1974/i,
  },
  {
    key: 'iea_1872',
    role: 'predecessor_enacted_text',
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/391549c2-cca2-4fb8-9053-c1bb0f3cbb22/content',
    title: /THE INDIAN EVIDENCE ACT,?\s*1872/i,
    provision: /ACT NO\.?\s*1 OF 1872/i,
  },
  {
    key: 'bns_2023',
    role: 'current_enacted_text_and_savings',
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/9a436cb9-d2e9-44fc-a0d4-9576650f970f/content',
    title: /THE BHARATIYA NYAYA SANHITA,?\s*2023/i,
    provision: /358\.\s*Repeal and savings/i,
  },
  {
    key: 'bnss_2023',
    role: 'current_enacted_text_and_savings',
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/0b51caf8-953f-4cbc-9276-99f20f204d40/content',
    title: /THE BHARATIYA NAGARIK SURAKSHA SANHITA,?\s*2023/i,
    provision: /531\.\s*Repeal and savings/i,
  },
  {
    key: 'bsa_2023',
    role: 'current_enacted_text_and_savings',
    url: 'https://indiacode.gov.in/server/api/core/bitstreams/172794f1-d29f-4568-aa3d-f0407c4b61a8/content',
    title: /THE BHARATIYA SAKSHYA ADHINIYAM,?\s*2023/i,
    provision: /170\.\s*Repeal and savings/i,
  },
] as const;

await warmPdfEngine();
const artifacts = [];
for (const source of sources) {
  const started = Date.now();
  const response = await fetch(source.url, {
    headers: { 'user-agent': 'Lawmind/1.0 official-artifact-verifier' },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const pdfMagic = bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
  let text = '';
  let pages: number | null = null;
  let method: string | null = null;
  let extractionError: string | null = null;
  if (response.ok && pdfMagic) {
    try {
      const extracted = await extractPdfBytes(bytes, source.url);
      text = extracted.text;
      pages = extracted.pages;
      method = extracted.method;
    } catch (error) {
      extractionError = String(error);
    }
  } else if (response.ok && (response.headers.get('content-type') ?? '').includes('text/plain')) {
    text = new TextDecoder().decode(bytes);
    method = 'official_text_bitstream';
  }
  const titleMatch = source.title.exec(text);
  const provisionMatch = source.provision.exec(text);
  const provisionOffset = provisionMatch?.index ?? -1;
  artifacts.push({
    key: source.key,
    role: source.role,
    url: source.url,
    observedAt: new Date().toISOString(),
    httpStatus: response.status,
    contentType: response.headers.get('content-type'),
    durationMs: Date.now() - started,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    payloadKind: pdfMagic
      ? 'pdf'
      : method === 'official_text_bitstream'
        ? 'official_text_bitstream'
        : 'unexpected',
    pages,
    extractionMethod: method,
    extractionError,
    titleVerified: titleMatch !== null,
    requiredProvisionVerified: provisionMatch !== null,
    provisionEvidence:
      provisionOffset < 0 ? null : text.slice(provisionOffset, provisionOffset + 1800),
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceClass: 'official_primary_artifacts',
  legalStatusAdoption: 'PENDING_ADVOCATE_SIGNOFF',
  caution:
    'Artifact identity and enacted savings text are machine-observed. Product legal-status rules remain inactive until advocate signoff under DOMAIN_TRUTH.md.',
  artifacts,
  allVerified: artifacts.every(
    (row) =>
      row.httpStatus === 200 &&
      row.payloadKind !== 'unexpected' &&
      row.titleVerified &&
      row.requiredProvisionVerified,
  ),
};
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      output: OUTPUT,
      allVerified: report.allVerified,
      artifacts: artifacts.map((row) => ({
        key: row.key,
        status: row.httpStatus,
        bytes: row.bytes,
        sha256: row.sha256,
        title: row.titleVerified,
        provision: row.requiredProvisionVerified,
      })),
    },
    null,
    2,
  ),
);
