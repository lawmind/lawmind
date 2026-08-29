/**
 * The M0 identity receipt — the smallest committed object that lets someone
 * else check our frozen denominator.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM IT SOLVES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate A's High Court denominator is **18,947,807 distinct upstream object
 * identities**, and every parity number published against it inherits its
 * authority. That number is produced by a walk whose output lives in
 * `.tmp-new2/upstream3` — 202 MB of gzipped derived NDJSON, correctly
 * gitignored, and gone the moment somebody clears the directory. What is in git
 * today is the CONCLUSION. There is nothing in git that could contradict it.
 *
 * A single overall hash would not fix that either: it can only ever answer "is
 * this the same run", never "which partition disagrees". So this records the
 * denominator the way it is actually built — per partition — and then folds
 * those into one digest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE FOLD IS A FAITHFUL SET DIGEST AND NOT A CONVENIENT APPROXIMATION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The identity is `pdfUrlFor({year, courtCode, bench}, basename(pdf_link))`, so
 * every identity string CONTAINS its year, court and bench. Two identical
 * identities therefore cannot come from different `(year, court, bench)` groups
 * — only from the two metadata variants (`metadata`, `metadata-mobile`) of the
 * same group, which is exactly where deduplication is required and where it is
 * done here.
 *
 * The groups are consequently DISJOINT, and the union of disjoint sets has a
 * canonical serialisation as soon as the groups themselves are ordered: sort
 * each group's identities, digest the group, sort the groups by key, digest the
 * list. That is `canonicalIdentitySetDigest`, and it is a digest of the set —
 * not of an arbitrary traversal of it. The cheaper `partitionDigestFold` is
 * kept beside it because it localises a disagreement to a partition, which the
 * set digest cannot do.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT REPRODUCIBLE MEANS HERE, STATED IN THREE SEPARATE FIELDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `MEASUREMENT_REPRODUCIBLE` — the measurement can be re-derived and compared,
 * because the per-partition digests, the row counts and the publisher's own
 * ETags are all recorded.
 *
 * `SOURCE_BYTES_RETAINED` — whether we still hold the bytes the measurement was
 * taken from. We do NOT: neither the upstream parquet nor the derived NDJSON is
 * in git, by policy and by size.
 *
 * `SOURCE_REFETCH_REQUIRED` — therefore yes. Re-deriving means fetching the
 * partitions again, and the ETags recorded here are what says whether the
 * publisher has changed them since. A partition whose ETag has moved cannot
 * reproduce this digest and MUST NOT be treated as a failure of the receipt.
 *
 * Calling this "full reproducibility" would be false. It is exactly the
 * reproducibility a hash of a discarded file can support, and no more.
 *
 *   node --import tsx scripts/lcc-m0-identity-receipt.mts \
 *     --walk .tmp-new2/upstream3 --out docs/ai/lcc-r11/m0-identity-receipt.json
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const HC = 'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const WALK = arg('walk', '.tmp-new2/upstream3');
const OUT = arg('out', 'docs/ai/lcc-r11/m0-identity-receipt.json');

const sha256 = (v: string | Buffer): string => createHash('sha256').update(v).digest('hex');
const shaFile = (p: string): string | null => (existsSync(p) ? sha256(readFileSync(p)) : null);

type ProgressRow = {
  key: string;
  size: number;
  etag: string;
  lastModified: string;
  year: number;
  courtCode: string;
  bench: string;
  variant: string;
  numRows?: number;
  rowsWritten?: number;
  error?: string;
  /** When this partition finished. The receipt's observation window is built from these. */
  at?: string;
};

const progress: ProgressRow[] = readFileSync(join(WALK, 'progress.jsonl'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l) as ProgressRow);

const errors = progress.filter((p) => p.error);
const walked = progress.filter((p) => !p.error);

const manifestRaw = readFileSync(join(WALK, 'objects.json'));
const manifest = JSON.parse(manifestRaw.toString('utf8')) as {
  key: string;
  size: number;
  etag: string;
  lastModified: string;
}[];

