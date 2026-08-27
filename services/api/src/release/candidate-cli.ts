/**
 * `pnpm --filter @lawmind/api release:candidate` — seal, check, or re-check a
 * release candidate. R8.3 §7.
 *
 *   seal              seal a new candidate and write its manifest
 *   check <manifest>  re-read the corpus and report FROZEN or MUTATED
 *   writers           list the corpus-mutating processes visible right now
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `writers` DOES NOT KILL ANYTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §3.4 and §10 LCC-8 are explicit: do not kill an unknown process until owner,
 * command and output delta are verified. This lists what is writing and what it
 * is called; deciding is a person's job, and the pause in §7 is a declaration on
 * the bus, not a signal sent to another lane's PID.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

import postgres from 'postgres';

import {
  checkCandidateDrift,
  corpusWritersFromPostgres,
  releaseManifest,
  sealReleaseCandidate,
  type ReleaseCandidate,
} from './candidate.ts';

const DB = process.env['DATABASE_URL'];
if (!DB) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const sql = postgres(DB, { max: 2, onnotice: () => {} });

function head(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    // Recorded as unknown rather than guessed. A manifest whose HEAD is a lie is
    // worse than one that admits it could not read git.
    return 'UNKNOWN_HEAD';
  }
}

/**
 * Processes that LOOK like corpus writers, by command fingerprint. ADVISORY.
 *
 * `corpusWritersFromPostgres` is the EVIDENCE - a backend holding a write lock
 * on a corpus table is a writer, and nothing is inferred from a string. This
 * exists only to catch a job that has been launched but has not opened its
 * transaction yet, which holds no lock and is therefore invisible to pg_locks.
 *
 * It is a heuristic and is labelled as one everywhere it is printed. Its first
 * real run matched another lane's read-only SELECT because the SQL text
 * contained the word "statute"; an inline -e script body is stripped below for
 * exactly that reason, and it still must never be read as proof.
 */
const WRITER_PATTERNS = [
  'enrich-worker',
  'paragraphs-cli',
  'ingest',
  'harvest',
  'citation-keys',
  'propagate',
  'ocr',
  'enrich',
  'embed-worker',
  'supervise',
  'backfill',
  'statute',
];

function corpusWriters(): { pid: number; cmd: string }[] {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        // `cmd` is in the list because of a real miss: the paragraphs enrichment
        // worker is `cmd.exe /K enrich-worker.cmd ... paragraphs-cli.ts --apply`,
        // a wrapper that sleeps an hour between runs and spawns node only while
        // working. Filtering on node|python reported ZERO writers while an
        // --apply worker sat on the box waiting to wake up.
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|python|cmd' } | " +
          'Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    const raw = JSON.parse(out || '[]') as
      | { ProcessId: number; CommandLine: string | null }
      | { ProcessId: number; CommandLine: string | null }[];
    const list = Array.isArray(raw) ? raw : [raw];
    return list
      .filter((p) => {
        // Strip an inline `-e "..."` script body before matching. A SELECT that
        // mentions a corpus table is not a writer, and that false positive is
        // what made the first version of this useless.
        const cmd = (p.CommandLine ?? '').toLowerCase().split('-e ')[0] ?? '';
        return p.ProcessId !== process.pid && WRITER_PATTERNS.some((w) => cmd.includes(w));
      })
      .map((p) => ({ pid: p.ProcessId, cmd: (p.CommandLine ?? '').slice(0, 200) }));
  } catch {
    return [];
  }
}

const [cmd, arg] = process.argv.slice(2);

