/**
 * Where `globalSetup` leaves the fixture identifiers, and what they mean.
 *
 * The spec files cannot import the boot script — it opens database connections
 * and binds ports, and jest would run it once per worker. They read this file
 * instead, which is written by the one process that did boot it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export type E2eHandshake = {
  /** The API the real client is pointed at. */
  baseUrl: string;
  /** The generation switch and the user-database reads. Never given to the client. */
  controlUrl: string;
  matterId: string;
  /** Present in generation A, absent from generation B. */
  judgmentId: string;
  /** In neither generation. A genuinely unknown id, for the no-live-row 409. */
  absentJudgmentId: string;
  profileBacked: { authId: string; email: string; token: string };
  identityOnly: { authId: string; email: string; token: string };
};

export const HANDSHAKE_PATH = join(tmpdir(), 'lawmind-rcc-r25-e2e.json');

export function readHandshake(): E2eHandshake {
  return JSON.parse(readFileSync(HANDSHAKE_PATH, 'utf8')) as E2eHandshake;
}

/** Move the served corpus generation. A rollback is `B`; recovery is `A`. */
export async function setGeneration(control: string, active: 'A' | 'B'): Promise<void> {
  const res = await fetch(`${control}/generation?active=${active}`, { method: 'POST' });
  if (!res.ok) throw new Error(`generation switch failed: ${res.status}`);
}

/**
 * What the USER database holds for the fixture matter.
 *
 * "Nothing was written" has no response shape — the client cannot observe the
 * absence of a row through the API it has — so the assertion is made here.
 */
export async function authorityRows(
  control: string,
): Promise<{ total: number; live: { authorityId: string; judgmentId: string }[] }> {
  return (await fetch(`${control}/rows`)).json() as Promise<{
    total: number;
    live: { authorityId: string; judgmentId: string }[];
  }>;
}

export async function dataRequestRows(
  control: string,
  authId: string,
): Promise<{ rows: { id: string; authId: string; userId: string | null; kind: string }[] }> {
  return (await fetch(`${control}/data-requests?authId=${encodeURIComponent(authId)}`)).json() as Promise<{
    rows: { id: string; authId: string; userId: string | null; kind: string }[];
  }>;
}

export async function profileRowCount(control: string, authId: string): Promise<number> {
  const body = (await (
    await fetch(`${control}/profile-rows?authId=${encodeURIComponent(authId)}`)
  ).json()) as { count: number };
  return body.count;
}
