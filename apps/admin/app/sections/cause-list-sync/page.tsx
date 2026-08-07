'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  escalateCauseList,
  fetchCauseLists,
  retryCauseList,
  type CauseListSync,
  type CauseListsResponse,
  type StaleCourt,
  type SyncStatus,
} from '@/lib/causeListSync';

/**
 * 59 · CAUSE LIST SYNC — `design/screens/renders/39-admin-causelist.png` is the
 * layout reference (PD-11: layout only, not colour — same `tokens.ts` as the
 * app). Wired 8 Aug 2026 against the real endpoints, all three BUILT and
 * verified live, not just column-marked (`docs/API_CONTRACTS.md` §Cause list
 * sync). `apps/admin/lib/causeListSync.ts` carries the shape notes; this file
 * only renders them.
 *
 * The render's summary strip names things this endpoint does not return —
 * "courts tracked", a per-advocate impact list. Trigger 4 (a matter listed on
 * a date nobody entered) has no producer yet: `GET /admin/cause-lists` is
 * per-court sync health, not per-matter, and there is no cause-list-to-matter
 * matcher in the codebase (`docs/API_CONTRACTS.md` §Citator alerts). Rather
 * than invent advocate names to match the render, the counts below are
 * derived from what actually came back, and the per-advocate panel is left
 * out rather than faked.
 *
 * NO ADMIN AUTH EXISTS YET. `retry` and `escalate` will both 401 today —
 * that is correct, documented behaviour, not a bug in this page. The buttons
 * make the real call and render the server's own refusal rather than
 * pretending the action happened or hiding the button until auth ships.
 */

