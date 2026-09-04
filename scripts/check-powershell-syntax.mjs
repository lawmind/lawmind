#!/usr/bin/env node
/**
 * EVERY `.ps1` IN THIS REPO PARSES — a static guard, and the reason it exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS WAS WRITTEN FROM, 5 Sep 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A single em dash inside a double-quoted string broke `n2-daily-delta.ps1`
 * completely:
 *
 *     Say "    SC year $y — $f fetch(es) refused by upstream (404)"
 *
 * These files carry NO byte-order mark, and Windows PowerShell 5.1 decodes a
 * BOM-less file as the system ANSI codepage. The three UTF-8 bytes of `—`
 * (E2 80 94) decode under cp1252 as `â€"` — and that third character is a
 * DOUBLE QUOTE. It closed the string two thirds of the way through, and every
 * line after it was reinterpreted as code. The parser's first complaint landed
 * 30 lines further down, inside an unrelated comment block, naming a token that
 * had nothing to do with the mistake.
 *
 * The file's own authors had been avoiding this for months without writing it
 * down: every `Say` in it uses an ASCII `--` while the surrounding block
 * comments are full of em dashes. Inside a `<# #>` comment a stray quote is
 * harmless, so the hazard is invisible until the first time somebody types a
 * nice dash inside a string.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE AND NOT A README LINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `n2-daily-delta.ps1` and `start-ingest-fleet.ps1` are load-bearing UNATTENDED
 * jobs. `n2-daily-delta.ps1` runs at 18:00 daily under Task Scheduler, and a
 * PowerShell file that does not parse runs NOTHING — no manifest, no scopes, no
 * launch, no ledger — while the scheduled task still reports that it fired.
 * That is the exact failure shape this repo keeps paying for: a job that looks
 * like it ran because something started, exited and wrote a line.
 *
 * There was no coverage of `.ps1` at all before this. The two `.mts`/`.mjs`
 * halves of the same daily cycle are typechecked and linted; the PowerShell that
 * ORCHESTRATES them was not checked by anything.
 *
 * Static, opens no socket, touches no database. Uses the PowerShell parser
 * itself rather than a regex, because the failure above is precisely a case
 * where a plausible-looking line is not what the parser sees.
 *
 *   node scripts/check-powershell-syntax.mjs
 *
 * Exit 0 = every file parses (or PowerShell is unavailable and it said so).
 * Exit 1 = at least one file does not parse; the file, line and message print.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* `.venv-ocr` holds a vendored Python virtualenv whose `Activate.ps1` ships from
 * upstream. It is not ours to fix and not ours to gate on. */
const SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.expo', '.tmp-new2', '.venv-ocr',
]);

function ps1Files(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.tmp') || SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) ps1Files(full, out);
    else if (entry.name.endsWith('.ps1') && statSync(full).size > 0) out.push(full);
  }
  return out;
}

/**
 * The check runs under `powershell.exe` (Windows PowerShell 5.1) DELIBERATELY,
 * not `pwsh`. 5.1 is what Task Scheduler invokes on this box, and it is the only
 * one of the two that decodes a BOM-less file as ANSI — so a file that parses
 * under pwsh 7 and fails under 5.1 is exactly the bug being guarded against.
 * Checking with the wrong host would produce a green gate over a dead job.
 */
/* `[char]9` rather than a PowerShell backtick-t escape: this is a JavaScript
 * template literal, and a backtick inside one ends the string. The first draft
 * of this guard failed to parse for the same category of reason it exists to
 * catch — an escape character meaning one thing to the author and another to
 * the reader. */
const TAB = '" + [char]9 + "';
/* The file list arrives through the ENVIRONMENT, not as trailing arguments.
 * `powershell.exe -Command` does not populate `$args` from what follows `--`
 * the way `-File` does: the paths are appended to the command text itself and
 * parsed as code, which fails with `Missing expression after unary operator
 * '--'` and says nothing about the files it was asked to check. An env var also
 * sidesteps quoting entirely for paths containing spaces. */
const PROBE = `
$bad = 0
foreach ($f in ($env:LAWMIND_PS1_FILES -split '\\r?\\n' | Where-Object { $_ })) {
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$errors) | Out-Null
  if ($errors -and $errors.Count -gt 0) {
    $bad++
    foreach ($e in ($errors | Select-Object -First 3)) {
      Write-Output ("FAIL${TAB}" + $f + "${TAB}" + $e.Extent.StartLineNumber + "${TAB}" + $e.Message)
    }
  }
}
exit $bad
`;

const files = ps1Files(REPO);
if (files.length === 0) {
  console.log('powershell syntax: no .ps1 files found — nothing to check');
  process.exit(0);
}

let output = '';
let failed = 0;
try {
  output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PROBE], {
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, LAWMIND_PS1_FILES: files.join('\n') },
  });
} catch (error) {
  /* A non-zero exit is the probe COUNTING bad files, which is the normal
   * failure path and carries its report on stdout. Anything without stdout is
   * the probe itself failing to run, and that is not evidence about the files. */
  output = error.stdout ?? '';
  failed = typeof error.status === 'number' ? error.status : 0;
  if (!output && error.code === 'ENOENT') {
    console.log(
      'powershell syntax: SKIPPED — powershell.exe is not on this machine.\n' +
        '                   The .ps1 files here are Windows Task Scheduler jobs; this gate\n' +
        '                   is meaningful only where they actually run.',
    );
    process.exit(0);
  }
  if (!output) {
    console.error(`powershell syntax: the parser probe could not run — ${error.message}`);
    process.exit(1);
  }
}

const problems = output
  .split(/\r?\n/)
  .filter((l) => l.startsWith('FAIL\t'))
  .map((l) => l.split('\t').slice(1));

if (problems.length === 0) {
  console.log(`powershell syntax: OK — ${files.length} .ps1 file(s) parse under Windows PowerShell 5.1`);
  process.exit(0);
}

console.error(`powershell syntax: ${failed || problems.length} file(s) do not parse\n`);
for (const [file, line, message] of problems) {
  console.error(`  ${relative(REPO, file)}:${line}  ${message}`);
}
console.error(
  '\nA .ps1 that does not parse runs NOTHING, while its scheduled task still reports\n' +
    'that it fired. If the message names a token far from anything you edited, suspect a\n' +
    'NON-ASCII CHARACTER INSIDE A DOUBLE-QUOTED STRING: these files carry no BOM, so\n' +
    'PowerShell 5.1 decodes them as ANSI and a UTF-8 em dash becomes `â€"` — whose third\n' +
    'character closes the string. Use ASCII -- inside strings; em dashes are safe only\n' +
    'inside <# #> comment blocks.',
);
process.exit(1);
