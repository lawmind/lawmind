#!/usr/bin/env node
/**
 * The two defects Part A found in the backup tooling were both invisible until
 * the tool ran against a real database, and both were one identifier wrong:
 *
 *   1. `lcc-offsite-restore-proof.mjs` computed its content checksum over
 *      `judgment_citations.citing_id` / `cited_id`. Those columns do not exist;
 *      the live names are `citing_judgment_id` / `cited_judgment_id`. The proof
 *      swallowed the error and reported `UNAVAILABLE`, so a restore with no
 *      content verification at all still printed a result.
 *   2. `lcc-moat-backup.mjs` exported the judgment identity join key only for
 *      rows carrying a verdict -- 6,194,817 of 18,759,022 -- while every
 *      protected relation table addresses judgments by an id that does not
 *      survive a re-ingest.
 *
 * Neither needed a database to catch. Both are statements about the SOURCE, and
 * a test that reads the source costs nothing and runs in CI, which is where a
 * backup tool that has not been exercised since March should be checked.
 *
 *   node --test scripts/backup-pack-shape.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A newline followed by `];` -- built rather than escaped, so no escape can be eaten. */
const CLOSE = String.fromCharCode(10) + '];';
const backup = readFileSync(join(REPO, 'scripts', 'lcc-moat-backup.mjs'), 'utf8');
const proof = readFileSync(join(REPO, 'scripts', 'lcc-offsite-restore-proof.mjs'), 'utf8');

/** Everything between two markers, or a failure that names which marker was missing. */
function between(source, open, close) {
  const start = source.indexOf(open);
  assert.notEqual(start, -1, `marker not found: ${open}`);
  const end = source.indexOf(close, start + open.length);
  assert.notEqual(end, -1, `closing marker not found after ${open}`);
  return source.slice(start + open.length, end);
}

/**
 * One entry per `{ root: '...' ... }`, parsed without a regex so an escape
 * cannot go missing. `localOnly` is read as a flag: an entry that carries it is
 * declaring that Git does not have this file, which is a decision rather than a
 * defect and is exactly why the pack carries it.
 */
function entries(block) {
  const out = [];
  const parts = block.split('{ root: ').slice(1);
  for (const part of parts) {
    const line = part.slice(0, part.indexOf('},') === -1 ? part.length : part.indexOf('},'));
    const q = line.indexOf("'");
    const end = line.indexOf("'", q + 1);
    assert.notEqual(end, -1, 'unterminated root string');
    out.push({ root: line.slice(q + 1, end), localOnly: line.includes('localOnly:') });
  }
  return out;
}

describe('the identity map is the whole corpus, not the verdict subset', () => {
  const sql = between(backup, 'const JUDGMENT_IDENTITY = `', '`;');

  it('carries the join key and the source identity beside it', () => {
    for (const column of ['id', 'content_hash', 'source_url']) {
      assert.ok(sql.includes(column), `JUDGMENT_IDENTITY must select ${column}`);
    }
  });

  it('carries the four provenance columns the protected set requires', () => {
    for (const column of [
      'source_id',
      'source_edition',
      'authorization_basis',
      'provenance_recorded_at',
    ]) {
      assert.ok(sql.includes(column), `JUDGMENT_IDENTITY must select ${column}`);
    }
  });

  it('has NO filter -- a filtered identity map is the defect, not a smaller one', () => {
    // This is the entire point. `JUDGMENT_VERDICTS` may filter, because a
    // judgment with no verdict has no verdict to restore. An identity map that
    // filters loses the address of every row it skipped, and the rows that
    // referenced it restore into nothing.
    assert.ok(!sql.toUpperCase().includes(' WHERE '), 'JUDGMENT_IDENTITY must not be filtered');
  });

  it('the verdict projection still filters, and still carries content_hash', () => {
    const verdicts = between(backup, 'const JUDGMENT_VERDICTS = `', '`;');
    assert.ok(verdicts.toUpperCase().includes('WHERE'), 'the verdict projection is meant to filter');
    assert.ok(verdicts.includes('content_hash'), 'the verdict projection still needs its join key');
  });
});

describe('every protected-file root exists in this repository', () => {
  const declared = entries(between(backup, 'const PROTECTED_FILES = [', CLOSE));

  it('declares a non-trivial set', () => {
    assert.ok(declared.length >= 20, `expected a real protected set, got ${declared.length}`);
  });

  it('names the governing authority, the gold sets, the checkpoints and the migrations', () => {
    const joined = declared.map((d) => d.root).join(' ');
    for (const required of [
      'docs/roadmaps',
      'services/ingest/.checkpoints',
      'packages/db/drizzle',
      'docs/SCHEMA_TRUTH.md',
    ]) {
      assert.ok(joined.includes(required), `PROTECTED_FILES must carry ${required}`);
    }
    assert.ok(joined.includes('gold'), 'PROTECTED_FILES must carry an eval/gold artifact');
  });

  it('points at nothing that has been moved or deleted', () => {
    // A root that has drifted is silently dropped at pack time and recorded as
    // absent -- honest, and still a hole in the protected set. Catch it here.
    //
    // `localOnly` entries are exempt BECAUSE OF WHAT THIS TEST FOUND. Run from
    // a clean checkout of HEAD rather than from this working tree, it failed on
    // `docs/SCI_AUTHORISATION.md` and `docs/ai/new1-tier-a/.worklist-v2.txt`:
    // both are protected roots that exist on one workstation and in NO Git
    // object, so a clone has neither. That is not drift, it is the hazard the
    // pack exists for -- but it has to be a DECLARED decision, or the exemption
    // becomes the hole. Hence the flag, and hence this comment.
    const missing = declared.filter((d) => !d.localOnly && !existsSync(join(REPO, d.root)));
    assert.deepEqual(
      missing.map((d) => d.root),
      [],
      `protected roots that no longer exist: ${missing.map((d) => d.root).join(', ')}`,
    );
  });

  it('every local-only root says WHY Git does not have it', () => {
    // An undocumented exemption is indistinguishable from a mistake.
    const block = between(backup, 'const PROTECTED_FILES = [', CLOSE);
    for (const d of declared.filter((x) => x.localOnly)) {
      const at = block.indexOf(d.root);
      const tail = block.slice(at, at + 900);
      assert.ok(
        tail.includes('localOnly:') && tail.split('localOnly:')[1].length > 40,
        `${d.root} is exempt from the existence check with no stated reason`,
      );
    }
  });

  it('excludes the vector batch output deliberately, and says so', () => {
    assert.ok(
      backup.includes('document-vectors'),
      'the exclusion of the 4.3 GB vector batches must be recorded, not silent',
    );
  });
});

describe('the restore proof checksums columns that exist', () => {
  it('does not reference the columns that never existed', () => {
    for (const dead of ['citing_id', 'cited_id']) {
      assert.ok(!proof.includes(dead), `${dead} is not a column of judgment_citations`);
    }
  });

  it('uses the live column names', () => {
    for (const live of ['citing_judgment_id', 'cited_judgment_id']) {
      assert.ok(proof.includes(live), `the checksum must read ${live}`);
    }
  });
});

describe('the moat still carries what cannot be re-fetched', () => {
  const moat = between(backup, 'const MOAT = [', CLOSE);
  it('keeps the raw artifacts and both eCourts ledgers', () => {
    for (const table of [
      'official_source_artifact',
      'ecourts_observation',
      'ecourts_fetch_ledger',
      'verification_cache',
      'audit_log',
    ]) {
      assert.ok(moat.includes(table), `${table} may not leave the protected set`);
    }
  });
});
