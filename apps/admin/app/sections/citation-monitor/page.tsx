'use client';

import { useState } from 'react';

import { citationRender } from '@lawmind/citation';
import { MOCK_FAILING, MOCK_METRICS, THRESHOLDS, breaches, percent } from '@/lib/citations';

/**
 * 60 · CITATION MONITOR — the third place verification stays visible, and the
 * only one that is not an advocate asking.
 *
 * `docs/ADMIN_SURFACE.md` §5. The app went silent about verification on
 * purpose; this desk did not. An operator triaging a disputed citation must see
 * the full state, which is why `verified_by_source` and the raw counts surface
 * here and nowhere else in the product.
 *
 * ADMIN_SURFACE governing rule 3: "The verification badge renders identically
 * in admin and app — SAME COMPONENT, SAME DERIVATION from the three fields. An
 * admin triaging a disputed citation must see exactly what the advocate saw, or
 * the queue is worthless as evidence."
 *
 * The component cannot literally be shared — the app is React Native, the desk
 * is the DOM — so what is shared is the part that DECIDES: `citationRender` is
 * imported from the app, unmodified. A second copy of that logic here would be
 * a second place that can decide differently, and the whole point of the queue
 * is that it shows what the advocate was shown.
 *
 * THE SILENT UI RAISES THE STAKES ON THESE NUMBERS. When every verified
 * citation carried a badge, a missing badge was itself a signal. Now a clean
 * citation and one whose LAW MOVED treatment failed to render look identical on
 * screen. These metrics are the only thing standing between those two cases.
 */
export default function Page() {
  const [notified, setNotified] = useState<string[]>([]);
  const m = MOCK_METRICS;

  return (
    <article className="section">
      <p className="eyebrow">Trust and safety</p>
      <h1 className="section-title">Citation monitor</h1>

      <div className="metric-grid">
        <Metric
          detail="No tier could confirm the reference. Alerts above 2.5% — some references genuinely cannot be confirmed, and saying so is the product working."
          label="Failure rate"
          threshold={THRESHOLDS.failureRate}
          value={m.failureRate}
        />
        <Metric
          detail="Referenced by the model, then never shown to the advocate. They cannot correct what they were not shown."
          label="Silent drop"
          threshold={THRESHOLDS.silentDropRate}
          value={m.silentDropRate}
          zero
        />
        <Metric
          detail="Shown as safe to file, and was not."
          label="False verified"
          threshold={THRESHOLDS.falseVerifiedRate}
          value={m.falseVerifiedRate}
          zero
        />
        <Metric
          detail="Rendered without the LAW MOVED mark while the live status had already moved. As severe as a hallucination."
          label="Stale overruled"
          threshold={THRESHOLDS.staleOverruledRate}
          value={m.staleOverruledRate}
          zero
        />
      </div>

      <h2 className="section-subtitle">By state</h2>
      <div className="card">
        <Breakdown
          label="Does it exist?"
          rows={[
            ['Verified', m.byVerificationState.verified],
            ['Unverified', m.byVerificationState.unverified],
            ['Failed — a tier was unreachable', m.byVerificationState.failed],
          ]}
          total={m.total}
        />
        {/*
          `failed` is kept separate from `unverified` HERE and merged in the app.
          The advocate cannot act on the difference, so the app shows one thing;
          an operator can, and merging them would let a provider outage
          masquerade as a gap in the corpus — the wrong thing then gets fixed.
        */}
        <Breakdown
          label="Is it still good law?"
          rows={[
            ['Good law', m.byOverruledStatus.none],
            ['Set aside', m.byOverruledStatus.set_aside],
            ['Partly set aside', m.byOverruledStatus.partly_set_aside],
            ['Doubted', m.byOverruledStatus.doubted],
          ]}
          total={m.total}
        />
      </div>

      <h2 className="section-subtitle">Failing references</h2>
      <p className="section-notes">
        Every one of these was shown to the advocate in its unconfirmed state — none was dropped.
        Where a draft citing it has already been exported, the citation has left the app and we
        cannot know where it went.
      </p>

      <div className="card">
        {MOCK_FAILING.map((f) => {
          const { existence } = citationRender({
            verificationState: 'unverified',
            overruledStatus: 'none',
          });
          const done = notified.includes(f.searchId);
          return (
            <div className="failing-row" key={f.searchId}>
              <div className="failing-main">
                <span className="record">{f.citationClaimed}</span>
                <p className="legal">{f.query}</p>
                <p className="failing-cause">{f.cause}</p>
                <p className="failing-shown">
                  Shown to the advocate as:{' '}
                  {existence.kind === 'unconfirmed' ? existence.headline : '—'}
                </p>
              </div>
              <div className="failing-action">
                <span className="record">
                  {f.exportedCount === 0
                    ? 'Not exported'
                    : f.exportedCount === 1
                      ? '1 export'
                      : `${f.exportedCount} exports`}
                </span>
                {/*
                  PRIVILEGED — writes `citation.notify_affected` to the audit
                  ledger in the same transaction as the action. Disabled where
                  nothing was exported: there is nobody to tell, and a
                  notification with no recipient is a log line pretending to be
                  an action.
                */}
                <button
                  className="button-secondary"
                  disabled={f.exportedCount === 0 || done}
                  onClick={() => setNotified((n) => [...n, f.searchId])}
                  type="button"
                >
                  {done ? 'Advocates notified' : 'Notify affected advocates'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
  value: number;
  threshold: number;
  detail: string;
  zero?: boolean;
}) {
  const bad = breaches(value, threshold);
  return (
    <div className={bad ? 'card metric metric-breached' : 'card metric'}>
      <p className="eyebrow">{label}</p>
      <p className="metric-value">{percent(value)}</p>
      <p className="metric-threshold">
        {zero ? 'Threshold zero' : `Alerts above ${percent(threshold)}`}
        {bad ? ' — breached' : ''}
      </p>
      <p className="metric-detail">{detail}</p>
    </div>
  );
}

function Breakdown({
  label,
  rows,
  total,
}: {
  label: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <div className="breakdown">
      <p className="eyebrow">{label}</p>
      {rows.map(([name, count]) => (
        <div className="breakdown-row" key={name}>
          <span className="breakdown-name">{name}</span>
          <span className="record">
            {count} · {percent(total ? count / total : 0)}
          </span>
        </div>
      ))}
    </div>
  );
}
