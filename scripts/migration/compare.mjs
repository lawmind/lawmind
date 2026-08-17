#!/usr/bin/env node
/**
 * Diff two manifests and decide whether the copy is good enough to cut over to.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * STAGE F of the migration. The founder directive: *"Do not cut over based on
 * 'restore succeeded.'"* This is the thing that replaces that judgement — a
 * mechanical comparison of the source and the target across schema, data and
 * the structures that make the data usable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS A DIFFERENCE, AND WHAT DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Not every difference is a defect, and a tool that reports all of them equally
 * is a tool nobody reads. Three tiers:
 *
 *   FAIL  — a missing table, a missing column, a row-count shortfall, a missing
 *           index or constraint, a missing enum label, a missing extension.
 *           Cutover is blocked.
 *   WARN  — something that differs for a known and acceptable reason: sizes
 *           (a fresh restore has no bloat and packs tighter), index scan
 *           counts (they start at zero on a new cluster), the locale provider
 *           (libc en_US.utf8 does not exist on Windows; see lawmind.conf).
 *   OK    — equal.
 *
 * **Row counts on the TARGET may not EXCEED the source, and may not fall
 * short.** Both directions are failures and for different reasons: short means
 * data was lost, over means the restore ran twice or the source count was taken
 * after the snapshot. The one legitimate exception is a source count taken
 * while writers were still running — which is why `--allow-source-drift` exists
 * and why it names the tables it is being permissive about instead of relaxing
 * the whole check.
 *
 *   node scripts/migration/compare.mjs --a manifest-railway.json --b manifest-local.json
 *   node scripts/migration/compare.mjs --a a.json --b b.json --schema-only
 */
import fs from 'node:fs';
import path from 'node:path';

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const findings = [];
const add = (level, area, message, detail) => findings.push({ level, area, message, detail });

const byName = (arr, key = 'name') => new Map(arr.map((x) => [x[key], x]));