/** The walk names its output files by flattening the object key. */
function partitionFile(key: string): string {
  return join(WALK, 'partitions', `${key.replace(/[/=]/g, (c) => (c === '/' ? '_' : '='))}.ndjson.gz`);
}

/** The one construction that must match ingest — `harvest/hc-metadata.ts`. */
function pdfUrlFor(p: { year: number; courtCode: string; bench: string }, base: string): string {
  return `${HC}/data/pdf/year=${p.year}/court=${p.courtCode}/bench=${p.bench}/${base}`;
}

type PartitionReceipt = {
  key: string;
  etag: string;
  size: number;
  lastModified: string;
  year: number;
  courtCode: string;
  bench: string;
  variant: string;
  /** Rows the walk read out of the parquet. */
  rows: number;
  /** Rows whose `pdf_link` was blank: real, and never an identity. */
  rowsWithoutObject: number;
  /** Distinct identities WITHIN this partition, before cross-variant dedup. */
  distinctIdentities: number;
  /** sha256 over this partition's sorted distinct identities, one per line. */
  identityDigest: string;
};

const partitions: PartitionReceipt[] = [];
/** group key -> the union of its partitions' identity sets. */
const groups = new Map<string, Set<string>>();

// Sorted by group so a group's members are adjacent and its set can be folded
// and released rather than held for the whole run.
const ordered = [...walked].sort((a, b) => {
  const ka = `${a.year}|${a.courtCode}|${a.bench}`;
  const kb = `${b.year}|${b.courtCode}|${b.bench}`;
  return ka === kb ? a.variant.localeCompare(b.variant) : ka.localeCompare(kb);
});

type GroupReceipt = {
  year: number;
  courtCode: string;
  bench: string;
  variants: string[];
  distinctIdentities: number;
  identityDigest: string;
};
const groupReceipts: GroupReceipt[] = [];

function foldGroup(key: string): void {
  const set = groups.get(key);
  if (!set) return;
  const [year, courtCode, bench] = key.split('|');
  const sorted = [...set].sort();
  groupReceipts.push({
    year: Number(year),
    courtCode: courtCode!,
    bench: bench!,
    variants: partitions
      .filter((p) => `${p.year}|${p.courtCode}|${p.bench}` === key)
      .map((p) => p.variant)
      .sort(),
    distinctIdentities: sorted.length,
    identityDigest: sha256(`${sorted.join('\n')}\n`),
  });
  groups.delete(key);
}

let previousGroup: string | null = null;
let n = 0;
for (const p of ordered) {
  const key = `${p.year}|${p.courtCode}|${p.bench}`;
  if (previousGroup !== null && key !== previousGroup) foldGroup(previousGroup);
  previousGroup = key;

  const file = partitionFile(p.key);
  if (!existsSync(file)) {
    throw new Error(
      `${file} is missing. The receipt cannot be written from a partial walk — a denominator ` +
        'assembled from whatever happened to be on disk is exactly what this file exists to stop.',
    );
  }
  const lines = gunzipSync(readFileSync(file)).toString('utf8').split('\n');
  const identities = new Set<string>();
  let rows = 0;
  let withoutObject = 0;
  for (const line of lines) {
    if (!line) continue;
    rows += 1;
    const row = JSON.parse(line) as { b: string | null };
    if (!row.b) {
      withoutObject += 1;
      continue;
    }
    identities.add(pdfUrlFor(p, row.b));
  }

  const sorted = [...identities].sort();
  partitions.push({
    key: p.key,
    etag: p.etag,
    size: p.size,
    lastModified: p.lastModified,
    year: p.year,
    courtCode: p.courtCode,
    bench: p.bench,
    variant: p.variant,
    rows,
    rowsWithoutObject: withoutObject,
    distinctIdentities: sorted.length,
    identityDigest: sha256(`${sorted.join('\n')}\n`),
  });

  let group = groups.get(key);
  if (!group) groups.set(key, (group = new Set()));
  for (const id of sorted) group.add(id);

  n += 1;
  if (n % 100 === 0) console.log(`[m0] ${n}/${ordered.length} partitions`);
}
if (previousGroup !== null) foldGroup(previousGroup);

