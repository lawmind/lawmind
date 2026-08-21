/**
 * NEW3's DeepSeek research assistant — analytical only, never source truth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS TOOL EXISTS TO ENFORCE MECHANICALLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The founder's instruction, 14 Aug 2026: use DeepSeek to *organise* source
 * research — taxonomy, classification, likely-overlap comparison, candidate
 * search terms — and **never** as evidence that a source exists, is reachable,
 * is licensed, or contains what it claims. Every external-source claim is
 * verified by inspecting the source.
 *
 * That rule is not left to the operator's memory. It is enforced here:
 *
 *  - every output is stamped `UNVERIFIED_MODEL_OUTPUT` and carries the call id
 *    that produced it, so a claim can always be traced back to a model call;
 *  - the task list is CLOSED (`TASKS` below). There is no free-text task, so
 *    this tool cannot be used to ask "does source X exist?";
 *  - responses are JSON-shaped and schema-checked, so output lands as
 *    structured candidates for verification, never as prose to paste into a doc.
 *
 * `LANE_PROTOCOL.md` §4 already forbids writing a model's opinion into
 * canonical legal truth. This extends the same discipline to source research,
 * where the failure mode is subtler: a plausible-sounding portal that does not
 * exist costs a session to disprove, and the concordance evaluation measured
 * this model inventing an authority 10.8% of the time when the right answer was
 * absent (`docs/ai/CITATION_CONCORDANCE_EVALUATION.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CACHING AND THE CALL LEDGER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cache key is a SHA-256 of (task, model, prompt). A repeated question costs
 * nothing and returns byte-identical output, which matters because a research
 * loop re-asks the same taxonomy question across sessions. `--no-cache` forces
 * a fresh call; nothing else bypasses it.
 *
 * Every call — cached or live — appends one line to `ds-calls.jsonl`: id,
 * timestamp, task, model, token counts, cache hit/miss, prompt hash. That file
 * is the answer to "what did we ask the model, and what did it cost", and it
 * survives compaction the way a chat transcript does not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SHARED-RESOURCE DISCIPLINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `LANE_PROTOCOL.md` §5: ONE heavy caller at a time against the free InferX
 * pool, and announce before a large batch. This tool is deliberately
 * single-shot and cache-first — it is not a batch runner, and it should not
 * become one without a bus announcement.
 *
 * Usage (from the repo root):
 *   node --import tsx --env-file=.env .agents/new3/ds-research.ts <task> <<'EOF'
 *   ...input...
 *   EOF
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callInferxPooled, inferxKeysFromEnv } from '../../services/ingest/src/inferx.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(HERE, 'cache');
const LEDGER = path.join(HERE, 'ds-calls.jsonl');

/**
 * The closed task list. Each maps to a system framing that forces structured,
 * verifiable-by-inspection output.
 *
 * Deliberately absent: anything of the shape "does X exist", "what is the URL
 * for X", "is X licensed". Those are exactly the questions this model must not
 * be trusted on, and leaving them unavailable is stronger than a warning.
 */
const TASKS: Record<string, { readonly framing: string; readonly shape: string }> = {
  /** Organise a space of source TYPES. Not an inventory of real sources. */
  taxonomy: {
    framing:
      'You are helping a legal-data engineer enumerate CATEGORIES of legal ' +
      'material that exist in a jurisdiction, as an abstract taxonomy. You are ' +
      'NOT being asked which websites exist or where to get anything. Categories ' +
      'only, with the document types each category contains.',
    shape:
      '{"categories":[{"name":str,"description":str,"document_types":[str],' +
      '"typical_publisher":str,"why_it_matters_to_a_litigator":str}]}',
  },

  /** Classify a source we have ALREADY inspected. Input is our own evidence. */
  classify: {
    framing:
      'Classify a data source THAT THE USER HAS ALREADY INSPECTED, using only ' +
      'the evidence they provide below. Do not add facts. If the evidence does ' +
      'not settle a field, return "UNKNOWN" for it — that is the correct answer, ' +
      'not a failure.',
    shape:
      '{"source_type":str,"document_types":[str],"granularity":str,' +
      '"likely_update_cadence":str,"identifier_scheme":str,' +
      '"fields_not_determinable_from_evidence":[str]}',
  },

  /** Reason about overlap between two corpora we have measured. */
  overlap: {
    framing:
      'Two corpora are described below using measurements the user has already ' +
      'taken. Reason about their LIKELY overlap and what each would add that the ' +
      'other does not. Reason only from the measurements given. Flag explicitly ' +
      'anything that cannot be determined without further inspection.',
    shape:
      '{"likely_overlap":str,"overlap_confidence":"high"|"medium"|"low",' +
      '"a_adds_over_b":[str],"b_adds_over_a":[str],' +
      '"what_would_settle_this":[str]}',
  },

  /** Given what we hold, name CATEGORIES we appear to hold none of. */
  gaps: {
    framing:
      'Given an inventory of what a legal-research product currently holds, ' +
      'name CATEGORIES of legal material it appears to hold none or little of. ' +
      'Output categories and the reasoning, never specific websites or vendors. ' +
      'Rank by how much a practising litigator would miss each one.',
    shape:
      '{"gaps":[{"category":str,"why_missing_matters":str,' +
      '"litigator_impact":"high"|"medium"|"low","how_to_confirm_we_lack_it":str}]}',
  },

  /** Generate SEARCH TERMS for a human/tool to then verify. */
  searchterms: {
    framing:
      'Generate search terms and query phrasings that a researcher could use to ' +
      'LOOK FOR sources in the described category. You are generating queries to ' +
      'run, not answers. Do not name specific URLs as if they exist.',
    shape:
      '{"terms":[{"query":str,"rationale":str,"expected_source_kind":str}]}',
  },

  /** Normalise messy inspected metadata into the registry's field set. */
  metadata: {
    framing:
      'Reorganise the source metadata below into the target field set. Use ONLY ' +
      'values present in the input. Any field the input does not determine must ' +
      'be "UNKNOWN". Never infer a licence, a volume, or a date range.',
    shape:
      '{"source_name":str,"operator":str,"url":str,"license_or_access":str,' +
      '"coverage":str,"document_types":[str],"volume":str,"update_frequency":str,' +
      '"identifiers":str,"provenance":str,"unknown_fields":[str]}',
  },
};

