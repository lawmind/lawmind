'use client';

import { useEffect, useState } from 'react';

import { fetchUsers, type AdminUser, type EnrolmentStatus } from '@/lib/users';

/**
 * 57 · ADVOCATES — no golden render (PD-11); the canvas
 * (`LawMind Admin.dc.html`) has no `isAdvocates` section either. Built as a
 * plain searchable roster off the same `GET /admin/users` the enrolment
 * queue uses, since no other reference exists.
 */

export default function Page() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<EnrolmentStatus | ''>('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchUsers(status || undefined).then((r) => {
      if (r.ok) setUsers(r.data.users);
      else setLoadError(`${r.error.code}: ${r.error.message}`);
    });
  }, [status]);

  const filtered = query.trim()
    ? users.filter(
        (u) =>
          u.fullName.toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase()) ||
          (u.barEnrolmentNumber ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : users;

  return (
    <article className="section causelist-page">
      <p className="eyebrow">Roster</p>
      <h1 className="section-title">Advocates</h1>

      <div className="causelist-filters">
        <label className="causelist-filter">
          <span className="eyebrow">Search</span>
          <input onChange={(e) => setQuery(e.target.value)} placeholder="name, email, bar number" value={query} />
        </label>
        <label className="causelist-filter">
          <span className="eyebrow">Enrolment status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as EnrolmentStatus | '')}>
            <option value="">All</option>
            <option value="unverified">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </div>

      {loadError ? <p className="causelist-row-note">{loadError}</p> : null}

      <div className="card causelist-table-card">
        <table className="causelist-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Bar number</th>
              <th>Status</th>
              <th>Tier</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td className="record">
                  {u.email}
                  <br />
                  {u.phone}
                </td>
                <td className="record">{u.barEnrolmentNumber ?? '—'}</td>
                <td>
                  <span
                    className={
                      u.enrolmentStatus === 'verified'
                        ? 'causelist-status-ok'
                        : u.enrolmentStatus === 'rejected'
                          ? 'causelist-status causelist-status-failed'
                          : 'causelist-status causelist-status-stale'
                    }
                  >
                    {u.enrolmentStatus}
                  </span>
                </td>
                <td className="record">{u.subscriptionTier}</td>
                <td className="record">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="section-notes">
                  Nobody matches.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </article>
  );
}
