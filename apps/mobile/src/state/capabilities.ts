import { create } from 'zustand';

import { api } from '../api/client';
import type { ReleaseCapabilityName, ReleaseCapabilityState } from '../api/contract';

/**
 * WHAT THIS CLIENT IS ALLOWED TO SHOW — the v1 surface gate.
 *
 * Two authorities, and they are ANDed. Neither can override the other, and the
 * direction each is allowed to move is fixed:
 *
 *   1. `V1_SURFACE` below — the PRODUCT's decision, frozen in
 *      `docs/product/V1_CAPABILITY_REGISTRY_R12.json` and compiled into the
 *      binary. It can only ever CLOSE a surface.
 *   2. `GET /release/capabilities` — the SERVER's statement about itself
 *      (`RELEASE_CAPABILITIES_R8_3.4` at the time of writing; the version is
 *      read from the response, never asserted from here). It can only ever
 *      CLOSE a surface too.
 *
 * SINCE R14 THAT SECOND AUTHORITY IS PER PLATFORM. `api/client.ts` sends
 * `X-Lawmind-Platform` on every request, so the states arriving here are
 * ALREADY RESOLVED for this build's platform — there is nothing to walk and
 * nothing to fall back through. A platform override may only ever narrow a
 * capability (R14 A4.8), which is why consuming the resolved view cannot open
 * anything: it feeds the same `serverStates` map this rule has always ANDed
 * against the product decision, and the product decision still closes first.
 *
 * So a surface renders when the product shipped it AND the server still serves
 * it. A server that starts reporting `ENABLED` for drafting does not turn
 * drafting on in this build, because the shipping decision is not the server's
 * to make — the frozen registry says so itself: "Where the two disagree, the
 * runtime registry wins on fact and this one wins on shipping decision."
 *
 * FAIL CLOSED, IN ONE DIRECTION ONLY. Before the registry has been fetched — a
 * cold start, a court corridor with no signal, a server that is down — the
 * server state is unknown. An unknown state must not hide search, the reader,
 * saved authorities or matters: those are the v1 core, they work against a
 * cached session, and hiding them because a metadata request failed would break
 * the whole app on a bad connection. An unknown state DOES hide everything
 * else. `openWhenUnknown` is where that line is drawn, per surface, in the open.
 */

/** The product's five-state vocabulary — NEW3 R12. */
export type V1CapabilityState =
  | 'ENABLED_V1'
  | 'INTERNAL_EXPERIMENTAL'
  | 'DISABLED_NOT_READY'
  | 'DISABLED_EXTERNAL_BLOCK'
  | 'POST_V1';

/**
 * Every surface this client can render that a decision has been taken about. A
 * surface absent from this table is not gated, deliberately: a gate nobody
 * declared must not silently hide a screen.
 */
export type SurfaceName =
  /* the v1 core: search - reader - saved authorities - matters */
  | 'search'
  | 'partyNameSearch'
  | 'reader'
  | 'savedAuthorities'
  | 'matters'
  /* everything this round explicitly holds back */
  | 'drafting'
  | 'briefing'
  | 'monitoring'
  | 'semanticSearch'
  | 'counterArguments'
  | 'goodLawClaim'
  | 'statuteCorrespondence'
  | 'matterSharing'
  | 'hindi'
  | 'savedSearchFeed';

type Surface = {
  /** The product decision. Frozen; only the founder or NEW3 moves one of these. */
  v1: V1CapabilityState;
  /**
   * The runtime capability this surface rides on, when there is one. `null`
   * means the server registry has nothing to say about it and only the product
   * decision applies.
   */
  runtime: ReleaseCapabilityName | null;
  /**
   * May this surface render before the server registry has been read? True only
   * for the v1 core, which must work on a cold start and a dead connection.
   */
  openWhenUnknown: boolean;
  /**
   * Why it is held, in one line, for the internal capability screen. Never
   * shown to an advocate as an apology — a held surface is simply absent.
   */
  note: string;
};

