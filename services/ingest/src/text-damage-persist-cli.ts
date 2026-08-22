/**
 * NEW2 — MAKE THE PROOF-GRADE DAMAGE VERDICT QUERYABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES, IN ONE SENTENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `text-damage-cli.ts --export` has convicted **1,626,762 documents** and every
 * one of those verdicts lives in a 1 GB JSONL file that no consumer can join
 * against. LCC's `0070` built `text_safety_grade` with a `PROOF` value that is
 * *deliberately unreachable* — its own migration comment says so — because
 * "NEW2 emits JSONL, not a column value". NEW1 quarantines on
 * `text_safety = 'UNSAFE_VERIFIED'`, which reads `script_quality`. So a document
 * we have PROVEN is a glyph dump is still eligible for the GPU unless a screen
 * of lesser evidence happens to convict it independently.
 *
 * This writes the verdict where the contract can see it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DOES NOT CONTRADICT `text-damage-cli.ts`'s "IT WRITES NOTHING TO THE
 * DATABASE — DELIBERATELY"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * That file's objection is precise and it is right: *"a stored verdict from a
 * superseded detector is indistinguishable from a current one"*. The objection
 * is to an UNVERSIONED write, not to a write.
 *
 * `script_quality_method` is the version. Every row this writes carries
 * `text-damage-v2.0`, so a later detector's rows are distinguishable by a
 * `WHERE`, a superseded population is revocable by a `WHERE`, and the grade
 * allow-list in `0070` keys off exactly that string. The export remains the
 * artefact of record and this is its index.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REFUSED, AND THE REFUSAL IS THE INTERESTING PART
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `text-damage.ts` treats eight reasons as VERIFIED. Two of them —
 * `SCRIPT_DAMAGE_STORED` and `LEGACY_FONT_ASCII_STORED` — are not evidence
 * about the text at all. They are the detector READING BACK `script_quality`.
 * Writing those to `script_quality` would be a circular proof: the column would
 * cite itself as its own evidence, at PROOF grade, forever.
 *
 * So a row is written only when at least one INTRINSIC reason fired — evidence
 * found in the character stream itself. **56,641 rows of the export carry only
 * stored-echo evidence and this refuses every one of them.** They are already
 * convicted anyway, by the verdict they echoed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT NEVER OVERWRITES ANOTHER WRITER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `AND j.script_quality IS NULL`, in the statement, not in the page query — LCC's
 * `text-safety-screen-cli.ts` is walking the same column at ~1,100 rows/s right
 * now, and a row can be claimed between our read and our write. Whoever arrives
 * first keeps it. Where LCC's density screen convicted a row first, that row
 * grades `SCREEN` on evidence that is genuinely weaker than ours, and the fix
 * for that is a deliberate upgrade pass (`--upgrade-screen`) that changes the
 * METHOD and never the VALUE — no consumer predicate moves, because
 * `axis_b_text` has refused both grades since `0056`.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/text-damage-persist-cli.ts --confirm
 *
 *   # dry run first — prints exactly what it would write and touches nothing
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/text-damage-persist-cli.ts
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { openDb } from './db-host.ts';
import { withTransientRetry } from './db-transient.ts';
import { TEXT_DAMAGE_VERSION } from './text-damage.ts';

/**
 * The reasons that are evidence ABOUT THE TEXT, as opposed to evidence about
 * what some earlier writer already believed.
 *
 * `NO_TEXT` is intrinsic and is the plainest form of it: the extraction is
 * empty. The two `*_STORED` reasons are deliberately absent — see the header.
 */
const INTRINSIC_REASONS: ReadonlySet<string> = new Set([
  'NO_TEXT',
  'GLYPH_CODE_DUMP',
  'PRIVATE_USE_AREA',
  'REPLACEMENT_CHAR',
  'WORD_SPACING_DESTROYED',
  'LEADING_CHAR_DELETION',
]);

/**
 * The stored vocabulary value.
 *
 * `damaged_other` and not a new value, for the reason LCC recorded in
 * `text-safety-screen-cli.ts`: a new value costs an `ALTER TABLE` on an 18.7M
 * row table that four live writers never let go quiet, and the (value, method)
 * pair already carries everything the new value would have. `0070`'s
 * `text_safety` map already routes `damaged_other` to `UNSAFE_VERIFIED`, which
 * is the state NEW1's quarantine reads.
 */
const STORED_VALUE = 'damaged_other';

/** LCC's density screen, the only method this is willing to upgrade over. */
const SCREEN_METHOD_PREFIX = 'english_density_screen_';

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};