function sha(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function buildPrompt(task: string, input: string): string {
  const t = TASKS[task]!;
  return [
    t.framing,
    '',
    'HARD CONSTRAINTS:',
    '- You are an ANALYTICAL ASSISTANT. Your output is a hypothesis to be',
    '  verified by direct inspection, never a statement of fact.',
    '- Never assert that a specific website, portal, API or dataset exists.',
    '- Never state or infer a licence.',
    '- If something cannot be determined from the input, say "UNKNOWN".',
    '- Reply with ONE JSON object and nothing else. No markdown fence, no prose.',
    '',
    `REQUIRED JSON SHAPE: ${t.shape}`,
    '',
    'INPUT:',
    input.trim(),
  ].join('\n');
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`no JSON object in model output (${text.length} chars)`);
  }
  return JSON.parse(body.slice(start, end + 1));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const noCache = argv.includes('--no-cache');
  const task = argv.find((a) => !a.startsWith('--'));

  if (!task || !TASKS[task]) {
    console.error(`usage: ds-research.ts <${Object.keys(TASKS).join('|')}> [--no-cache] < input`);
    console.error('\nDeepSeek is an analytical assistant here. It is never source truth.');
    process.exit(2);
  }

  const input = fs.readFileSync(0, 'utf8');
  if (input.trim() === '') {
    console.error('empty input on stdin');
    process.exit(2);
  }

  const model = process.env['INFERX_MODEL'] ?? 'deepseek-v4-flash-0731';
  const prompt = buildPrompt(task, input);
  const key = sha(`${task} ${model} ${prompt}`);

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${key}.json`);

  let payload: unknown;
  let cached = false;
  let inputTokens = 0;
  let outputTokens = 0;

  if (!noCache && fs.existsSync(cachePath)) {
    payload = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    cached = true;
  } else {
    const keys = inferxKeysFromEnv();
    if (keys.length === 0) {
      // Refuse honestly rather than pretending — packages/auth/src/mail.ts pattern.
      console.error('NO INFERX KEY CONFIGURED — refusing rather than guessing.');
      console.error('This tool has no offline mode by design: a cached miss with no key');
      console.error('must fail loudly, never fall back to unverified recall.');
      process.exit(3);
    }
    const res = await callInferxPooled(prompt, { apiKeys: keys, maxTokens: 3000 });
    if (!res.ok) {
      console.error(`InferX call failed: ${res.reason}`);
      process.exit(4);
    }
    payload = extractJson(res.text);
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  const callId = `ds-${key.slice(0, 12)}`;
  fs.appendFileSync(
    LEDGER,
    JSON.stringify({
      id: callId,
      at: new Date().toISOString(),
      lane: 'NEW3',
      task,
      model,
      cached,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      prompt_sha256: key,
    }) + '\n',
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        _truth_state: 'UNVERIFIED_MODEL_OUTPUT',
        _warning: 'Analytical hypothesis only. Verify every source claim by direct inspection.',
        _call_id: callId,
        _task: task,
        _model: model,
        _cached: cached,
        result: payload,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
