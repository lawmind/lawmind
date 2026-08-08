import { apiRequest } from './api';

/**
 * `62 · Platform controls` — shapes verified against
 * `services/api/src/admin/platform.ts`, 8 Aug 2026 (BUILT, deployed).
 *
 * SIX KILL SWITCHES, NOT FIVE. `ecourts_harvest` joined 7 Aug 2026 and the
 * database CHECK constraint already enforces six — the source file's own
 * comment flags that `docs/API_CONTRACTS.md`'s prose still says five. Build
 * against the constraint, not the stale paragraph.
 *
 * `reason` is mandatory on a kill switch, enforced at both the API and the
 * database layer — a switch with no reason is unreconstructable by whoever
 * decides at 4am whether to throw it back.
 */

export const KILL_SWITCH_KEYS = [
  'search',
  'drafting',
  'briefings',
  'ocr_intake',
  'signups',
  'ecourts_harvest',
] as const;
export type KillSwitchKey = (typeof KILL_SWITCH_KEYS)[number];

export type ConfigEntry = {
  key: string;
  enabled: boolean;
  rolloutPercent: number | null;
  message: string | null;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type PlatformResponse = {
  maintenance: { enabled: boolean; message: string | null } | ConfigEntry;
  killSwitches: ConfigEntry[];
  flags: ConfigEntry[];
};

export function fetchPlatform() {
  return apiRequest<PlatformResponse>('/admin/platform');
}

export function setMaintenance(enabled: boolean, message?: string) {
  return apiRequest<{ maintenance: ConfigEntry }>('/admin/platform/maintenance', {
    method: 'POST',
    body: { enabled, message },
  });
}

export function setKillSwitch(key: KillSwitchKey, enabled: boolean, reason: string) {
  return apiRequest<{ killSwitch: ConfigEntry }>(`/admin/platform/kill-switches/${key}`, {
    method: 'POST',
    body: { enabled, reason },
  });
}

export function setFlag(key: string, enabled: boolean, rolloutPercent?: number) {
  return apiRequest<{ flag: ConfigEntry }>(`/admin/platform/flags/${key}`, {
    method: 'POST',
    body: { enabled, rolloutPercent },
  });
}
