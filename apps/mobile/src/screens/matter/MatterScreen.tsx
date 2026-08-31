import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CitationMark, movedTone } from '../../components/CitationMark';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { Switch } from '../../components/Switch';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type {
  Matter,
  MatterAccess,
  MatterAuthority,
  MatterBundleBriefing,
  MatterEvent,
  PremiumPreview,
} from '../../api/contract';
import { fire } from '../../analytics/track';
import { citationDisplay, NO_CITATION_MARK } from '../../citation/citationDisplay';
import { citationRender } from '../../citation/renderState';
import { treatmentRelationshipCopy } from '../../citation/treatmentRelationship';
import { describeCacheAge, readCache, writeCache } from '../../state/offlineCache';
import { AddEventSheet } from './AddEventSheet';
import { usePractice } from '../../state/practice';
import { useSurfaceEnabled } from '../../state/capabilities';
import { useRecentItems } from '../../state/recentItems';
import {
  describeHearingDate,
  formatGutter,
  formatLong,
  parseCivilDate,
  todayCivil,
} from '../../theme/hearingDate';
import { color, radius, space } from '../../theme/tokens';
import { PremiumPreviewCard } from './PremiumPreviewCard';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MATTER DETAIL — the retention moat. Inventory rows 25–27.
 *
 * Six months of an advocate's accumulated work is what stops them leaving, so
 * the ordering here follows what they came for: the next date first, then the
 * timeline, then everything else.
 *
 * TWO RULES THIS SCREEN CARRIES, both product decisions rather than layout:
 *
 * PD-4 — NOTES ARE PRIVATE BY DEFAULT, SHAREABLE PER NOTE. The default lives in
 * the database column, not here; this screen only ever sends an EXPLICIT
 * visibility, and never assumes one. A note about fees or a client's
 * circumstances must not travel with a file by accident.
 *
 * PD-3 — SHARING IS PER MATTER, BY INVITATION, and it is a list of names rather
 * than an org chart. There is no chamber-wide switch and there must not be one:
 * two advocates in one chamber can be on opposing sides of related matters.
 *
 * `order_text` is the COURT'S record and is always visible to a share. `notes`
 * obey `noteVisibility`. The two are drawn differently for that reason — one is
 * what happened, the other is what the advocate thought about it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * THE BUNDLE AS `GET /matters/:id` ACTUALLY SENDS IT, corrected 11 Aug 2026.
 *
 * `briefings` was typed `Briefing[]` — the detail route's shape — and the rows
 * below read `b.id` and `b.subject`. The bundle sends `briefingId` and no
 * subject at all, so both were `undefined`: every briefing row in a matter
 * rendered a blank title, and its tap target carried an undefined id.
 *
 * `documents` said `id`; the route sends `documentId` and a `language`
 * alongside it. Nothing renders that array yet, which is the only reason it
 * cost nothing — the type was wrong in exactly the same way.
 */
type MatterBundle = {
  matter: Matter;
  /**
   * OWNER OR SHAREE, STATED BY THE SERVER — see `Matter.access`. Every write in
   * `matters/route.ts` and `matters/authorities.ts` checks ownership directly:
   * "a sharee can see the file but cannot add to it". Undeclared until
   * 11 Aug 2026, so this screen offered a sharee four buttons that 404.
   */
  access: MatterAccess;
  events: MatterEvent[];
  documents: {
    documentId: string;
    documentType: string;
    language: 'en' | 'hi';
    createdAt: string;
  }[];
  briefings: MatterBundleBriefing[];
};

const matterCacheKey = (id: string) => `matter.${id}`;

