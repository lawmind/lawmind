import { create } from 'zustand';

import { api } from '../api/client';
import type { Alert } from '../api/contract';

/**
 * CITATOR ALERTS — PD-5, PD-6. `GET /alerts`, `POST /alerts/:id/read`.
 *
 * BATCHED, NOT POLLED. PD-6: alerts arrive with the evening briefing's
 * "since yesterday" block — there is no notifications tab and this store is
 * not a feed to poll. `TodayScreen.tsx` fetches once on mount; nothing here
 * schedules a re-fetch.
 *
 * `severity: 'immediate'` alerts (the one push exception, `set_aside` on a
 * filed/copied citation) need no additional handling here — the OS push is
 * the surface, and this store's job is only the batched "since yesterday"
 * block. An immediate alert still appears in this list (it is real data),
 * it is simply not treated as more urgent than any other row here.
 */

type AlertsState = {
  alerts: Alert[];
  unreadCount: number;
  loaded: boolean;
  loadError: string | null;

  fetch: () => Promise<void>;
  markRead: (alertId: string) => void;
};

export const useAlerts = create<AlertsState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  loaded: false,
  loadError: null,

  fetch: async () => {
    const r = await api.alerts();
    if (r.ok) {
      set({ alerts: r.data.alerts, unreadCount: r.data.unreadCount, loaded: true, loadError: null });
    } else {
      set({ loaded: true, loadError: r.error.message });
    }
  },

  /**
   * Optimistic — the tap that opens a judgment/matter should not wait on a
   * round trip to stop showing the alert as unread. `POST` is fired and not
   * awaited by the caller; a failure leaves the alert unread server-side,
   * which self-corrects on the next fetch rather than needing a retry queue
   * for something this low-stakes.
   */
  markRead: (alertId) => {
    const wasUnread = get().alerts.find((a) => a.id === alertId)?.readAt === null;
    set({
      alerts: get().alerts.map((a) =>
        a.id === alertId ? { ...a, readAt: new Date().toISOString() } : a
      ),
      unreadCount: wasUnread ? Math.max(0, get().unreadCount - 1) : get().unreadCount,
    });
    void api.markAlertRead(alertId);
  },
}));
