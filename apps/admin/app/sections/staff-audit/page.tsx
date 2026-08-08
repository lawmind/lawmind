'use client';

import { useState } from 'react';

import { fetchAudit, type AuditEntry } from '@/lib/audit';

/**
 * 71 · STAFF & AUDIT — audit ledger only. See `apps/admin/lib/audit.ts` for
 * why the canvas's "Staff and roles" table isn't built here: no role column,
 * no staff-listing endpoint. `ADMIN_SURFACE.md` §15's named gap, not an
 * oversight.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Page() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(reset: boolean) {
    const r = await fetchAudit({
      action: action || undefined,
      targetType: targetType || undefined,
      cursor: reset ? undefined : (cursor ?? undefined),
    });
    setLoaded(true);
    if (r.ok) {
      setEntries((prev) => (reset ? r.data.entries : [...prev, ...r.data.entries]));
      setCursor(r.data.nextCursor);
      setLoadError(null);
    } else {
      setLoadError(`${r.error.code}: ${r.error.message}`);
    }
  }

  return (
    <article className="section causelist-page">
      <p className="eyebrow">Governance</p>
      <h1 className="section-title">Staff &amp; audit</h1>
      <p className="section-notes causelist-tagline">
        Append-only. Every privileged action writes this ledger in the same transaction as the
        action itself — an action cannot succeed while its audit row fails.
      </p>
      <p className="section-notes">
        Staff and role management is not built here: `ADMIN_SURFACE.md` §15 — there is no role
        column on `users` yet, and no endpoint lists or invites staff. Every admin write today
        gates on being any authenticated advocate, not a verified admin. This page shows only the
        ledger, which is real.
      </p>

      <div className="causelist-filters">
        <label className="causelist-filter">
          <span className="eyebrow">Action</span>
          <input onChange={(e) => setAction(e.target.value)} placeholder="e.g. dispute.uphold" value={action} />
        </label>
        <label className="causelist-filter">
          <span className="eyebrow">Target type</span>
          <input onChange={(e) => setTargetType(e.target.value)} placeholder="e.g. platform_config" value={targetType} />
        </label>
        <button className="button-secondary" onClick={() => void load(true)} type="button">
          Search
        </button>
      </div>

      {!loaded ? (
        <button className="button-secondary" onClick={() => void load(true)} type="button">
          Load the ledger
        </button>
      ) : null}

      {loadError ? <p className="causelist-row-note">{loadError}</p> : null}

      {loaded && entries.length === 0 && !loadError ? (
        <p className="section-notes">Nothing in the ledger yet, or nothing matches this filter.</p>
      ) : null}

      {entries.length > 0 ? (
        <div className="card causelist-table-card dispute-list">
          {entries.map((e) => (
            <div className="dispute-row" key={e.id}>
              <div className="dispute-row-head">
                <div className="failing-main">
                  <span className="eyebrow">{e.action}</span>
                  <p className="legal dispute-claim">
                    {e.targetType}
                    {e.targetId ? ` ${e.targetId}` : ''}
                    {e.reason ? ` — ${e.reason}` : ''}
                  </p>
                  <p className="record">
                    {formatDate(e.createdAt)} · {e.actorRole} {e.actorUserId.slice(0, 8)}
                  </p>
                </div>
                <div className="failing-action">
                  <button
                    className="button-secondary"
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    type="button"
                  >
                    {expanded === e.id ? 'Close' : 'Diff'}
                  </button>
                </div>
              </div>
              {expanded === e.id ? (
                <div className="dispute-detail">
                  <p className="section-notes">Before</p>
                  <pre className="record audit-json">{JSON.stringify(e.before, null, 2) ?? 'null'}</pre>
                  <p className="section-notes">After</p>
                  <pre className="record audit-json">{JSON.stringify(e.after, null, 2) ?? 'null'}</pre>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {cursor ? (
        <button className="button-secondary" onClick={() => void load(false)} type="button">
          Load more
        </button>
      ) : null}
    </article>
  );
}