export function MatterScreen({
  matterId,
  onBack,
  onOpenBriefing,
  onOpenCounterArguments,
  onOpenJudgment,
  onRecordAdjournment,
  onOpenPremiumPlans,
  onSendClientUpdate,
  onShare,
}: {
  matterId: string;
  onBack: () => void;
  onOpenBriefing: (briefingId: string) => void;
  /**
   * `POST /arguments/counter` against a position the advocate states, carrying
   * this matter's id — an existing optional parameter on that endpoint.
   *
   * Opened from HERE because the matter is where an advocate already holds the
   * position in their head. The screen still asks them to type it: deriving a
   * proposition from a case title would be writing their argument for them and
   * then answering it.
   */
  onOpenCounterArguments: () => void;
  /** Opens a saved authority. The matter file is a route INTO the law, not a dead list. */
  onOpenJudgment: (judgmentId: string) => void;
  onRecordAdjournment: () => void;
  /** Existing plan surface; no purchase is implied or attempted here. */
  onOpenPremiumPlans?: () => void;
  onSendClientUpdate: () => void;
  /** PD-3 — "Who can see this matter". Owner-side only, see MatterSharingScreen's own note. */
  onShare: () => void;
}) {
  const [bundle, setBundle] = useState<MatterBundle | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  /**
   * SURFACES THIS BUILD HOLDS BACK — R12 §6, §7, §8. Read from
   * `state/capabilities.ts`, which ANDs the product's frozen v1 decision with
   * the server's own registry. A held surface is simply ABSENT: no greyed
   * button, no "coming soon", no teaser. A disabled control that an advocate
   * can see is a promise, and a promise about court data we cannot keep is
   * exactly what §6 forbids.
   */
  const briefingEnabled = useSurfaceEnabled('briefing');
  const counterArgumentsEnabled = useSurfaceEnabled('counterArguments');
  const sharingEnabled = useSurfaceEnabled('matterSharing');
  const [addEventOpen, setAddEventOpen] = useState(false);
  /**
   * THE AUTHORITIES SAVED TO THIS MATTER — `GET /matters/:id/authorities`.
   *
   * Added 11 Aug 2026, the day after the endpoint landed. Until then
   * add-to-matter was WRITE-ONLY: an advocate could save an authority and had
   * no surface anywhere that showed it back, so the matter workspace could not
   * answer "what am I relying on in this case", which is the question it exists
   * to answer.
   *
   * A separate request rather than part of the bundle, because the bundle comes
   * from `GET /matters/:id` and that route does not carry authorities. Fetching
   * it here keeps the client honest about which route owns what.
   */
  const [authorities, setAuthorities] = useState<MatterAuthority[] | null>(null);
  /**
   * Present only when the server's OFF-by-default premium_preview flag is on.
   * NOT_ENABLED, shared access and network failures all leave the core matter
   * untouched; the preview is an enhancement, never a loading dependency.
   */
  const [premiumPreview, setPremiumPreview] = useState<PremiumPreview | null>(null);
  /**
   * Set while a removal is in flight, so the row cannot be tapped twice. The
   * second tap would 404 — the server only removes a row whose `removed_at` is
   * still null — and the advocate would read "no live authority with that id"
   * about a judgment they had just successfully taken out.
   */
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [addEventError, setAddEventError] = useState<string | null>(null);
  const storeMatters = usePractice((s) => s.matters);
  const recordRecent = useRecentItems((s) => s.record);

  useEffect(() => {
    let alive = true;
    setBundle(null);
    setCachedAt(null);
    setMissing(false);

    setAuthorities(null);
    void api.matterAuthorities(matterId).then((r) => {
      if (alive && r.ok) setAuthorities(r.data.authorities);
    });

    void readCache<MatterBundle>(matterCacheKey(matterId)).then((entry) => {
      if (!alive || !entry) return;
      setBundle((current) => {
        if (current) return current;
        setCachedAt(entry.cachedAt);
        return entry.value;
      });
    });

    void api.matter(matterId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setBundle(r.data);
        setCachedAt(null);
        void writeCache(matterCacheKey(matterId), r.data);
        recordRecent({ kind: 'matter', id: matterId, title: r.data.matter.caseTitle });
        return;
      }
      setBundle((current) => {
        if (!current) setMissing(true);
        return current;
      });
    });

    return () => {
      alive = false;
    };
  }, [matterId]);

  const premiumMatterId =
    bundle && onOpenPremiumPlans && (bundle.access ?? 'owner') === 'owner'
      ? bundle.matter.matterId
      : null;

  useEffect(() => {
    let alive = true;
    setPremiumPreview(null);
    if (!premiumMatterId)
      return () => {
        alive = false;
      };

    void api.premiumPreview(premiumMatterId).then((r) => {
      if (!alive || !r.ok) return;
      setPremiumPreview(r.data);
      fire({
        name: 'premium_preview_seen',
        context: 'hearing_prep_value',
        costClass: r.data.costClass,
      });
    });

    return () => {
      alive = false;
    };
  }, [premiumMatterId]);

  /**
   * TAKE ONE AUTHORITY BACK OUT OF THE MATTER.
   *
   * The row is marked removed IN PLACE from the server's own `removedAt`
   * rather than spliced out of the array, so the client holds the same shape
   * the endpoint returns — removal is a timestamp, never a delete, and a
   * client that quietly dropped the row would be modelling it as one.
   *
   * NOT OPTIMISTIC. An authority vanishing from a case file before the server
   * agreed, and reappearing on the next fetch, is worse than a moment's wait:
   * this list is the advocate's record of what they are relying on.
   */
  const removeAuthority = async (authorityId: string) => {
    if (removing) return;
    setRemoving(authorityId);
    setRemoveError(null);

    const r = await api.removeAuthorityFromMatter(matterId, authorityId);

    if (r.ok) {
      setAuthorities((current) =>
        (current ?? []).map((a) =>
          a.authorityId === authorityId ? { ...a, removedAt: r.data.removedAt } : a,
        ),
      );
    } else {
      setRemoveError(r.error.message);
    }
    setRemoving(null);
  };

  const today = useMemo(() => todayCivil(), []);

  /**
   * THE STORE'S DATE WINS OVER THE FETCHED ONE.
   *
   * An adjournment recorded thirty seconds ago in a courtroom is in the store
   * and has not necessarily reached the server. Rendering the fetched date over
   * it would show the advocate the old date immediately after they corrected it,
   * which is the exact moment they stop trusting the screen.
   */
  const liveDate =
    storeMatters.find((m) => m.matterId === matterId)?.nextHearingDate ??
    bundle?.matter.nextHearingDate ??
    null;

  if (missing) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="uiStrong">We could not open this matter</Text>
          <Text variant="ui" style={styles.muted}>
            Nothing has been lost. Something went wrong on our side fetching it.
          </Text>
          <Button label="Back" onPress={onBack} variant="secondary" />
        </View>
      </Screen>
    );
  }

  if (!bundle) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="ui" style={styles.muted}>
            Opening the matter…
          </Text>
        </View>
      </Screen>
    );
  }

  const { matter, events, briefings } = bundle;
  /**
   * WHAT MAY BE OFFERED, NOT WHAT MAY BE READ.
   *
   * `access` comes from the server and is never inferred here. A sharee reads
   * the whole file — that is what PD-3 grants — and can write none of it:
   * `matters/authorities.ts` states the split plainly, "a sharee can see the
   * file but cannot add to it", and every write checks `user_id` directly.
   *
   * Offering the buttons anyway is not a harmless extra: a sharee taps "Add
   * event" in a courtroom, gets `no matter with that id` because the server
   * answers a permission failure as a 404, and now believes the matter is
   * gone. Hiding them is the honest reading of a boundary the server already
   * draws.
   *
   * `?? 'owner'` for the cached-bundle case: a bundle written to disk before
   * this field was declared has no `access`, and the reader is the person who
   * cached it. A wrong guess here removes buttons from an owner rather than
   * offering them to a sharee, and if the guess were the other way a stale
   * cache would reintroduce the exact defect being fixed.
   */
  const isOwner = (bundle.access ?? 'owner') === 'owner';
  const nextDate = parseCivilDate(liveDate ?? '');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          accessibilityLabel="Back to matters"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.back}
        >
          <Text variant="ui" style={styles.link}>
            ‹ Matters
          </Text>
        </Pressable>

        <Text variant="eyebrow">{matter.court}</Text>
        <Text variant="uiStrong" scale="title">
          {matter.caseTitle}
        </Text>
        <Text variant="ui" style={styles.muted}>
          {matter.parties.description} · for the {matter.ourSide}
        </Text>

        {/* THE NEXT DATE IS PINNED — it is what the screen was opened for. */}
        <Card style={styles.nextCard}>
          <Text variant="eyebrow">Next hearing</Text>
          {nextDate ? (
            <>
              <Text variant="uiStrong" scale="title">
                {describeHearingDate(liveDate!, today)}
              </Text>
              <Text variant="record">{formatLong(nextDate)}</Text>
            </>
          ) : (
            <>
              <Text variant="uiStrong">No next date recorded</Text>
              {/*
                PD-12 — MANUAL ENTRY IS FIRST-CLASS, NEVER A FALLBACK. Next dates
                are given orally in open court and written on the file, so an
                advocate typing one is doing the ordinary thing. This copy must
                not read as a failure of ours or a lapse of theirs.
              */}
              <Text variant="ui" style={styles.muted}>
                Record it when the court gives it.
              </Text>
            </>
          )}
          {isOwner ? <Button label="Record the next date" onPress={onRecordAdjournment} /> : null}
        </Card>

        {premiumPreview && onOpenPremiumPlans ? (
          <PremiumPreviewCard
            preview={premiumPreview}
            onOpenPlans={() => {
              fire({ name: 'premium_preview_opened', context: 'hearing_prep_value' });
              fire({ name: 'premium_intent_signalled', context: 'hearing_prep_value' });
              onOpenPremiumPlans();
            }}
          />
        ) : null}

        <View style={styles.actions}>
          {isOwner ? <Button label="Add event" onPress={() => setAddEventOpen(true)} /> : null}
          {/*
            NOT OWNER-GATED. `POST /arguments/counter` retrieves against the
            corpus and takes `matterId` as an optional hint; it performs no
            write and checks no ownership. A sharee researching the other
            side's likely authorities is doing the thing the share was for.
          */}
          {counterArgumentsEnabled ? (
            <Button
              label="What will be said against you"
              variant="secondary"
              onPress={onOpenCounterArguments}
            />
          ) : null}
          {isOwner ? (
            <>
              <Button
                label="Send update to client"
                variant="secondary"
                onPress={onSendClientUpdate}
              />
              {sharingEnabled ? (
                <Button label="Who can see this matter" variant="secondary" onPress={onShare} />
              ) : null}
            </>
          ) : (
            /*
              SAID, NOT SILENTLY ABSENT. A sharee who finds fewer buttons than
              they expect should know why — otherwise the file looks broken
              rather than shared, and PD-3's whole point is that a share is a
              deliberate, legible grant rather than a vague one.
            */
            <Text variant="ui" style={styles.muted}>
              This matter was shared with you. You can read the file and its shared notes; only the
              advocate who owns it can add to it.
            </Text>
          )}
        </View>

        {briefingEnabled && briefings.length > 0 ? (
          <View style={styles.section}>
            <SectionRule label="Briefings" />
            {briefings.map((b) => (
              <Pressable
                accessibilityLabel={`Open briefing for ${describeHearingDate(b.hearingDate, today)}`}
                accessibilityRole="button"
                key={b.briefingId}
                onPress={() => onOpenBriefing(b.briefingId)}
                style={styles.row}
              >
                <Text variant="record" style={styles.gutter}>
                  {formatGutter(parseCivilDate(b.hearingDate) ?? today)}
                </Text>
                <View style={styles.rowBody}>
                  {/*
                    THE HEARING, NOT A SUBJECT. This read `b.subject`, which no
                    route sends — the row's title was blank. The briefings of one
                    matter are all the same case, so a case name would repeat down
                    the list anyway; what distinguishes one row from another is
                    the hearing it was prepared for.
                  */}
                  <Text variant="uiStrong">{describeHearingDate(b.hearingDate, today)}</Text>
                  {/*
                    AN UNCONFIRMED LISTING IS SAID HERE TOO, and from three
                    states, not a boolean. `never_checked` — both timestamps
                    null — is the ordinary case for a date the advocate typed
                    and draws nothing.
                  */}
                  {b.datesConfirmedAt === null && b.datesNotConfirmedAt !== null ? (
                    <Text variant="ui" style={styles.muted}>
                      This listing is not confirmed against the cause list.
                    </Text>
                  ) : (
                    <Text variant="ui" style={styles.muted}>
                      {b.openedAt ? 'Opened' : 'Not opened yet'}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/*
          THE AUTHORITIES SAVED TO THIS MATTER.
          Placed above the timeline because "what am I relying on" is the
          question an advocate opens a matter to answer, and below the actions
          because it is a record rather than something to do.

          REMOVED ROWS ARE STILL RETURNED by the endpoint — removal is a
          timestamp, never a delete, exactly as `matter_shares` works. They are
          not drawn: a matter file that shows what was taken out alongside what
          is in would be a worse answer to the same question. The row survives
          for the audit, which is where it belongs.
        */}
        {authorities && authorities.some((a) => a.removedAt === null) ? (
          <View style={styles.section}>
            <SectionRule label="Authorities" />

            {authorities
              .filter((a) => a.removedAt === null)
              .map((a) => {
                const citation = citationDisplay(a);
                /**
                 * GOOD-LAW STATUS, LIVE — bus 0048/0049 landed `dd9871b`.
                 * Same helper every other surface uses, never a second
                 * opinion. `verificationState`/`verifiedBySource` are
                 * `'verified'`/`'corpus'` by construction on this row, so
                 * `existence` never draws here — declared anyway, the same
                 * reason `BriefingAuthorityRow` does: the day this can carry
                 * an authority resolved by another tier, nothing here has to
                 * change for the mark to stay honest.
                 */
                const { moved } = citationRender({
                  verificationState: a.verificationState,
                  verifiedBySource: a.verifiedBySource,
                  // An evidence defect is our parser's mistake, not moved law.
                  // R14 requires no banner and no prohibition for that value.
                  overruledStatus:
                    a.precedentialEffect === 'evidence_defect' ? 'none' : a.overruledStatus,
                  overruledNote: a.overruledNote,
                  overruledParas: a.overruledParas,
                  canAddToMatter: a.canAddToMatter,
                });
                return (
                  <Pressable
                    accessibilityLabel={`Open ${a.caseTitle}`}
                    accessibilityRole="button"
                    key={a.authorityId}
                    onPress={() => onOpenJudgment(a.judgmentId)}
                    style={[styles.row, moved.kind === 'moved' && styles.rowMoved]}
                  >
                    {/* All three moved states carry a chip, `doubted` included. */}
                    {moved.kind === 'moved' ? (
                      <CitationMark label={moved.chipLabel} tone={movedTone(moved.band)} />
                    ) : null}
                    <View style={styles.rowBody}>
                      <Text
                        variant="legal"
                        scale="holding"
                        style={
                          moved.kind === 'moved' && moved.strikeTitle ? styles.struck : undefined
                        }
                      >
                        {a.caseTitle}
                      </Text>
                      {/*
                        Through the one helper, like every other citation slot.
                        A judgment saved from a High Court row carries none, and
                        an empty line here would read as a rendering fault in
                        the advocate's own case file.
                      */}
                      <Text opticalNudge variant="record" style={styles.muted}>
                        {citation.text}
                      </Text>
                      {!citation.citable ? (
                        <Text variant="ui" style={styles.uncitable}>
                          {NO_CITATION_MARK}
                        </Text>
                      ) : null}

                      {/* What still stands is stated first — the half still being relied on. */}
                      {moved.kind === 'moved' && moved.whatStillStands ? (
                        <Text variant="ui" style={styles.stillStands}>
                          {moved.whatStillStands}
                        </Text>
                      ) : null}

                      {moved.kind === 'moved' && moved.band === 'none' ? (
                        <Text variant="ui" style={styles.doubtedLine}>
                          {moved.headline}
                        </Text>
                      ) : null}

                      {/* Named, not merely flagged — the server joins who displaced it. */}
                      {a.overruledByTitle &&
                      (moved.kind === 'moved' || a.precedentialEffect === 'evidence_defect') ? (
                        <Text variant="ui" style={styles.overruledBy}>
                          {treatmentRelationshipCopy(
                            a.overruledByTitle,
                            a.precedentialEffect,
                          )}
                        </Text>
                      ) : null}

                      {moved.kind === 'moved' &&
                      a.citableForUntouchedPropositions === true &&
                      (a.precedentialEffect === 'overruled' ||
                        a.precedentialEffect === 'overruled_in_part') ? (
                        <Text variant="ui" style={styles.stillStands}>
                          Still citable for propositions the later judgment did not reach.
                        </Text>
                      ) : null}

                      {/*
                        TAKING ONE OUT — `DELETE /matters/:id/authorities/:id`,
                        live since 10 Aug and unreachable until now.

                        The list landed first and could only grow: an advocate
                        who saved the wrong judgment, or one they later decided
                        against, had no way to take it back out of their own
                        case file. That is the same write-only shape the list
                        itself was built to fix, one level down.

                        NO CONFIRMATION STEP, and that is deliberate — removal
                        sets a timestamp rather than deleting, exactly as
                        revoking a share does, and this screen follows the
                        precedent `MatterSharingScreen` already set. Saving it
                        again restores the same row; the server answers 201 for
                        a judgment brought back after removal.
                      */}
                      {isOwner ? (
                        <Pressable
                          accessibilityLabel={`Remove ${a.caseTitle} from this matter`}
                          disabled={removing === a.authorityId}
                          onPress={() => void removeAuthority(a.authorityId)}
                          style={styles.removeAuthority}
                        >
                          <Text variant="ui" style={styles.removeAuthorityLabel}>
                            {removing === a.authorityId ? 'Removing…' : 'Remove from this matter'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

            {/*
              A FAILED REMOVAL IS SAID, NEVER SWALLOWED. The row stays on
              screen either way; without this the advocate taps, watches
              nothing happen, and cannot tell a dead network from a judgment
              that refused to leave.
            */}
            {removeError ? (
              <Text variant="ui" style={styles.error}>
                {removeError}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionRule label="Timeline" />
          {events.length === 0 ? (
            <Text variant="ui" style={styles.muted}>
              Nothing recorded yet. The timeline holds what the court did.
            </Text>
          ) : (
            events.map((event) => (
              <TimelineEvent key={event.eventId} event={event} matterId={matterId} />
            ))
          )}
        </View>

        {/*
          A NOTE IS A PROPERTY OF AN EVENT, NOT A SEPARATE THING SERVER-SIDE —
          `matter_events.notes`, on any event type. This section is every
          event carrying one, not only the dedicated "Note" type the add-event
          form offers — a hearing can carry a private thought about it too,
          and it belongs here as much as a standalone note does.
        */}
        {events.some((e) => e.notes) ? (
          <View style={styles.section}>
            <SectionRule label="Notes" />
            {events
              .filter((e) => e.notes)
              .map((event) => (
                <View key={event.eventId} style={styles.noteOnly}>
                  <Text variant="record" style={styles.gutter}>
                    {formatGutter(parseCivilDate(event.eventDate) ?? today)}
                  </Text>
                  <Text variant="ui" style={styles.rowBody}>
                    {event.notes}
                  </Text>
                </View>
              ))}
          </View>
        ) : null}

        {addEventError ? (
          <Text variant="ui" style={styles.error}>
            {addEventError}
          </Text>
        ) : null}

        {cachedAt ? (
          <Text variant="ui" style={styles.freshness}>
            Showing what is saved on this phone · {describeCacheAge(cachedAt)}
          </Text>
        ) : null}
      </ScrollView>

      <AddEventSheet
        onDismiss={() => setAddEventOpen(false)}
        onSubmit={async (draft) => {
          const r = await api.addMatterEvent(matterId, draft);
          if (r.ok) {
            setAddEventOpen(false);
            setAddEventError(null);
            setBundle((current) =>
              current ? { ...current, events: [r.data.event, ...current.events] } : current,
            );
          } else {
            setAddEventError(r.error.message);
          }
        }}
        visible={addEventOpen}
      />
    </Screen>
  );
}

/**
 * ONE EVENT, TWO KINDS OF TEXT.
 *
 * `orderText` is the court's own record: always shown, always travels with a
 * share. `notes` are the advocate's, and their visibility is a per-note switch
 * whose default lives in the database column. The visual separation is the
 * point — a screen where the two look the same is a screen where one gets
 * shared believing it was the other.
 */
function TimelineEvent({ event, matterId }: { event: MatterEvent; matterId: string }) {
  const [visibility, setVisibility] = useState(event.noteVisibility);
  const [saving, setSaving] = useState(false);
  const date = parseCivilDate(event.eventDate);

  return (
    <View style={styles.event}>
      <Text variant="record" style={styles.gutter}>
        {date ? formatGutter(date) : event.eventDate}
      </Text>
      <View style={styles.rowBody}>
        <Text variant="eyebrow">{event.eventType}</Text>

        {event.orderText ? <Text variant="legal">{event.orderText}</Text> : null}

        {event.notes ? (
          <View style={styles.note}>
            <Text variant="ui">{event.notes}</Text>
            <View style={styles.noteVisibility}>
              <Text variant="ui" style={styles.muted}>
                {visibility === 'shared' ? 'Shared on this matter' : 'Private to you'}
              </Text>
              <Switch
                value={visibility === 'shared'}
                disabled={saving}
                onValueChange={(next) => {
                  const value = next ? 'shared' : 'private';
                  setVisibility(value);
                  setSaving(true);
                  /**
                   * OPTIMISTIC, AND IT REVERTS RATHER THAN LYING.
                   *
                   * The switch moves at once because the advocate's own note is
                   * theirs to reclassify. But a failed write must not leave them
                   * believing a private note is now shared, or the reverse — so
                   * a failure puts the switch back where it was. There is no
                   * "saved" toast: the position of the switch IS the state.
                   */
                  void api.setNoteVisibility(matterId, event.eventId, value).then((r) => {
                    setSaving(false);
                    if (!r.ok) setVisibility(event.noteVisibility);
                  });
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },

  nextCard: { gap: space.xs, marginTop: space.xs },
  actions: { gap: space.xs },
  section: { gap: space.xs, marginTop: space.sm },
  /** Ink weight and a solid rule, matching every other surface's mark. */
  uncitable: {
    color: color.ink,
    borderLeftWidth: 2,
    borderLeftColor: color.ink,
    paddingLeft: space.xs,
  },

  /**
   * This screen's rows carry no border normally (`row`, below) — a card
   * border would be `BriefingAuthorityRow`'s treatment, not this list's. An
   * ink left-rule, matching `uncitable`'s own accent, says "look here"
   * without borrowing a different surface's chrome.
   */
  rowMoved: { borderLeftWidth: 2, borderLeftColor: color.ink, paddingLeft: space.xs },
  struck: { textDecorationLine: 'line-through' },
  stillStands: { color: color.ink },
  doubtedLine: { color: color.inkMuted },
  overruledBy: { color: color.inkMuted },

  /**
   * Oxblood, and set on its own line rather than as a trailing icon — the same
   * treatment `MatterSharingScreen` gives "Revoke", which is the same act on
   * the same kind of record.
   */
  removeAuthority: { alignSelf: 'flex-start', marginTop: 4 },
  removeAuthorityLabel: { color: color.oxblood },

  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  event: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  gutter: { width: 62, paddingTop: 3 },
  rowBody: { flex: 1, gap: 4 },

  /** The advocate's own text sits in a tinted well so it never reads as the court's. */
  note: { backgroundColor: color.paperDesk, padding: space.xs, gap: space.xs },
  noteVisibility: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  muted: { color: color.inkMuted },
  freshness: { color: color.inkMuted, paddingTop: space.sm },
  noteOnly: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  error: { color: color.oxblood },
});
