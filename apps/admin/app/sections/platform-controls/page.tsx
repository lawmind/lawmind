'use client';

import { useEffect, useState } from 'react';

import {
  KILL_SWITCH_KEYS,
  fetchPlatform,
  setFlag,
  setKillSwitch,
  setMaintenance,
  type ConfigEntry,
  type KillSwitchKey,
  type PlatformResponse,
} from '@/lib/platform';

/**
 * 69 · PLATFORM CONTROLS — `design/screens/renders/15-admin-platform-controls.png`
 * is the layout reference (PD-11: layout only). Wired 8 Aug 2026.
 *
 * THE RENDER SHOWS FIVE KILL SWITCHES WITH A "CNR lookup" ROW. The live set is
 * SIX and does not include one called `cnr_lookup` — `ecourts_harvest` joined
 * 7 Aug 2026, after the render was drawn. `apps/admin/lib/platform.ts` carries
 * the full reasoning; this page renders the fixed set the database CHECK
 * constraint actually enforces, not the render's five.
 *
 * The render also gives each flag a specific product description ("Devanagari
 * body, English citations") and a fixed list of six named flags. Feature flags
 * have no fixed set server-side — `GET /admin/platform` returns whatever rows
 * exist in `platform_config` with `kind = 'flag'`, which may be none. This page
 * renders whatever comes back and offers a form to set any key, rather than
 * a hardcoded list of flags that may not exist yet.
 */

const KILL_SWITCH_LABEL: Record<KillSwitchKey, string> = {
  search: 'Case law search',
  drafting: 'Draft generation',
  briefings: 'Nightly briefing run',
  ocr_intake: 'OCR intake',
  signups: 'New signups',
  ecourts_harvest: 'eCourts harvesting',
};

