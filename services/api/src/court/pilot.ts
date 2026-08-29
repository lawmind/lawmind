/**
 * The eCourts observation pilot — defined, disabled, and not registered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A DEFINITION AND NOT A JOB
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Master Roadmap v5 Gate A treats monitoring as conditional: *if* eCourts inputs
 * are available the gate wants real fetches inside the transcribed limits and at
 * least one pilot source producing observations; if they are not, the gate
 * passes with monitoring `DISABLED_EXTERNAL_BLOCK`. Today the inputs are not
 * available — there is no actor row, no attribution in the runtime environment,
 * the kill switch is off, and the parser has never seen a response.
 *
 * So the pilot exists as a value that can be read, tested and reviewed, and it
 * is **not** registered as a runnable task. A disabled job in a scheduler is one
 * config edit away from running; a definition that no scheduler knows about
 * cannot start by accident, and turning it on is a deliberate act with four
 * preconditions that are checked in code rather than remembered.
 *
 * ONE source key, deliberately. The planning unit is approximately
 * `(establishment or bench, cause-list date, list type)` — §3.4 corrected v4's
 * assumption that one request covers a whole court's day — and what a single
 * request actually returns is UNMEASURED. The first pilot's job is to measure
 * that against the licensed interface, not to harvest.
 *
 * No case-status path is built. §3.4's planner chooses between strategies once
 * their real costs are known, and implementing a second strategy before the
 * first has ever returned a byte would be building on an assumed cost model.
 */
import { AUTHORISATION } from './authorisation.ts';
import { ECOURTS_CAUSE_LIST_ENDPOINT, PARSER_STATE } from './ecourts.ts';
import { type Db, killSwitchEnabled, type ObservationStrategy } from './guard.ts';

export type PilotSourceKey = {
  /** The court key as the grant and our ledger name it. */
  court: string;
  /**
   * The establishment or bench the request is scoped to. The district-court
   * interface requires court complex + court name; a High Court service
   * requires court/bench. Null until the licensed interface is read: an invented
   * establishment code is a request that cannot be defended.
   */
  establishment: string | null;
  /** Civil / criminal, where the interface demands the distinction. */
  listType: string | null;
};

export type EcourtsPilot = {
  id: string;
  /** Ships false. Flipping it is not sufficient — see `pilotBlockers`. */
  enabled: false;
  strategy: ObservationStrategy;
  endpoint: string;
  sourceKey: PilotSourceKey;
  /** How many requests one pilot cycle may spend, out of 1,000/day. */
  maxRequestsPerCycle: number;
  /** Which dates a cycle asks for, relative to the run date. */
  listDateOffsetsDays: readonly number[];
  purpose: string;
};

export const ECOURTS_PILOT: EcourtsPilot = {
  id: 'ecourts-cause-list-pilot',
  enabled: false,
  strategy: 'CAUSE_LIST_BATCH',
  endpoint: ECOURTS_CAUSE_LIST_ENDPOINT,
  sourceKey: {
    // Left unresolved on purpose. The founder's activation step supplies the
    // real establishment and list type from the licensed interface; guessing
    // one here would put an unverifiable request on a ledger the registrar may
    // read.
    court: 'PENDING_ACTIVATION',
    establishment: null,
    listType: null,
  },
  // One request. The pilot's question is "what does one request actually
  // return", and a batch cannot answer it more accurately than a single fetch.
  maxRequestsPerCycle: 1,
  listDateOffsetsDays: [0],
  purpose:
    'Measure what one licensed cause-list request returns, so the adaptive observation ' +
    'planner in Master Roadmap v5 §3.4 can be costed against the grant budget rather ' +
    'than against an assumption.',
};

export type PilotBlocker =
  | 'pilot_disabled'
  | 'parser_needs_authorized_fixture'
  | 'source_key_unresolved'
  | 'terms_not_on_file'
  | 'attribution_not_on_file'
  | 'kill_switch_off';

/**
 * Everything standing between this definition and a first request.
 *
 * Returned as a list rather than a boolean because the ordering matters to the
 * person doing the activation: they should be told about the missing attribution
 * before they flip a switch, not after.
 */
export async function pilotBlockers(sql: Db): Promise<PilotBlocker[]> {
  const blockers: PilotBlocker[] = [];
  if (!ECOURTS_PILOT.enabled) blockers.push('pilot_disabled');
  if (PARSER_STATE === 'NEEDS_AUTHORIZED_FIXTURE') {
    blockers.push('parser_needs_authorized_fixture');
  }
  if (
    ECOURTS_PILOT.sourceKey.court === 'PENDING_ACTIVATION' ||
    ECOURTS_PILOT.sourceKey.establishment === null
  ) {
    blockers.push('source_key_unresolved');
  }
  if (!AUTHORISATION) blockers.push('terms_not_on_file');
  if (!process.env['ECOURTS_GRANT_ATTRIBUTION']) blockers.push('attribution_not_on_file');
  if (!(await killSwitchEnabled(sql))) blockers.push('kill_switch_off');
  return blockers;
}

export class PilotRefused extends Error {
  override name = 'PilotRefused';
  readonly blockers: PilotBlocker[];
  constructor(blockers: PilotBlocker[]) {
    super(`the eCourts pilot is not runnable: ${blockers.join(', ')}`);
    this.blockers = blockers;
  }
}

/**
 * Refuse unless every precondition holds. There is no override argument, and
 * there is deliberately no way to pass one.
 */
export async function assertPilotRunnable(sql: Db): Promise<void> {
  const blockers = await pilotBlockers(sql);
  if (blockers.length > 0) throw new PilotRefused(blockers);
}