const STATUS_LABEL: Record<SyncStatus, string> = {
  ok: 'Synced',
  empty: 'Synced — empty',
  stale: 'Stale',
  failed: 'Failed',
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function Page() {
  const [date, setDate] = useState(todayUtc());
  const [statusFilter, setStatusFilter] = useState<SyncStatus | ''>('');
  const [data, setData] = useState<CauseListsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    setData(null);
    setLoadError(null);
    void fetchCauseLists({ date, status: statusFilter || undefined }).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else setLoadError(`${r.error.code}: ${r.error.message}`);
    });
    return () => {
      alive = false;
    };
  }, [date, statusFilter]);

  const counts = useMemo(() => {
    const base: Record<SyncStatus, number> = { ok: 0, empty: 0, stale: 0, failed: 0 };
    for (const s of data?.syncs ?? []) base[s.status] += 1;
    return base;
  }, [data]);

  const worst = useMemo(() => {
    const failing = (data?.syncs ?? []).filter((s) => s.status === 'failed' || s.status === 'stale');
    if (failing.length === 0) return null;
    return failing.slice().sort((a, b) => b.retryCount - a.retryCount)[0] ?? null;
  }, [data]);

  async function doRetry(sync: CauseListSync) {
    setBusy((b) => ({ ...b, [sync.id]: true }));
    const r = await retryCauseList(sync.id);
    setBusy((b) => ({ ...b, [sync.id]: false }));
    if (r.ok) {
      setRowNotes((n) => ({ ...n, [sync.id]: `Retried — now ${STATUS_LABEL[r.data.sync.status]}.` }));
      setData((d) => (d ? { ...d, syncs: d.syncs.map((s) => (s.id === sync.id ? r.data.sync : s)) } : d));
    } else {
      // Honest refusal, not a swallowed error — see module note on admin auth.
      setRowNotes((n) => ({ ...n, [sync.id]: `${r.error.code}: ${r.error.message}` }));
    }
  }

  async function doEscalate(sync: CauseListSync) {
    setBusy((b) => ({ ...b, [sync.id]: true }));
    const r = await escalateCauseList(sync.id, true);
    setBusy((b) => ({ ...b, [sync.id]: false }));
    if (r.ok) {
      // advocatesNotified is always false today — render notificationNote, never
      // a synthesised "advocates informed". See lib/causeListSync.ts note 1.
      setRowNotes((n) => ({
        ...n,
        [sync.id]: `${r.data.briefingsMarked} briefing(s) marked unconfirmed. ${r.data.notificationNote}`,
      }));
      setData((d) => (d ? { ...d, syncs: d.syncs.map((s) => (s.id === sync.id ? r.data.sync : s)) } : d));
    } else {
      setRowNotes((n) => ({ ...n, [sync.id]: `${r.error.code}: ${r.error.message}` }));
    }
  }

  return (
    <article className="section causelist-page">
      <p className="eyebrow">Trust and safety</p>
      <h1 className="section-title">Cause list sync</h1>
      <p className="section-notes causelist-tagline">
        Every briefing is built from a scraped cause list. A parser that silently returns an
        empty list is worse than an outage — briefings still go out, with stale dates.
      </p>

      {worst ? (
        <div className="card causelist-banner">
          <p className="eyebrow">
            {worst.status === 'failed' ? 'Failed' : 'Stale'} · {worst.court}
          </p>
          <p className="causelist-banner-title">
            {worst.court} has not confirmed {worst.listDate}
            {worst.retryCount > 0 ? ` after ${worst.retryCount} ${worst.retryCount === 1 ? 'retry' : 'retries'}` : ''}.
          </p>
          {worst.error ? <p className="section-notes">{worst.error}</p> : null}
          <div className="causelist-actions">
            <button
              className="button-secondary"
              disabled={busy[worst.id]}
              onClick={() => void doRetry(worst)}
              type="button"
            >
              Retry now
            </button>
            <button
              className="button-secondary"
              disabled={busy[worst.id]}
              onClick={() => void doEscalate(worst)}
              type="button"
            >
              Escalate — mark briefings unconfirmed
            </button>
          </div>
          {rowNotes[worst.id] ? <p className="causelist-row-note">{rowNotes[worst.id]}</p> : null}
        </div>
      ) : null}

      <div className="metric-grid causelist-summary">
        <SummaryCard label="Synced" value={counts.ok} />
        <SummaryCard label="Synced — empty" value={counts.empty} />
        <SummaryCard label="Stale" value={counts.stale} breached={counts.stale > 0} />
        <SummaryCard label="Failed" value={counts.failed} breached={counts.failed > 0} />
      </div>

      <div className="causelist-filters">
        <label className="causelist-filter">
          <span className="eyebrow">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="causelist-filter">
          <span className="eyebrow">Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SyncStatus | '')}>
            <option value="">All</option>
            <option value="ok">Synced</option>
            <option value="empty">Synced — empty</option>
            <option value="stale">Stale</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        {data ? <span className="record causelist-asof">As of {formatTime(data.asOf)}</span> : null}
      </div>

      {loadError ? <p className="causelist-row-note">{loadError}</p> : null}

      <div className="causelist-layout">
        <div className="card causelist-table-card">
          <table className="causelist-table">
            <thead>
              <tr>
                <th>Court</th>
                <th>List date</th>
                <th>Status</th>
                <th>Items</th>
                <th>Pulled</th>
                <th>Retries</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.syncs ?? []).map((sync) => (
                <tr key={sync.id}>
                  <td>{sync.court}</td>
                  <td className="record">{sync.listDate}</td>
                  <td>
                    <span className={`causelist-status causelist-status-${sync.status}`}>
                      {STATUS_LABEL[sync.status]}
                    </span>
                    {sync.escalatedAt ? <span className="causelist-escalated-mark">escalated</span> : null}
                  </td>
                  <td className="record">{sync.itemCount}</td>
                  <td className="record">{formatTime(sync.completedAt ?? sync.startedAt)}</td>
                  <td className="record">{sync.retryCount}</td>
                  <td className="causelist-row-actions">
                    <button
                      className="button-secondary"
                      disabled={busy[sync.id]}
                      onClick={() => void doRetry(sync)}
                      type="button"
                    >
                      Retry
                    </button>
                    <button
                      className="button-secondary"
                      disabled={busy[sync.id] || sync.status === 'ok' || sync.status === 'empty'}
                      onClick={() => void doEscalate(sync)}
                      title={
                        sync.status === 'ok' || sync.status === 'empty'
                          ? "This court was heard from — its dates are confirmed. Nothing to escalate."
                          : undefined
                      }
                      type="button"
                    >
                      Escalate
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.syncs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="section-notes">
                    No syncs for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {Object.entries(rowNotes)
            .filter(([id]) => id !== worst?.id)
            .map(([id, note]) => (
              <p key={id} className="causelist-row-note">
                {data?.syncs.find((s) => s.id === id)?.court ?? id}: {note}
              </p>
            ))}
        </div>

        <div className="causelist-side">
          <div className="card">
            <p className="eyebrow">Courts not confirmed today</p>
            {(data?.staleCourts ?? []).length === 0 ? (
              <p className="section-notes">Every tracked court has been heard from as of the last sweep.</p>
            ) : (
              <ul className="causelist-stale-list">
                {(data?.staleCourts ?? []).map((c) => (
                  <StaleCourtRow key={c.court} court={c} />
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <p className="eyebrow">Escalation policy</p>
            <p className="section-notes">
              <strong>Retry</strong> re-pulls the court now. If it is still stale or failed after a
              retry, briefings for that court are marked unconfirmed automatically — no separate
              click required.
            </p>
            <p className="section-notes">
              <strong>Escalate</strong> applies that same mark immediately, for when a retry is not
              worth attempting. It also accepts a request to notify advocates directly — recorded,
              not yet delivered, since direct notification ships with the daily loop. The response
              says so in plain words rather than reporting the notification as sent.
            </p>
            <p className="section-notes">
              A sync that is <strong>Synced</strong> or <strong>Synced — empty</strong> cannot be
              escalated — the court was heard from, so its dates are confirmed. We never present an
              unconfirmed listing as confirmed, the same rule as citations.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function SummaryCard({ label, value, breached }: { label: string; value: number; breached?: boolean }) {
  return (
    <div className={breached ? 'card metric metric-breached' : 'card metric'}>
      <p className="eyebrow">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

function StaleCourtRow({ court }: { court: StaleCourt }) {
  return (
    <li className="causelist-stale-row">
      <span>{court.court}</span>
      <span className="record">
        {court.lastConfirmedDate === null
          ? 'never pulled'
          : `last confirmed ${court.lastConfirmedDate}`}
        {court.failingSyncs > 0 ? ` · ${court.failingSyncs} failing` : ''}
      </span>
    </li>
  );
}
