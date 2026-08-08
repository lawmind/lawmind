'use client';

import { useEffect, useMemo, useState } from 'react';

import { citationRender } from '@lawmind/citation';
import {
  fetchDispute,
  fetchDisputes,
  reject,
  uphold,
  type Dispute,
  type DisputeDetail,
  type DisputeStatus,
  type OverruledStatus,
} from '@/lib/disputes';
import { percent } from '@/lib/citations';

/**
 * 61 · DISPUTED CITATIONS — "outranks everything else in the admin"
 * (`sprints/SPRINT_6.md`). Wired 8 Aug 2026 against the real endpoints.
 *
 * `design/screens/renders/40-admin-disputes.png` is the layout reference
 * (PD-11: layout only). It shows a severity tag, a report count, a median
 * time to resolve and an advocate name per row — **none of those exist
 * server-side.** `GET /admin/disputes` returns one row per report with a
 * free-text `claim`, a status, and `reported_by_user_id` (a bare id, no name
 * join). Rendering the render's fields would mean inventing them; this page
 * renders what the endpoint actually returns instead.
 */

const STATUS_LABEL: Record<DisputeStatus, string> = {
  open: 'Open',
  upheld: 'Upheld — corpus corrected',
  rejected: 'Rejected — badge was correct',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Page() {
  const [all, setAll] = useState<Dispute[]>([]);
  const [falseVerifiedRate, setFalseVerifiedRate] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DisputeStatus | ''>('open');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, DisputeDetail>>({});
  const [detailError, setDetailError] = useState<Record<string, string>>({});
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void fetchDisputes().then((r) => {
      if (r.ok) {
        setAll(r.data.disputes);
        setFalseVerifiedRate(r.data.falseVerifiedRate);
      } else {
        setLoadError(`${r.error.code}: ${r.error.message}`);
      }
    });
  }, []);

  const counts = useMemo(() => {
    const base = { open: 0, upheld: 0, rejected: 0 };
    for (const d of all) base[d.status] += 1;
    return base;
  }, [all]);

  const visible = filter ? all.filter((d) => d.status === filter) : all;

  async function toggleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!detail[id]) {
      const r = await fetchDispute(id);
      if (r.ok) setDetail((d) => ({ ...d, [id]: r.data }));
      else setDetailError((e) => ({ ...e, [id]: `${r.error.code}: ${r.error.message}` }));
    }
  }

  function updateDisputeLocally(id: string, patch: Partial<Dispute>) {
    setAll((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function doUphold(id: string, toStatus: OverruledStatus, notePara: string, note: string, reason: string) {
    if (!reason.trim()) {
      setRowNotes((n) => ({
        ...n,
        [id]: 'A reason is required — the corpus correction and the audit ledger both need one.',
      }));
      return;
    }
    const overruledParas = notePara
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));

    setBusy((b) => ({ ...b, [id]: true }));
    const r = await uphold(id, {
      correction: {
        toStatus,
        overruledParas: overruledParas.length > 0 ? overruledParas : undefined,
        overruledNote: note.trim() || undefined,
      },
      reason,
    });
    setBusy((b) => ({ ...b, [id]: false }));
    if (r.ok) {
      updateDisputeLocally(id, { status: 'upheld' });
      setRowNotes((n) => ({
        ...n,
        [id]: `Corpus corrected. ${r.data.affectedSaved} saved, ${r.data.affectedFiled} filed, ${r.data.notified} notified. Fan-out ${r.data.reverificationJobId}.`,
      }));
    } else {
      setRowNotes((n) => ({ ...n, [id]: `${r.error.code}: ${r.error.message}` }));
    }
  }

  async function doReject(id: string, reason: string) {
    if (!reason.trim()) {
      setRowNotes((n) => ({ ...n, [id]: 'A reason is required for the audit ledger.' }));
      return;
    }
    setBusy((b) => ({ ...b, [id]: true }));
    const r = await reject(id, reason);
    setBusy((b) => ({ ...b, [id]: false }));
    if (r.ok) {
      updateDisputeLocally(id, { status: 'rejected' });
      setRowNotes((n) => ({ ...n, [id]: 'Badge was correct — dispute closed, no correction made.' }));
    } else {
      setRowNotes((n) => ({ ...n, [id]: `${r.error.code}: ${r.error.message}` }));
    }
  }

  return (
    <article className="section causelist-page">
      <p className="eyebrow">Trust and safety</p>
      <h1 className="section-title">Disputed citations</h1>
      <p className="section-notes causelist-tagline">
        An advocate told us a verification badge was wrong. Upholding a dispute writes a
        correction to the corpus and re-runs verification for everyone who saved or filed it —
        the same fan-out the nightly overruled re-check uses.
      </p>

      <div className="metric-grid causelist-summary">
        <SummaryCard label="Open" value={counts.open} breached={counts.open > 0} />
        <SummaryCard label="Upheld" value={counts.upheld} />
        <SummaryCard label="Rejected" value={counts.rejected} />
        <div className={falseVerifiedRate && falseVerifiedRate > 0 ? 'card metric metric-breached' : 'card metric'}>
          <p className="eyebrow">False-verified rate</p>
          <p className="metric-value">{falseVerifiedRate === null ? '—' : percent(falseVerifiedRate)}</p>
          <p className="metric-threshold">
            {falseVerifiedRate === null ? 'No verified citations shown yet' : 'Target zero. Never acceptable.'}
          </p>
        </div>
      </div>

      <div className="causelist-filters">
        <label className="causelist-filter">
          <span className="eyebrow">Status</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as DisputeStatus | '')}>
            <option value="open">Open</option>
            <option value="upheld">Upheld</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </label>
      </div>

      {loadError ? <p className="causelist-row-note">{loadError}</p> : null}

      <div className="card causelist-table-card dispute-list">
        {visible.length === 0 ? (
          <p className="section-notes dispute-empty">Nothing in this filter.</p>
        ) : (
          visible.map((d) => (
            <DisputeRow
              key={d.id}
              dispute={d}
              expanded={expanded === d.id}
              detail={detail[d.id]}
              detailError={detailError[d.id]}
              note={rowNotes[d.id]}
              busy={!!busy[d.id]}
              onToggle={() => void toggleExpand(d.id)}
              onUphold={(toStatus, paras, note, reason) => void doUphold(d.id, toStatus, paras, note, reason)}
              onReject={(reason) => void doReject(d.id, reason)}
            />
          ))
        )}
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