export const V1_SURFACE: Readonly<Record<SurfaceName, Surface>> = {
  search: {
    v1: 'ENABLED_V1',
    runtime: 'search.structured_filters',
    openWhenUnknown: true,
    note: 'Exact identity, structured filters and the lexical arm. The v1 spine.',
  },
  /**
   * THE ONE SURFACE THE SERVER CAN NARROW PER PLATFORM — R14 A4.9.
   *
   * A dedicated runtime row, so the kill switch is a served config change rather
   * than an App Store release. Two things about the way it is wired:
   *
   * `openWhenUnknown` is TRUE, with the rest of the v1 core. Before the registry
   * has been read — a cold start, a court corridor with no signal — hiding the
   * party path would be hiding part of search itself, and nothing is lost by
   * waiting: the SERVER enforces the switch whatever this build believes, and
   * says so on the response with `degraded: ['party_name_disabled']`, which
   * `screens/search/searchTruth.ts` renders truthfully. This flag decides what we
   * OFFER, never what we claim happened.
   *
   * And it narrows nothing else. Exact identity — case number, CNR, citation,
   * full cause title — is `search.exact_identity`, a separate row the switch does
   * not touch, which is exactly why the degrade has somewhere honest to point.
   */
  partyNameSearch: {
    v1: 'ENABLED_V1',
    runtime: 'search.party_name',
    openWhenUnknown: true,
    note: 'A bare party name reaches the case-title probe and the CASE is pinned above the judgments citing it.',
  },
  reader: {
    v1: 'ENABLED_V1',
    runtime: 'judgment.reader',
    openWhenUnknown: true,
    note: 'GET /judgments/:id, with its provenance and its body-text refusal.',
  },
  savedAuthorities: {
    v1: 'ENABLED_V1',
    runtime: 'matter.saved_authorities',
    openWhenUnknown: true,
    note: 'The three citation fields are joined at read time on every read.',
  },
  matters: {
    v1: 'ENABLED_V1',
    runtime: 'matter.workspace',
    openWhenUnknown: true,
    note: 'Manual hearing dates are the PRIMARY path, never a fallback.',
  },

  drafting: {
    v1: 'POST_V1',
    runtime: 'generation.evidence_from_passages',
    openWhenUnknown: false,
    note: 'POST /documents 404s and generation.evidence_from_passages is DISABLED.',
  },
  briefing: {
    v1: 'DISABLED_NOT_READY',
    runtime: 'matter.briefing',
    openWhenUnknown: false,
    note: 'Mounted server-side, not run through acceptance. RCC_V1_API_CONTRACT_R12 s1.8.',
  },
  monitoring: {
    v1: 'DISABLED_NOT_READY',
    runtime: 'court.ecourts_live',
    openWhenUnknown: false,
    note: 'Zero observations exist. No polling frequency and no SLA may appear anywhere.',
  },
  semanticSearch: {
    v1: 'INTERNAL_EXPERIMENTAL',
    runtime: 'search.semantic.broad',
    openWhenUnknown: false,
    note: 'Runs, is measured, is never reachable by a user in v1.',
  },
  counterArguments: {
    v1: 'DISABLED_NOT_READY',
    runtime: 'search.semantic.counterarguments',
    openWhenUnknown: false,
    note: 'Generation-adjacent. safeForGeneration was false on every response observed.',
  },
  goodLawClaim: {
    v1: 'DISABLED_NOT_READY',
    runtime: 'treatment.good_law_claim',
    openWhenUnknown: false,
    note: 'We show what later courts DID. We never claim an authority is good law.',
  },
  statuteCorrespondence: {
    v1: 'DISABLED_NOT_READY',
    runtime: 'statute.old_new_correspondence',
    openWhenUnknown: false,
    note: 'No old-code to new-code section mapping anywhere. A wrong correspondence is a wrong section number.',
  },
  matterSharing: {
    v1: 'POST_V1',
    runtime: null,
    openWhenUnknown: false,
    note: 'Built server-side, not a v1 screen. No firm or team administration UI in v1.',
  },
  hindi: {
    v1: 'DISABLED_NOT_READY',
    runtime: 'language.hindi',
    openWhenUnknown: false,
    note: 'An accepted input value, not a supported capability.',
  },
  savedSearchFeed: {
    v1: 'DISABLED_NOT_READY',
    runtime: null,
    openWhenUnknown: false,
    note: 'OD-12 is OPEN. Shipping the feed would resolve an open decision by shipping it.',
  },
};

/** The server states that mean "a user may reach this". */
const SERVER_OPEN: ReadonlySet<ReleaseCapabilityState> = new Set<ReleaseCapabilityState>([
  'ENABLED',
  'LIMITED',
]);

type CapabilitiesState = {
  /** What the server said about itself. Empty until the registry is read. */
  serverStates: Partial<Record<ReleaseCapabilityName, ReleaseCapabilityState>>;
  registryVersion: string | null;
  asOf: string | null;
  loaded: boolean;
  loadError: string | null;
  fetch: () => Promise<void>;
};

export const useCapabilities = create<CapabilitiesState>((set) => ({
  serverStates: {},
  registryVersion: null,
  asOf: null,
  loaded: false,
  loadError: null,

  fetch: async () => {
    const r = await api.releaseCapabilities();
    if (!r.ok) {
      // Deliberately does NOT clear a registry already in hand. A failed refresh
      // is not evidence that a capability changed.
      set({ loaded: true, loadError: r.error.message });
      return;
    }
    const serverStates: Partial<Record<ReleaseCapabilityName, ReleaseCapabilityState>> = {};
    for (const [name, cap] of Object.entries(r.data.capabilities)) {
      serverStates[name as ReleaseCapabilityName] = cap.state;
    }
    set({
      serverStates,
      registryVersion: r.data.registryVersion,
      asOf: r.data.asOf,
      loaded: true,
      loadError: null,
    });
  },
}));

/**
 * THE ONE PREDICATE. Pure, so it is testable without a store and without a
 * network, and so the rule lives in one place rather than in fourteen screens.
 */
export function surfaceEnabled(
  name: SurfaceName,
  serverStates: Partial<Record<ReleaseCapabilityName, ReleaseCapabilityState>>,
): boolean {
  const surface = V1_SURFACE[name];
  // The product decision closes first, and the server cannot reopen it.
  if (surface.v1 !== 'ENABLED_V1') return false;
  if (surface.runtime === null) return true;
  const server = serverStates[surface.runtime];
  if (server === undefined) return surface.openWhenUnknown;
  return SERVER_OPEN.has(server);
}

/** Hook form, for a screen that needs to know whether to render at all. */
export function useSurfaceEnabled(name: SurfaceName): boolean {
  const serverStates = useCapabilities((s) => s.serverStates);
  return surfaceEnabled(name, serverStates);
}