groupReceipts.sort((a, b) =>
  `${a.year}|${a.courtCode}|${a.bench}`.localeCompare(`${b.year}|${b.courtCode}|${b.bench}`),
);
partitions.sort((a, b) => a.key.localeCompare(b.key));

const upstreamUnique = groupReceipts.reduce((acc, g) => acc + g.distinctIdentities, 0);

/**
 * The set digest. Groups are disjoint (see the header), so ordering them by key
 * and concatenating their own sorted-set digests is a canonical serialisation
 * of the whole identity set.
 */
const canonicalIdentitySetDigest = sha256(
  `${groupReceipts
    .map((g) => `${g.year}|${g.courtCode}|${g.bench}\t${g.distinctIdentities}\t${g.identityDigest}`)
    .join('\n')}\n`,
);

/** Localises a disagreement to one partition. Not a set digest — a fold of parts. */
const partitionDigestFold = sha256(
  `${partitions.map((p) => `${p.key}\t${p.etag}\t${p.rows}\t${p.identityDigest}`).join('\n')}\n`,
);

const definitionPath = 'docs/ai/new2-r10/hc-parity-definition-v2.json';
const definition = JSON.parse(readFileSync(definitionPath, 'utf8')) as { definitionVersion: string };

/** The walk's own observation window, read off its rows rather than asserted. */
const walkWindow = ((): { first: string | null; last: string | null } => {
  const times = walked.map((p) => p.at).filter((a): a is string => typeof a === 'string').sort();
  return { first: times[0] ?? null, last: times[times.length - 1] ?? null };
})();

