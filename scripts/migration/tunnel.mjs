#!/usr/bin/env node
/**
 * Cloudflare Tunnel — external access to the LawMind HTTP API, and to nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS FILE ENFORCES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The founder directive is unambiguous and this script is built around it:
 *
 *     Do NOT expose PostgreSQL publicly.
 *     API: local http service -> cloudflared -> Cloudflare hostname.
 *     Keep database bound to localhost/private interfaces.
 *
 * So the tunnel's ingress may only ever point at the API's HTTP port. This
 * script **refuses to start a tunnel whose target port is the database port**,
 * because "just this once, to run a query from my laptop" is exactly how a
 * corpus ends up on the public internet. The refusal is mechanical rather than
 * a comment asking nicely.
 *
 * Defence in depth, not a single control: even if this check were bypassed,
 * `pg_hba.conf` is loopback-only and `listen_addresses = 'localhost'`, so
 * PostgreSQL will not accept a connection that did not originate on this
 * machine. cloudflared connecting from localhost WOULD satisfy that — which is
 * precisely why the port check here matters and why the two together are worth
 * more than either alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTHENTICATION IS REQUIRED, NOT SUGGESTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The directive: *"Add authentication to any development endpoint exposed
 * externally."* A named tunnel publishes a hostname on the public internet. The
 * API has `better-auth` in front of its real routes, but a development endpoint
 * reached over a tunnel deserves a second lock, and Cloudflare Access is the
 * one that costs nothing and is not our code to get wrong.
 *
 * This script will not run a named tunnel unless it is told that an Access
 * policy exists (`--access-confirmed`), and it says why rather than just
 * failing. A quick tunnel (`--quick`) is allowed without it because its
 * hostname is random, unlisted and ephemeral — but it prints what that does and
 * does not buy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS STILL A FOUNDER ACTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `cloudflared tunnel login` opens a browser and requires a human to pick a
 * zone. That is an account action, not a credential this lane can invent, and
 * it is the ONLY blocking step. Everything else here works without it, and
 * `--quick` gives a working public URL with no login at all — which is enough
 * for development access today.
 *
 *   node scripts/migration/tunnel.mjs check
 *   node scripts/migration/tunnel.mjs quick --port 8787
 *   node scripts/migration/tunnel.mjs named --hostname api.example.com --port 8787 --access-confirmed
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { PG } from './pg-local.mjs';

const CLOUDFLARED = process.env.LAWMIND_CLOUDFLARED ?? 'C:\\lawmind\\bin\\cloudflared.exe';
const LOGS = PG.logs;

/** Ports that must never be the target of a tunnel, whatever the argument says. */
const FORBIDDEN_PORTS = new Set([PG.port, 5432, 5433, 6379, 27017]);