const CONFIRM = process.argv.includes('--confirm');
const RESTART = process.argv.includes('--restart');
const UPGRADE_SCREEN = process.argv.includes('--upgrade-screen');
const BATCH = Number(argOf('batch', '2000'));
const LIMIT = Number(argOf('limit', '0'));
const IN = argOf('in', '../../docs/ops/migration/new2-text-damage.jsonl')!;

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CKPT = join(here, '..', '.checkpoints', 'text-damage-persist.json');
const JSON_OUT = argOf('json', '../../docs/ops/new2/text-damage-persist.json')!;

type Checkpoint = {
  detector: string;
  /** Lines of the JSONL already consumed. The export only ever APPENDS, so a
   *  line offset is a stable cursor in a way an id would not be. */
  line: number;
  read: number;
  intrinsic: number;
  refusedStoredEcho: number;
  written: number;
  upgraded: number;
  /** Rows we tried to claim and someone else had already claimed. Not a
   *  failure — it is the number that tells us how much LCC's screen reached
   *  first, which is the only way to know whether an upgrade pass is worth it. */
  alreadyClaimed: number;
  byCourt: Record<string, number>;
  startedAt: string;
  updatedAt: string;
};

function fresh(): Checkpoint {
  return {
    detector: TEXT_DAMAGE_VERSION,
    line: 0,
    read: 0,
    intrinsic: 0,
    refusedStoredEcho: 0,
    written: 0,
    upgraded: 0,
    alreadyClaimed: 0,
    byCourt: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadCheckpoint(): Checkpoint {
  if (RESTART || !existsSync(CKPT)) return fresh();
  try {
    const c = JSON.parse(readFileSync(CKPT, 'utf8')) as Checkpoint;
    /* A checkpoint written by a different detector version would resume a walk
     * whose earlier half means something else. Refuse rather than continue. */
    if (c.detector !== TEXT_DAMAGE_VERSION) {
      console.error(
        `checkpoint at ${CKPT} was written by "${c.detector}" and this build is ` +
          `"${TEXT_DAMAGE_VERSION}" — pass --restart if that is intended`,
      );
      process.exit(2);
    }
    return c;
  } catch {
    return fresh();
  }
}

function saveCheckpoint(c: Checkpoint): void {
  mkdirSync(dirname(CKPT), { recursive: true });
  c.updatedAt = new Date().toISOString();
  writeFileSync(CKPT, JSON.stringify(c, null, 1));
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL unset');
  process.exit(2);
}
if (!existsSync(IN)) {
  console.error(`export not found at ${IN} — run text-damage-cli.ts --export first`);
  process.exit(2);
}

/** 10-minute statement timeout, the same as LCC's screen: this box runs a GPU
 *  walk, a classifier and that screen at once and a batch UPDATE has already
 *  hit 57014 once under exactly that load. */
const sql = await openDb(url, 2, 10 * 60_000);
const ckpt = loadCheckpoint();
const started = Date.now();

console.log(
  `${CONFIRM ? 'WRITING' : 'DRY RUN'} — ${TEXT_DAMAGE_VERSION} verdicts from ${IN}` +
    (ckpt.line > 0 ? `, resuming at line ${ckpt.line.toLocaleString()}` : '') +
    (UPGRADE_SCREEN ? ', upgrading screen-grade rows' : ''),
);

/**
 * Claim a page.
 *
 * Two statements rather than one, because they answer different questions and
 * only the first is uncontroversial. The `IS NULL` claim is a write nobody else
 * has made; the upgrade rewrites a method LCC wrote, keeping the value
 * identical, and it only ever runs when asked for by flag.
 */
async function writeBatch(ids: string[]): Promise<{ written: number; upgraded: number }> {
  if (!CONFIRM || ids.length === 0) return { written: 0, upgraded: 0 };

  const written = await withTransientRetry('claim', async () => {
    const rows = await sql`
      UPDATE judgments AS j
         SET script_quality = ${STORED_VALUE},
             script_quality_method = ${TEXT_DAMAGE_VERSION},
             script_quality_at = now()
       WHERE j.id = ANY(${ids}::uuid[])
         -- In the statement, not the page query. LCC's screen is walking this
         -- same column live and may claim a row between our read and our write.
         AND j.script_quality IS NULL
      RETURNING 1`;
    return rows.length;
  });

  let upgraded = 0;
  if (UPGRADE_SCREEN) {
    upgraded = await withTransientRetry('upgrade', async () => {
      const rows = await sql`
        UPDATE judgments AS j
           SET script_quality_method = ${TEXT_DAMAGE_VERSION},
               script_quality_at = now()
         WHERE j.id = ANY(${ids}::uuid[])
           -- The VALUE is already what we would write. Only the evidence grade
           -- moves, so no consumer predicate can change underneath anyone.
           AND j.script_quality = ${STORED_VALUE}
           AND j.script_quality_method LIKE ${SCREEN_METHOD_PREFIX + '%'}
        RETURNING 1`;
      return rows.length;
    });
  }

  return { written, upgraded };
}

const rl = createInterface({
  input: createReadStream(IN, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

let line = 0;
let pending: string[] = [];
let pendingCourts: string[] = [];

async function flush(): Promise<void> {
  if (pending.length === 0) return;
  const { written, upgraded } = await writeBatch(pending);
  ckpt.written += written;
  ckpt.upgraded += upgraded;
  /* Rows we reached and could not claim. Under --confirm this is real
   * contention; in a dry run every row reads as unclaimed because nothing was
   * attempted, so the figure is only printed when it means something. */
  if (CONFIRM) ckpt.alreadyClaimed += pending.length - written;
  for (const c of pendingCourts) ckpt.byCourt[c] = (ckpt.byCourt[c] ?? 0) + 1;
  ckpt.line = line;
  pending = [];
  pendingCourts = [];
  saveCheckpoint(ckpt);

  const rate = Math.round(ckpt.read / Math.max(1, (Date.now() - started) / 1000));
  console.log(
    `  ${ckpt.read.toLocaleString()} read · ${ckpt.intrinsic.toLocaleString()} intrinsic · ` +
      `${ckpt.written.toLocaleString()} written` +
      (UPGRADE_SCREEN ? ` · ${ckpt.upgraded.toLocaleString()} upgraded` : '') +
      ` · ${rate}/s`,
  );
}

for await (const raw of rl) {
  line += 1;
  if (line <= ckpt.line) continue;
  if (LIMIT > 0 && ckpt.read >= LIMIT) break;

  let row: {
    documentId?: string;
    court?: string;
    verdict?: string;
    verifiedReasons?: string[];
    detector?: string;
  };
  try {
    row = JSON.parse(raw) as typeof row;
  } catch {
    continue;
  }

  ckpt.read += 1;

  /* A SUSPECT row is not a proof-grade verdict and must never become one. The
   * export writes VERIFIED only unless `--suspect` was passed, so this is a
   * guard against an export that was, not an expected branch. */
  if (row.verdict !== 'TEXT_UNSAFE_VERIFIED') continue;
  if (row.detector !== TEXT_DAMAGE_VERSION) continue;
  if (!row.documentId) continue;

  const reasons = row.verifiedReasons ?? [];
  if (!reasons.some((r) => INTRINSIC_REASONS.has(r))) {
    ckpt.refusedStoredEcho += 1;
    continue;
  }

  ckpt.intrinsic += 1;
  pending.push(row.documentId);
  pendingCourts.push(row.court ?? 'unknown');

  if (pending.length >= BATCH) await flush();
}

await flush();
ckpt.line = line;
saveCheckpoint(ckpt);

const elapsed = Math.round((Date.now() - started) / 1000);
console.log(
  `\n${CONFIRM ? 'WROTE' : 'WOULD WRITE'} — ${TEXT_DAMAGE_VERSION}, ${elapsed}s\n` +
    `  export rows read            ${ckpt.read.toLocaleString()}\n` +
    `  intrinsic proof evidence    ${ckpt.intrinsic.toLocaleString()}\n` +
    `  refused (stored echo only)  ${ckpt.refusedStoredEcho.toLocaleString()}\n` +
    `  script_quality claimed      ${ckpt.written.toLocaleString()}\n` +
    (UPGRADE_SCREEN ? `  screen rows upgraded        ${ckpt.upgraded.toLocaleString()}\n` : '') +
    (CONFIRM
      ? `  already claimed by another  ${ckpt.alreadyClaimed.toLocaleString()}\n`
      : '  (dry run — nothing written)\n'),
);

const top = Object.entries(ckpt.byCourt)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12);
for (const [court, n] of top) console.log(`  ${String(n).padStart(9)}  ${court}`);

mkdirSync(dirname(JSON_OUT), { recursive: true });
writeFileSync(
  JSON_OUT,
  JSON.stringify(
    {
      storedValue: STORED_VALUE,
      method: TEXT_DAMAGE_VERSION,
      confirmed: CONFIRM,
      upgradeScreen: UPGRADE_SCREEN,
      ...ckpt,
    },
    null,
    1,
  ),
);

await sql.end({ timeout: 5 });