const receipt = {
  artifact: 'LCC_M0_IDENTITY_RECEIPT',
  version: 'M0_IDENTITY_V1',
  observedAt: new Date().toISOString(),
  measurement: {
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * THESE WERE HARDCODED, AND A RECEIPT WITH A CONSTANT TIMESTAMP IS NOT A
     * RECEIPT
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Both of these were string literals naming the R11 walk. Pointed at a
     * different walk — which is exactly what `--walk` exists for — the script
     * produced a receipt for the M0 that Gate A actually used, stamped with the
     * observation window of a walk taken three and a half hours earlier. The
     * digests would have been right and the provenance wrong, which is the more
     * dangerous of the two failures because nothing looks broken.
     *
     * They are now read off the walk's own rows. `walkStartedAt` and
     * `walkCompletedAt` are the min and max of the per-partition completion
     * times, so the window is the walk's and cannot describe another one.
     */
    walkStartedAt: walkWindow.first,
    walkCompletedAt: walkWindow.last,
    /**
     * **Null, honestly.** The publisher's object listing carries no observation
     * timestamp of its own — `objects.json` is a bare array — so there is
     * nothing here to record and inventing one from a file mtime would be a
     * guess wearing a receipt's clothes. The walk window above bounds it: the
     * manifest was taken at or before `walkStartedAt`.
     */
    upstreamManifestObservedAt: null,
    definitionVersion: definition.definitionVersion,
    definitionSha256: shaFile(definitionPath),
    definitionPath,
  },
  manifest: {
    path: `${WALK}/objects.json`,
    sha256: sha256(manifestRaw),
    /**
     * Every partition in the manifest is non-fixture: the walk filters
     * `bench=testcase` BEFORE writing `objects.json`, so this count is the
     * non-fixture count and the receipt cannot say how many were dropped. Stated
     * rather than inferred — a fixture partition inflated this denominator once
     * already (289,502 rows).
     */
    nonFixturePartitionCount: manifest.length,
    walkedPartitionCount: walked.length,
    partitionErrors: errors.length,
  },
  denominator: {
    upstreamUnique,
    rowsRead: partitions.reduce((a, p) => a + p.rows, 0),
    rowsWithoutObject: partitions.reduce((a, p) => a + p.rowsWithoutObject, 0),
    groups: groupReceipts.length,
    groupsWithBothVariants: groupReceipts.filter((g) => g.variants.length > 1).length,
    canonicalIdentitySetDigest,
    partitionDigestFold,
  },
  boundArtifacts: {
    parity: {
      path: 'docs/ai/new2-r10/parity-matrix-gate.json',
      sha256: shaFile('docs/ai/new2-r10/parity-matrix-gate.json'),
    },
    freshness: {
      path: 'docs/ai/new2-r10/source-freshness-gate.json',
      sha256: shaFile('docs/ai/new2-r10/source-freshness-gate.json'),
    },
    operationalGate: {
      path: 'docs/ai/new2-r10/R10_OPERATIONAL_GATE.json',
      sha256: shaFile('docs/ai/new2-r10/R10_OPERATIONAL_GATE.json'),
    },
    frontier: {
      path: 'docs/ai/new2-r10/coverage-frontier-gate.json',
      sha256: shaFile('docs/ai/new2-r10/coverage-frontier-gate.json'),
    },
    /**
     * The published freshness observation - the artifact `GET
     * /corpus/freshness/object` actually serves. Its `generation` and
     * `bodySha256` are recorded because the route fails closed on them: a
     * denominator receipt that could not say WHICH publication it was taken
     * beside would leave the two free to drift apart silently.
     */
    freshnessObservation: (() => {
      const path = 'docs/ai/new2-r10/freshness-observation.json';
      if (!existsSync(path)) return { path, sha256: null };
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        generation?: string;
        bodySha256?: string;
        definitionVersion?: string;
        definitionSha256?: string;
        publishedAt?: string;
      };
      return {
        path,
        sha256: shaFile(path),
        generation: parsed.generation ?? null,
        bodySha256: parsed.bodySha256 ?? null,
        definitionVersion: parsed.definitionVersion ?? null,
        definitionSha256: parsed.definitionSha256 ?? null,
        publishedAt: parsed.publishedAt ?? null,
      };
    })(),
  },
  reproducibility: {
    MEASUREMENT_REPRODUCIBLE: true,
    /**
     * **About the UPSTREAM PARQUET, and it is still false.** The publisher's
     * bytes are not retained anywhere, by policy and by size.
     */
    SOURCE_BYTES_RETAINED: false,
    SOURCE_REFETCH_REQUIRED: true,
    /**
     * The derived walk output is a THIRD state the two flags above could not
     * express, and conflating it with either would be a false claim in one
     * direction or the other.
     *
     * It is what this receipt was actually re-derived from — so the measurement
     * was reproduced without touching the publisher — but it lives in a
     * gitignored temp directory and is one `rm -rf` from gone. It is evidence
     * today and it is not durable evidence.
     */
    DERIVED_WALK_RETAINED: existsSync(join(WALK, 'partitions')),
    DERIVED_WALK_PATH: WALK,
    DERIVED_WALK_DURABLE: false,
    note:
      'The per-partition ETags, row counts and identity digests let a re-derivation be compared ' +
      'partition by partition. The UPSTREAM PARQUET is not retained — it is gitignored bulk — so ' +
      'reproducing this measurement from the publisher means refetching, and a partition whose ' +
      'ETag has moved since the recorded value CANNOT reproduce its digest, which is a change ' +
      'upstream and not a defect in this receipt. The DERIVED walk output may still be on the box ' +
      '(see DERIVED_WALK_RETAINED); where it is, the measurement can be re-derived locally without ' +
      'any network at all, which is how this receipt was produced. That directory is not durable ' +
      'and must not be treated as retention. A hash alone would not have been full reproducibility ' +
      'and this does not claim to be.',
  },
  partitions,
  groups: groupReceipts,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  `\nupstreamUnique ${upstreamUnique}\n` +
    `partitions     ${partitions.length} (errors ${errors.length})\n` +
    `groups         ${groupReceipts.length}\n` +
    `set digest     ${canonicalIdentitySetDigest}\n` +
    `fold digest    ${partitionDigestFold}\n` +
    `wrote ${OUT}`,
);