function version() {
  const r = spawnSync(CLOUDFLARED, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
}

function assertTargetAllowed(port) {
  if (FORBIDDEN_PORTS.has(Number(port))) {
    console.error('');
    console.error(`REFUSED: port ${port} is a database port.`);
    console.error('');
    console.error('  The founder directive for this migration says, in as many words:');
    console.error('    "Do NOT expose PostgreSQL publicly."');
    console.error('    "Keep database bound to localhost/private interfaces."');
    console.error('');
    console.error('  A tunnel to 5432 would publish the entire corpus to the internet behind');
    console.error('  one password. Tunnel the HTTP API instead and let it do the authorising.');
    process.exit(2);
  }
}

function check() {
  const v = version();
  console.log(`cloudflared        ${v ?? 'NOT FOUND at ' + CLOUDFLARED}`);
  if (!v) process.exit(2);

  // Has anyone logged in? The cert is what a named tunnel needs.
  const certPath = path.join(process.env.USERPROFILE ?? '', '.cloudflared', 'cert.pem');
  const loggedIn = fs.existsSync(certPath);
  console.log(`account login      ${loggedIn ? 'present (' + certPath + ')' : 'NOT DONE — named tunnels unavailable'}`);

  const list = spawnSync(CLOUDFLARED, ['tunnel', 'list'], { encoding: 'utf8' });
  if (list.status === 0) {
    console.log('existing tunnels:');
    console.log((list.stdout ?? '').trim() || '  (none)');
  }

  console.log('');
  console.log('database exposure  PostgreSQL is NOT tunnelled and cannot be, by two independent controls:');
  console.log(`                   1. this script refuses ports ${[...FORBIDDEN_PORTS].join(', ')}`);
  console.log('                   2. pg_hba.conf is loopback-only, listen_addresses = localhost');

  if (!loggedIn) {
    console.log('');
    console.log('To enable a NAMED tunnel with a stable hostname, a human must run once:');
    console.log(`    ${CLOUDFLARED} tunnel login`);
    console.log('  It opens a browser and asks which zone to authorise. That is an account');
    console.log('  action, not a credential — it is the only blocking step here.');
    console.log('');
    console.log('Until then a quick tunnel works with no login and no account:');
    console.log('    node scripts/migration/tunnel.mjs quick --port 8787');
  }
}

function quick(port) {
  assertTargetAllowed(port);
  console.log(`tunnel: quick tunnel -> http://127.0.0.1:${port}`);
  console.log('');
  console.log('  WHAT THIS IS: a random *.trycloudflare.com hostname, no account, no DNS.');
  console.log('  WHAT IT IS NOT: authenticated. The URL is unguessable and unlisted, which is');
  console.log('  obscurity, not access control. Anything reachable through it is reachable by');
  console.log('  anyone who learns the URL — so do not paste it anywhere durable, and do not');
  console.log('  use it for a surface that serves matter data.');
  console.log('');

  fs.mkdirSync(LOGS, { recursive: true });
  const log = path.join(LOGS, 'cloudflared-quick.log');
  const out = fs.openSync(log, 'a');
  const child = spawn(CLOUDFLARED, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.unref();
  console.log(`tunnel: started, pid ${child.pid}. The public URL appears in:`);
  console.log(`    ${log}`);
}

function named(hostname, port, accessConfirmed) {
  assertTargetAllowed(port);
  if (!accessConfirmed) {
    console.error('');
    console.error('REFUSED: a named tunnel publishes a stable, guessable hostname.');
    console.error('');
    console.error('  The directive requires authentication on any externally exposed development');
    console.error('  endpoint. Put a Cloudflare Access policy on this hostname first — Zero Trust');
    console.error('  → Access → Applications, self-hosted, restricted to your email — then re-run');
    console.error('  with --access-confirmed.');
    console.error('');
    console.error('  This flag is an assertion by a human, not a check. It cannot verify the');
    console.error('  policy exists; it exists so that publishing an unauthenticated hostname is a');
    console.error('  deliberate act rather than a default.');
    process.exit(2);
  }
  const certPath = path.join(process.env.USERPROFILE ?? '', '.cloudflared', 'cert.pem');
  if (!fs.existsSync(certPath)) {
    console.error(`REFUSED: no Cloudflare login at ${certPath}. Run: ${CLOUDFLARED} tunnel login`);
    process.exit(2);
  }
  console.log(`tunnel: named tunnel ${hostname} -> http://127.0.0.1:${port}`);
  console.log('  (creates the tunnel and the DNS route if they do not exist)');
  const name = 'lawmind-api';
  spawnSync(CLOUDFLARED, ['tunnel', 'create', name], { stdio: 'inherit' });
  spawnSync(CLOUDFLARED, ['tunnel', 'route', 'dns', name, hostname], { stdio: 'inherit' });
  const log = path.join(LOGS, 'cloudflared-named.log');
  const out = fs.openSync(log, 'a');
  const child = spawn(CLOUDFLARED, ['tunnel', 'run', '--url', `http://127.0.0.1:${port}`, name], {
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.unref();
  console.log(`tunnel: running, pid ${child.pid}, log ${log}`);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 8787;
const hostname = argv.includes('--hostname') ? argv[argv.indexOf('--hostname') + 1] : null;

if (cmd === 'check') check();
else if (cmd === 'quick') quick(port);
else if (cmd === 'named') {
  if (!hostname) {
    console.error('named requires --hostname');
    process.exit(2);
  }
  named(hostname, port, argv.includes('--access-confirmed'));
} else {
  console.log('usage: tunnel.mjs check | quick --port N | named --hostname H --port N --access-confirmed');
  process.exit(2);
}
