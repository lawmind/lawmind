'use client';

import { useEffect, useState } from 'react';

import { fetchUsers, patchEnrolment, type AdminUser, type EnrolmentStatus } from '@/lib/users';

/**
 * 56 · ENROLMENT QUEUE — `renders/16-admin-enrolment-queue.png` is the layout
 * reference (PD-11: layout only). See `apps/admin/lib/users.ts` for what the
 * render draws that has no endpoint (corroborating signals, ask-for-document)
 * — not rendered here.
 */

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

export default function Page() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<EnrolmentStatus>('unverified');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    void fetchUsers(tab).then((r) => {
      if (r.ok) {
        setUsers(r.data.users);
        setSelected((cur) => cur ?? r.data.users[0]?.id ?? null);
      } else {
        setLoadError(`${r.error.code}: ${r.error.message}`);
      }
    });
  }

  useEffect(() => {
    setSelected(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const current = users.find((u) => u.id === selected) ?? null;

  async function decide(status: EnrolmentStatus) {
    if (!current) return;
    setBusy(true);
    const r = await patchEnrolment(current.id, status);
    setBusy(false);
    if (r.ok) {
      setNote(`Marked ${status}.`);
      load();
    } else {
      setNote(`${r.error.code}: ${r.error.message}`);
    }
  }

  return (
    <article className="section causelist-page">
      <p className="eyebrow">Trust and safety</p>
      <h1 className="section-title">Enrolment queue</h1>

      <div className="causelist-filters">
        {(['unverified', 'verified', 'rejected'] as const).map((s) => (
          <button
            className="button-secondary"
            disabled={tab === s}
            key={s}
            onClick={() => setTab(s)}
            type="button"
          >
            {s === 'unverified' ? 'Pending' : s === 'verified' ? 'Approved' : 'Rejected'}
          </button>
        ))}
      </div>

      {loadError ? <p className="causelist-row-note">{loadError}</p> : null}

      <div className="causelist-layout">
        <div className="card causelist-table-card enrolment-list">
          {users.length === 0 ? (
            <p className="section-notes enrolment-empty">Nothing in this queue.</p>
          ) : (
            users.map((u) => (
              <button
                className={u.id === selected ? 'enrolment-row enrolment-row-selected' : 'enrolment-row'}
                key={u.id}
                onClick={() => {
                  setSelected(u.id);
                  setNote(null);
                }}
                type="button"
              >
                <span>
                  <strong>{u.fullName}</strong>
                  <p className="record">{u.barEnrolmentNumber ?? 'no bar number on file'}</p>
                </span>
                <span className="record">{daysAgo(u.createdAt)}</span>
              </button>
            ))
          )}
        </div>

        <div className="causelist-side">
          {current ? (
            <>
              <div className="card">
                <p className="eyebrow">Claimed enrolment</p>
                <h2 className="section-subtitle">{current.fullName}</h2>
                <p className="section-notes">
                  {current.email} · {current.phone}
                </p>
                <p className="record enrolment-detail-row">
                  Bar enrolment number: {current.barEnrolmentNumber ?? 'not provided'}
                </p>
                <p className="record">Subscription: {current.subscriptionTier}</p>
                <p className="record">Joined: {new Date(current.createdAt).toLocaleDateString('en-IN')}</p>
                <p className="record">Current status: {current.enrolmentStatus}</p>
              </div>

              <div className="card dispute-form">
                <p className="eyebrow">Decision</p>
                <div className="dispute-form-actions">
                  <button className="button-secondary" disabled={busy} onClick={() => void decide('verified')} type="button">
                    Approve — mark verified
                  </button>
                  <button className="button-secondary" disabled={busy} onClick={() => void decide('rejected')} type="button">
                    Reject
                  </button>
                  {current.enrolmentStatus !== 'unverified' ? (
                    <button className="button-secondary" disabled={busy} onClick={() => void decide('unverified')} type="button">
                      Return to pending
                    </button>
                  ) : null}
                </div>
                <p className="section-notes">
                  Rejection never removes access. The advocate keeps using Lawmind; only the
                  verified badge is withheld.
                </p>
                {note ? <p className="causelist-row-note">{note}</p> : null}
              </div>
            </>
          ) : (
            <p className="section-notes">Select someone from the queue.</p>
          )}
        </div>
      </div>
    </article>
  );
}