function statusPillClass(status: DisputeStatus): string {
  if (status === 'open') return 'causelist-status-failed';
  if (status === 'upheld') return 'causelist-status-stale';
  return 'causelist-status-ok';
}

function DisputeRow({
  dispute,
  expanded,
  detail,
  detailError,
  note,
  busy,
  onToggle,
  onUphold,
  onReject,
}: {
  dispute: Dispute;
  expanded: boolean;
  detail: DisputeDetail | undefined;
  detailError: string | undefined;
  note: string | undefined;
  busy: boolean;
  onToggle: () => void;
  onUphold: (toStatus: OverruledStatus, paras: string, note: string, reason: string) => void;
  onReject: (reason: string) => void;
}) {
  const [toStatus, setToStatus] = useState<OverruledStatus>('set_aside');
  const [paras, setParas] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div className="dispute-row">
      <div className="dispute-row-head">
        <div className="failing-main">
          <span className={`causelist-status ${statusPillClass(dispute.status)}`}>{STATUS_LABEL[dispute.status]}</span>
          <p className="legal dispute-claim">{dispute.claim}</p>
          <p className="record">
            citation check {dispute.citationCheckId ?? '—'} · judgment {dispute.judgmentId ?? '—'} · reported by{' '}
            {dispute.reportedBy.slice(0, 8)} · {formatDate(dispute.createdAt)}
          </p>
        </div>
        <div className="failing-action">
          <button className="button-secondary" onClick={onToggle} type="button">
            {expanded ? 'Close' : 'Review'}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="dispute-detail">
          {detailError ? <p className="causelist-row-note">{detailError}</p> : null}
          {!detail && !detailError ? <p className="section-notes">Loading…</p> : null}
          {detail ? (
            <>
              {detail.judgment ? (
                <p className="section-notes">
                  <strong>{detail.judgment.case_title}</strong> · {detail.judgment.court} ·{' '}
                  {detail.judgment.judgment_date} · current status: {detail.judgment.overruled_status}
                </p>
              ) : (
                <p className="section-notes">No judgment matched — nothing for a fan-out to act on.</p>
              )}
              {detail.citationCheck ? (
                <p className="section-notes">
                  Shown as: {detail.citationCheck.verification_state} via {detail.citationCheck.verified_by_source}
                  {detail.citationCheck.overruled_status_shown
                    ? `, overruled status shown was ${detail.citationCheck.overruled_status_shown}`
                    : ''}
                  {' · '}
                  {citationRender({
                    verificationState: detail.citationCheck.verification_state,
                    overruledStatus: detail.judgment?.overruled_status ?? 'none',
                    overruledNote: detail.judgment?.overruled_note,
                    overruledParas: detail.judgment?.overruled_paras ?? undefined,
                  }).existence.kind === 'silent'
                    ? 'renders silent to the advocate'
                    : 'renders the unconfirmed dashed card to the advocate'}
                </p>
              ) : null}
              <p className="section-notes">
                Impact if upheld: {detail.impact.savedCount} saved · {detail.impact.filedCount} filed ·{' '}
                {detail.impact.copiedCount} copied out
              </p>

              {dispute.status === 'open' ? (
                <div className="card dispute-form">
                  <p className="eyebrow">Resolve</p>
                  <label className="causelist-filter">
                    <span className="eyebrow">Correct status, if upholding</span>
                    <select value={toStatus} onChange={(e) => setToStatus(e.target.value as OverruledStatus)}>
                      <option value="set_aside">Set aside</option>
                      <option value="partly_set_aside">Partly set aside</option>
                      <option value="doubted">Doubted</option>
                      <option value="none">None — good law</option>
                    </select>
                  </label>
                  <input
                    className="dispute-input"
                    onChange={(e) => setParas(e.target.value)}
                    placeholder="Affected paragraphs, comma-separated (optional)"
                    value={paras}
                  />
                  <input
                    className="dispute-input"
                    onChange={(e) => setCorrectionNote(e.target.value)}
                    placeholder="Correction note (optional)"
                    value={correctionNote}
                  />
                  <input
                    className="dispute-input"
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (required — goes to the audit ledger)"
                    value={reason}
                  />
                  <div className="dispute-form-actions">
                    <button
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => onUphold(toStatus, paras, correctionNote, reason)}
                      type="button"
                    >
                      Uphold — fix corpus
                    </button>
                    <button className="button-secondary" disabled={busy} onClick={() => onReject(reason)} type="button">
                      Badge was correct
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {note ? <p className="causelist-row-note">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