try {
  if (cmd === 'seal') {
    const candidate = await sealReleaseCandidate(sql, head());
    const locking = await corpusWritersFromPostgres(sql);
    const writers = corpusWriters();
    const manifest = releaseManifest(candidate, {
      /** EVIDENCE: backends holding a write lock on a corpus table. */
      corpusWriteLocksAtSeal: locking,
      /** ADVISORY: command lines that look like a corpus job. Heuristic only. */
      possibleWriterProcessesAtSeal: writers,
      /**
       * The honest statement of what the seal does and does not guarantee.
       * Written INTO the manifest so a later reader cannot mistake a declared
       * pause for an enforced one.
       */
      pauseSemantics:
        'The seal RECORDS the writers visible at seal time. It cannot stop another lane. ' +
        'Re-run `check` to detect movement; a MUTATED result names the fields that moved.',
    });
    const path = arg ?? `docs/ai/lcc-r83/${candidate.releaseCandidateId}.json`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`SEALED ${candidate.releaseCandidateId}`);
    console.log(`  digest   ${candidate.corpusDigest}`);
    console.log(
      '  reproducible  ' +
        (candidate.reproducible
          ? 'YES - the named HEAD reproduces this candidate'
          : 'NO - sealed over a dirty tree; this candidate CANNOT be frozen as a release'),
    );
    if (!candidate.reproducible) {
      for (const p of candidate.code.dirtyPaths.slice(0, 10)) console.log('      dirty ' + p);
    }
    console.log('  head     ' + candidate.code.head);
    console.log('  schema   ' + candidate.code.schemaDigest);
    console.log(
      '  registry ' + candidate.code.registryVersion + ' / ' + candidate.code.registryDigest,
    );
    console.log('  migrations ' + candidate.code.migrationFiles + ' / ' + candidate.code.migrationDigest);
    console.log(
      '  writing  ' +
        (locking.length === 0
          ? 'no corpus write lock held'
          : locking.length + ' BACKEND(S) HOLDING A WRITE LOCK'),
    );
    for (const w of locking) {
      console.log('    pg ' + w.pid + '  ' + w.table + '  ' + w.lockMode + '  since ' + (w.xactStart ?? '?'));
    }
    console.log('  advisory ' + writers.length + ' process(es) look like a corpus job (heuristic)');
    for (const w of writers) console.log('    os ' + w.pid + '  ' + w.cmd);
    console.log(`  manifest ${path}`);
  } else if (cmd === 'check') {
    if (!arg) throw new Error('usage: check <manifest.json>');
    const manifest = JSON.parse(readFileSync(arg, 'utf8')) as ReleaseCandidate;
    const drift = await checkCandidateDrift(sql, manifest, new Date(), head());
    console.log(`${drift.state} ${manifest.releaseCandidateId}  checked ${drift.checkedAt}`);
    if (manifest.reproducible === false) {
      console.log('  NOT REPRODUCIBLE - this candidate was sealed over a dirty tree');
    }
    for (const m of drift.movedCode) {
      console.log(`  CODE MOVED  ${String(m.field)}: ${String(m.sealed)} -> ${String(m.now)}`);
    }
    for (const m of drift.moved) {
      console.log(`  CORPUS MOVED ${String(m.field)}: ${String(m.sealed)} -> ${String(m.now)}`);
    }
    for (const w of await corpusWritersFromPostgres(sql)) {
      console.log('  WRITE LOCK pg ' + w.pid + '  ' + w.table + '  ' + w.lockMode);
    }
    for (const w of corpusWriters()) console.log('  advisory os ' + w.pid + '  ' + w.cmd);
    // Exit code so a script can gate on it. MUTATED is a fact, not a crash.
    process.exitCode = drift.state === 'FROZEN' ? 0 : 1;
  } else if (cmd === 'writers') {
    const locking = await corpusWritersFromPostgres(sql);
    if (locking.length === 0) console.log('EVIDENCE: no backend holds a corpus write lock');
    for (const w of locking) {
      console.log('EVIDENCE pg ' + w.pid + '  ' + w.table + '  ' + w.lockMode + '  since ' + (w.xactStart ?? '?'));
      console.log('         ' + (w.query ?? ''));
    }
    const writers = corpusWriters();
    if (writers.length === 0) console.log('ADVISORY: no process looks like a corpus job');
    for (const w of writers) console.log('ADVISORY os ' + w.pid + '  ' + w.cmd);
  } else {
    console.error('usage: candidate-cli.ts <seal [path] | check <manifest> | writers>');
    process.exitCode = 2;
  }
} finally {
  await sql.end();
}
