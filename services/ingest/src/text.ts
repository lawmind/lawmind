import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Fetches a judgment PDF and returns its text. **The PDF is never written to
 * disk** — Stage 1 alone is ~15 GB of PDFs and the text is a fraction of that.
 */
export async function fetchPdfText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return normaliseWhitespace(text);
}

/**
 * Column-extracted PDF text arrives with ragged spacing and hard-wrapped lines.
 * Collapsing it matters twice over: `to_tsvector` tokenises on it, and chunk
 * boundaries are measured in characters.
 */
export function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
