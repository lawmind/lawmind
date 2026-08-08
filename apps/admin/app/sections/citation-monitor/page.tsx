'use client';

import { useEffect, useState } from 'react';

import { THRESHOLDS, breaches, fetchCitationsMonitor, percent, type CitationMonitor } from '@/lib/citations';

/**
 * 60 · CITATION MONITOR — the third place verification stays visible, and the
 * only one that is not an advocate asking.
 *
 * Wired 8 Aug 2026 against the real `GET /admin/citations` (was a fixture
 * pending this endpoint — see `apps/mobile`/`apps/admin` handoff docs).
 * `apps/admin/lib/citations.ts` carries the full note on what changed: the
 * "failing references" list and its "notify affected advocates" action from
 * the earlier fixture have no backing endpoint and are not rendered here —
 * the real endpoint returns aggregates only. `staleOverruledRate` is also not
 * computed server-side yet, so that metric card is omitted rather than shown
 * as a fabricated zero.
 *
 * `docs/ADMIN_SURFACE.md` §5. The app went silent about verification on
 * purpose; this desk did not. `verified_by_source` and the raw counts surface
 * here and nowhere else in the product.
 */
export default function Page() {
  const [data, setData] = useState<CitationMonitor | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCitationsMonitor().then((r) => {
      if (r.ok) setData(r.data);
      else setLoadError(`${r.error.code}: ${r.error.message}`);
    });
  }, []);

  return (
    <article className="section">
      <p className="eyebrow">Trust and safety</p>
      <h1 className="section-title">Citation monitor</h1>

      {loadError ? <p className="causelist-row-note">{loadError}</p> : null}
      {!data && !loadError ? <p className="section-notes">Loading…</p> : null}

      {data ? (
        <>
          <div className="metric-grid">
            <Metric
              detail="No tier could confirm the reference. Alerts above 2.5% — some references genuinely cannot be confirmed, and saying so is the product working."
              label="Failure rate"
              threshold={THRESHOLDS.failureRate}
              value={data.failureRate}
            />
            <Metric
              detail="Extracted by the pipeline, then never shown to the advocate in any state. They cannot correct what they were not shown."
              label="Silent drop"
              threshold={THRESHOLDS.silentDropRate}
              value={data.silentDropRate}
              zero
            />
            <Metric
              detail="A dispute was upheld against a citation that was verified when shown."
              label="False verified"
              threshold={THRESHOLDS.falseVerifiedRate}
              value={data.falseVerifiedRate}
              zero
            />
          </div>

          <p className="section-notes">
            {data.total} citation check{data.total === 1 ? '' : 's'} in range.
          </p>

          <h2 className="section-subtitle">By state</h2>
          <div className="card">
            <Breakdown label="Does it exist?" rows={data.byVerificationState} total={data.total} />
            <Breakdown label="Is it still good law? (current)" rows={data.byOverruledStatus} total={data.total} />
          </div>
        </>
      ) : null}
    </article>
  );
}

function Metric({
  label,
  value,
  threshold,
  detail,
  zero = false,
}: {
  label: string;
  value: number | null;
  threshold: number;
  detail: string;
  zero?: boolean;
}) {
  const bad = value !== null && breaches(value, threshold);
  return (
    <div className={bad ? 'card metric metric-breached' : 'card metric'}>
      <p className="eyebrow">{label}</p>
      <p className="metric-value">{value === null ? '—' : percent(value)}</p>
      <p className="metric-threshold">
        {value === null
          ? 'No citations in range'
          : `${zero ? 'Threshold zero' : `Alerts above ${percent(threshold)}`}${bad ? ' — breached' : ''}`}
      </p>
      <p className="metric-detail">{detail}</p>
    </div>
  );
}

function Breakdown({ label, rows, total }: { label: string; rows: Record<string, number | undefined>; total: number }) {
  const entries = Object.entries(rows).filter(([, n]) => n !== undefined) as [string, number][];
  return (
    <div className="breakdown">
      <p className="eyebrow">{label}</p>
      {entries.length === 0 ? (
        <p className="section-notes">Nothing in range.</p>
      ) : (
        entries.map(([name, count]) => (
          <div className="breakdown-row" key={name}>
            <span className="breakdown-name">{name}</span>
            <span className="record">
              {count} · {percent(total ? count / total : 0)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