export default function Page() {
  const [data, setData] = useState<PlatformResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagRollout, setNewFlagRollout] = useState('0');

  function load() {
    void fetchPlatform().then((r) => {
      if (r.ok) setData(r.data);
      else setLoadError(`${r.error.code}: ${r.error.message}`);
    });
  }

  useEffect(load, []);

  async function toggleKillSwitch(key: KillSwitchKey, current: ConfigEntry) {
    const reason = reasons[key]?.trim();
    if (!reason) {
      setNotes((n) => ({ ...n, [key]: 'A reason is required — enforced at the database, not just this form.' }));
      return;
    }
    setBusy((b) => ({ ...b, [key]: true }));
    const r = await setKillSwitch(key, !current.enabled, reason);
    setBusy((b) => ({ ...b, [key]: false }));
    if (r.ok) {
      setNotes((n) => ({ ...n, [key]: `Now ${r.data.killSwitch.enabled ? 'LIVE' : 'OFF'}.` }));
      load();
    } else {
      setNotes((n) => ({ ...n, [key]: `${r.error.code}: ${r.error.message}` }));
    }
  }

  async function toggleMaintenance(enabled: boolean) {
    setBusy((b) => ({ ...b, maintenance: true }));
    const r = await setMaintenance(enabled, maintenanceMessage.trim() || undefined);
    setBusy((b) => ({ ...b, maintenance: false }));
    if (r.ok) load();
    else setNotes((n) => ({ ...n, maintenance: `${r.error.code}: ${r.error.message}` }));
  }

  async function toggleFlag(flag: ConfigEntry) {
    setBusy((b) => ({ ...b, [flag.key]: true }));
    const r = await setFlag(flag.key, !flag.enabled, flag.rolloutPercent ?? undefined);
    setBusy((b) => ({ ...b, [flag.key]: false }));
    if (r.ok) load();
    else setNotes((n) => ({ ...n, [flag.key]: `${r.error.code}: ${r.error.message}` }));
  }

  async function submitNewFlag() {
    const key = newFlagKey.trim();
    if (!key) return;
    const rollout = Number.parseInt(newFlagRollout, 10);
    setBusy((b) => ({ ...b, newFlag: true }));
    const r = await setFlag(key, true, Number.isFinite(rollout) ? rollout : undefined);
    setBusy((b) => ({ ...b, newFlag: false }));
    if (r.ok) {
      setNewFlagKey('');
      load();
    } else {
      setNotes((n) => ({ ...n, newFlag: `${r.error.code}: ${r.error.message}` }));
    }
  }

  return (
    <article className="section causelist-page">
      <p className="eyebrow">Platform</p>
      <h1 className="section-title">Platform controls</h1>
      <p className="section-notes causelist-tagline">
        Maintenance mode, kill switches and feature flags. Every write here opens one transaction
        that records the audit row in the same commit as the change — a config change with no
        audit trail is worse than no change.
      </p>

      {loadError ? <p className="causelist-row-note">{loadError}</p> : null}
      {!data && !loadError ? <p className="section-notes">Loading…</p> : null}

      {data ? (
        <>
          <div className="card causelist-banner platform-banner">
            <p className="eyebrow">Maintenance mode</p>
            <p className="causelist-banner-title">
              {data.maintenance.enabled ? 'Maintenance mode is ON' : 'Lawmind is live and serving advocates'}
            </p>
            {data.maintenance.message ? <p className="section-notes">{data.maintenance.message}</p> : null}
            <div className="causelist-actions">
              <input
                className="dispute-input"
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="Message to show in-app (optional)"
                value={maintenanceMessage}
              />
              <button
                className="button-secondary"
                disabled={busy.maintenance}
                onClick={() => void toggleMaintenance(!data.maintenance.enabled)}
                type="button"
              >
                {data.maintenance.enabled ? 'Exit maintenance mode' : 'Enter maintenance mode'}
              </button>
            </div>
            {notes.maintenance ? <p className="causelist-row-note">{notes.maintenance}</p> : null}
          </div>

          <div className="causelist-layout">
            <div className="card causelist-table-card platform-killswitch-card">
              <p className="eyebrow platform-card-heading">Kill switches — six, fixed</p>
              <p className="section-notes platform-card-subheading">
                Immediate, no deploy. `reason` is required and logged with your user id in the same
                transaction as the change.
              </p>
              {KILL_SWITCH_KEYS.map((key) => {
                const entry = data.killSwitches.find((k) => k.key === key)!;
                return (
                  <div className="dispute-row" key={key}>
                    <div className="dispute-row-head">
                      <div className="failing-main">
                        <span className={entry.enabled ? 'causelist-status-ok' : 'causelist-status causelist-status-failed'}>
                          {entry.enabled ? 'LIVE' : 'OFF'}
                        </span>{' '}
                        <strong>{KILL_SWITCH_LABEL[key]}</strong>
                        <p className="record">
                          {key}
                          {key === 'ecourts_harvest'
                            ? ' — flipping this bit alone does not start harvesting; the authorisation grant must independently hold in services/api/src/court/authorisation.ts'
                            : ''}
                          {entry.reason ? ` · last reason: ${entry.reason}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="causelist-actions">
                      <input
                        className="dispute-input"
                        onChange={(e) => setReasons((r) => ({ ...r, [key]: e.target.value }))}
                        placeholder="Reason (required)"
                        value={reasons[key] ?? ''}
                      />
                      <button
                        className="button-secondary"
                        disabled={busy[key]}
                        onClick={() => void toggleKillSwitch(key, entry)}
                        type="button"
                      >
                        {entry.enabled ? 'Turn off' : 'Turn on'}
                      </button>
                    </div>
                    {notes[key] ? <p className="causelist-row-note">{notes[key]}</p> : null}
                  </div>
                );
              })}
            </div>

            <div className="causelist-side">
              <div className="card">
                <p className="eyebrow">Feature flags</p>
                <p className="section-notes">
                  Percentage rollout. No fixed set — this is every row `GET /admin/platform`
                  actually returns right now.
                </p>
                {data.flags.length === 0 ? (
                  <p className="section-notes">No flags set yet.</p>
                ) : (
                  <ul className="causelist-stale-list">
                    {data.flags.map((flag) => (
                      <li className="causelist-stale-row" key={flag.key}>
                        <span>
                          {flag.key} — {flag.rolloutPercent ?? 0}%
                        </span>
                        <button
                          className="button-secondary"
                          disabled={busy[flag.key]}
                          onClick={() => void toggleFlag(flag)}
                          type="button"
                        >
                          {flag.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="dispute-form platform-new-flag">
                  <input
                    className="dispute-input"
                    onChange={(e) => setNewFlagKey(e.target.value)}
                    placeholder="New or existing flag key"
                    value={newFlagKey}
                  />
                  <input
                    className="dispute-input"
                    onChange={(e) => setNewFlagRollout(e.target.value)}
                    placeholder="Rollout % (0-100)"
                    value={newFlagRollout}
                  />
                  <button className="button-secondary" disabled={busy.newFlag} onClick={() => void submitNewFlag()} type="button">
                    Set flag — enabled
                  </button>
                  {notes.newFlag ? <p className="causelist-row-note">{notes.newFlag}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}