/** Index and constraint definitions differ in whitespace and schema qualification. */
function normaliseDef(def) {
  return String(def ?? '')
    .replace(/\s+/g, ' ')
    .replace(/public\./g, '')
    .replace(/"/g, '')
    .trim()
    .toLowerCase();
}

function compareSets(area, aList, bList, keyFn, describeFn) {
  const a = new Map(aList.map((x) => [keyFn(x), x]));
  const b = new Map(bList.map((x) => [keyFn(x), x]));
  for (const [k, v] of a) {
    if (!b.has(k)) add('FAIL', area, `missing in TARGET: ${describeFn ? describeFn(v) : k}`);
  }
  for (const [k, v] of b) {
    if (!a.has(k)) add('WARN', area, `present in TARGET but not source: ${describeFn ? describeFn(v) : k}`);
  }
  return { a, b };
}

function main() {
  const argv = process.argv.slice(2);
  const aPath = argv.includes('--a') ? argv[argv.indexOf('--a') + 1] : null;
  const bPath = argv.includes('--b') ? argv[argv.indexOf('--b') + 1] : null;
  const schemaOnly = argv.includes('--schema-only');
  const allowDrift = argv.includes('--allow-source-drift')
    ? (argv[argv.indexOf('--allow-source-drift') + 1] ?? '').split(',').filter(Boolean)
    : [];
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;

  if (!aPath || !bPath) {
    console.error('usage: compare.mjs --a <source manifest> --b <target manifest> [--schema-only]');
    process.exit(2);
  }

  const A = load(aPath);
  const B = load(bPath);

  // ── server ────────────────────────────────────────────────────────────────
  if (A.server.majorVersion !== B.server.majorVersion) {
    add('FAIL', 'server', `major version differs: source ${A.server.majorVersion}, target ${B.server.majorVersion}`);
  } else if (A.server.versionNum !== B.server.versionNum) {
    add(
      'WARN',
      'server',
      `minor version differs: source ${A.server.versionNum}, target ${B.server.versionNum} — same major, restore is supported`,
    );
  }

  // ── extensions ────────────────────────────────────────────────────────────
  const extA = byName(A.extensions);
  const extB = byName(B.extensions);
  for (const [n, v] of extA) {
    const t = extB.get(n);
    if (!t) add('FAIL', 'extensions', `missing extension: ${n} ${v.version}`);
    else if (t.version !== v.version)
      add('WARN', 'extensions', `${n} version differs: source ${v.version}, target ${t.version}`);
  }

  // ── enums ─────────────────────────────────────────────────────────────────
  // A missing label is silent until the first row that needs it, which could be
  // months after cutover. verified_by_source and overruled_status live here.
  const enA = byName(A.enums);
  const enB = byName(B.enums);
  for (const [n, v] of enA) {
    const t = enB.get(n);
    if (!t) {
      add('FAIL', 'enums', `missing enum type: ${n}`);
      continue;
    }
    const missing = v.labels.filter((l) => !t.labels.includes(l));
    const extra = t.labels.filter((l) => !v.labels.includes(l));
    if (missing.length) add('FAIL', 'enums', `${n} missing labels: ${missing.join(', ')}`);
    if (extra.length) add('WARN', 'enums', `${n} extra labels: ${extra.join(', ')}`);
    if (!missing.length && !extra.length && v.labels.join('|') !== t.labels.join('|'))
      add('WARN', 'enums', `${n} label ORDER differs — sort order of the type changes`);
  }

  // ── tables + columns ──────────────────────────────────────────────────────
  compareSets('tables', A.tables, B.tables, (t) => t.name);

  const colKey = (c) => `${c.table}.${c.column}`;
  const colA = new Map(A.columns.map((c) => [colKey(c), c]));
  const colB = new Map(B.columns.map((c) => [colKey(c), c]));
  for (const [k, c] of colA) {
    const t = colB.get(k);
    if (!t) {
      add('FAIL', 'columns', `missing column: ${k} (${c.type})`);
      continue;
    }
    if (c.type !== t.type) add('FAIL', 'columns', `${k} type differs: source ${c.type}, target ${t.type}`);
    if (c.nullable !== t.nullable)
      add('FAIL', 'columns', `${k} nullability differs: source ${c.nullable ? 'NULL' : 'NOT NULL'}, target ${t.nullable ? 'NULL' : 'NOT NULL'}`);
    if (normaliseDef(c.default) !== normaliseDef(t.default))
      add('WARN', 'columns', `${k} default differs: source ${c.default}, target ${t.default}`);
    // FAIL, not WARN. A source column that is GENERATED and a target column that
    // is not is invisible in every other field compared here, and it means the
    // target stops maintaining the value on write — for a tsvector, search that
    // decays silently from the next INSERT. Skipped when either manifest predates
    // this field, so an older manifest compares as it always did rather than
    // failing for a reason that is about the manifest and not about the data.
    if (c.generated !== undefined && t.generated !== undefined) {
      if (c.generated !== t.generated)
        add(
          'FAIL',
          'columns',
          `${k} generated differs: source ${c.generated ? 'GENERATED' : 'plain'}, target ${t.generated ? 'GENERATED' : 'plain'}`,
        );
      else if (c.generated && normaliseDef(c.generationExpression) !== normaliseDef(t.generationExpression))
        add(
          'FAIL',
          'columns',
          `${k} generation expression differs: source ${c.generationExpression}, target ${t.generationExpression}`,
        );
    }
  }
  for (const k of colB.keys()) if (!colA.has(k)) add('WARN', 'columns', `extra column in target: ${k}`);

  // ── indexes ───────────────────────────────────────────────────────────────
  const idxA = byName(A.indexes);
  const idxB = byName(B.indexes);
  for (const [n, v] of idxA) {
    const t = idxB.get(n);
    if (!t) {
      add('FAIL', 'indexes', `missing index: ${n} on ${v.table}`);
      continue;
    }
    if (normaliseDef(v.def) !== normaliseDef(t.def))
      add('FAIL', 'indexes', `${n} definition differs`, { source: v.def, target: t.def });
  }
  for (const n of idxB.keys()) if (!idxA.has(n)) add('WARN', 'indexes', `extra index in target: ${n}`);

  // ── constraints ───────────────────────────────────────────────────────────
  const conA = byName(A.constraints);
  const conB = byName(B.constraints);
  for (const [n, v] of conA) {
    const t = conB.get(n);
    if (!t) {
      add('FAIL', 'constraints', `missing constraint: ${n} on ${v.table} (${v.def})`);
      continue;
    }
    if (normaliseDef(v.def) !== normaliseDef(t.def))
      add('FAIL', 'constraints', `${n} definition differs`, { source: v.def, target: t.def });
    // A NOT VALID constraint enforces new rows but never checked the old ones.
    if (v.validated && !t.validated) add('FAIL', 'constraints', `${n} is NOT VALIDATED in target but validated in source`);
  }

  // ── sequences ─────────────────────────────────────────────────────────────
  // A sequence restored to its start value hands out keys that already exist.
  const seqA = byName(A.sequences);
  const seqB = byName(B.sequences);
  for (const [n, v] of seqA) {
    const t = seqB.get(n);
    if (!t) {
      add('FAIL', 'sequences', `missing sequence: ${n}`);
      continue;
    }
    if (v.lastValue !== null && t.lastValue !== v.lastValue)
      add('FAIL', 'sequences', `${n} last_value differs: source ${v.lastValue}, target ${t.lastValue} — the target will reissue existing keys`);
  }

  // ── functions / views ─────────────────────────────────────────────────────
  compareSets('functions', A.functions.map((f) => ({ name: f })), B.functions.map((f) => ({ name: f })), (x) => x.name);
  compareSets('views', A.views.map((v) => ({ name: v })), B.views.map((v) => ({ name: v })), (x) => x.name);
  compareSets('matviews', A.matviews.map((v) => ({ name: v })), B.matviews.map((v) => ({ name: v })), (x) => x.name);

  if (A.largeObjects !== B.largeObjects)
    add('FAIL', 'largeObjects', `count differs: source ${A.largeObjects}, target ${B.largeObjects}`);

  // ── data ──────────────────────────────────────────────────────────────────
  if (!schemaOnly) {
    const tA = byName(A.tables);
    const tB = byName(B.tables);
    let compared = 0;
    let noExact = 0;
    for (const [n, a] of tA) {
      const b = tB.get(n);
      if (!b) continue; // already reported as a missing table
      if (a.exactRows === null || b.exactRows === null) {
        noExact++;
        // Estimates are not evidence. Say so rather than quietly comparing them.
        continue;
      }
      compared++;
      if (a.exactRows === b.exactRows) continue;
      const drifted = allowDrift.includes(n);
      const delta = b.exactRows - a.exactRows;
      if (delta < 0) {
        add(
          drifted ? 'WARN' : 'FAIL',
          'rowcounts',
          `${n}: TARGET SHORT by ${-delta} (source ${a.exactRows}, target ${b.exactRows})` +
            (drifted ? ' — allowed: source was still taking writes' : ''),
        );
      } else {
        add(
          'FAIL',
          'rowcounts',
          `${n}: TARGET HAS ${delta} MORE than source (source ${a.exactRows}, target ${b.exactRows}) — a restore that ran twice looks exactly like this`,
        );
      }
    }
    add('INFO', 'rowcounts', `${compared} tables compared on exact counts, ${noExact} skipped for lack of an exact count on one side`);
    if (noExact > 0)
      add(
        'WARN',
        'rowcounts',
        `${noExact} tables had no exact count on at least one side. Re-run manifest.mjs with --exact on BOTH before cutover — estimates cannot verify a migration`,
      );

    const sizeA = A.databaseSizeBytes;
    const sizeB = B.databaseSizeBytes;
    const pct = ((sizeB - sizeA) / sizeA) * 100;
    add(
      'WARN',
      'size',
      `database size source ${(sizeA / 1024 ** 3).toFixed(1)} GB, target ${(sizeB / 1024 ** 3).toFixed(1)} GB (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) — a fresh restore packs tighter and carries no bloat, so smaller is expected and is not evidence of loss`,
    );
  }

  // ── report ────────────────────────────────────────────────────────────────
  const fails = findings.filter((f) => f.level === 'FAIL');
  const warns = findings.filter((f) => f.level === 'WARN');
  const infos = findings.filter((f) => f.level === 'INFO');

  console.log(`compare: source ${A.meta?.label ?? aPath} -> target ${B.meta?.label ?? bPath}`);
  console.log(`compare: ${fails.length} FAIL · ${warns.length} WARN · ${infos.length} INFO`);
  console.log('');
  for (const f of [...fails, ...warns, ...infos]) {
    console.log(`  ${f.level.padEnd(4)} [${f.area}] ${f.message}`);
    if (f.detail) {
      for (const [k, v] of Object.entries(f.detail)) console.log(`         ${k}: ${v}`);
    }
  }
  console.log('');

  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          source: A.meta,
          target: B.meta,
          schemaOnly,
          allowSourceDrift: allowDrift,
          counts: { fail: fails.length, warn: warns.length, info: infos.length },
          findings,
          comparedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(`compare: wrote ${out}`);
  }

  if (fails.length) {
    console.log('VERDICT: DO NOT CUT OVER. The failures above are unexplained differences.');
    process.exit(1);
  }
  console.log(
    schemaOnly
      ? 'VERDICT: schema matches. This says NOTHING about the data — run again without --schema-only.'
      : 'VERDICT: source and target agree on schema, structure and exact row counts.',
  );
}

main();
