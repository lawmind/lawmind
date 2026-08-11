import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BriefingAuthorityRow } from './BriefingAuthorityRow';
import { Button } from '../../components/Button';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { Briefing } from '../../api/contract';
import { citationRender } from '../../citation/renderState';
import { describeCacheAge, readCache, writeCache } from '../../state/offlineCache';
import { haptics } from '../../theme/haptics';
import { describeHearingDate, formatLong, parseCivilDate, todayCivil } from '../../theme/hearingDate';
import { color, radius, space } from '../../theme/tokens';
import { BriefingSeal } from '../today/BriefingSeal';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE 24-HOUR HEARING BRIEFING — inventory row 8, canvas `8b`,
 * `renders/45-briefing@2x.png`. **The wedge, and it APPEARS unclaimed** —
 * researched 11 Aug 2026, `docs/FEATURE_PARITY.md` §5b. This line used to read
 * "no competitor in India has it", which is a stronger claim than anything we
 * checked supports: what was established is that the nearest competitor's
 * advocate-facing pricing page names no cause list, hearing date, case tracking,
 * digest or alert feature, and their cause-list product is sold to courts rather
 * than to advocates. That is *absent from their public pages*, not *absent from
 * their product* — their billing page would not render plan detail to a fetch.
 * `FOUNDER_QUEUE.md` FQ-BL2 records what a "nobody has it" claim cost us once
 * already. Their free tier costs ₹0, which is how to settle it properly.
 *
 * Read standing in a corridor, in ninety seconds, on a connection that may not
 * exist. Four numbered blocks, in this order and no other:
 *
 *   01  where the matter stands
 *   02  what is pending before the court
 *   03  authorities on the live issue
 *   04  the preparation checklist
 *
 * OFFLINE IS THE DESIGN CASE, NOT THE FALLBACK. The briefing is cached the
 * moment it is read and opens with the radio off; when it does, it says so and
 * gives the age of what it is showing. `docs/CITATION_HARNESS.md`: an offline
 * surface renders the status it last read WITH ITS AS-OF DATE, never as current.
 *
 * TWO THINGS THIS SCREEN MUST NOT DO, both from the render it is built from:
 *
 *   · `renders/45-briefing@2x.png` draws a green ✓ VERIFIED chip on the
 *     authority. **That render predates the trust inversion and diverges from
 *     the product** (`design/SCREENS.md` §Renders that diverge). Verified is
 *     silent. Only `unverified`/`failed` and `overruled` draw, and both come
 *     from `citationRender` via `ResultCard` — never from anything local.
 *   · The checklist NEVER writes into the matter timeline. The timeline records
 *     what the COURT did; polluting it makes the one authoritative surface
 *     untrustworthy (`SPRINT_3.md` NEVER).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const briefingCacheKey = (id: string) => `briefing.${id}`;

export function BriefingScreen({
  briefingId,
  onClose,
  onOpenJudgment,
}: {
  briefingId: string;
  onClose: () => void;
  onOpenJudgment: (judgmentId: string, citationCheckId?: string) => void;
}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [read, setRead] = useState(false);
  /**
   * SAVING AN AUTHORITY INTO THIS BRIEFING'S MATTER, keyed by judgment.
   *
   * `POST /matters/:id/authorities` is idempotent — 200 when it is already
   * saved, 201 when new or brought back after removal — so a double tap in a
   * court corridor cannot create a duplicate. The state here exists to stop the
   * row offering the action twice, not to protect the server.
   */
  const [saves, setSaves] = useState<
    Record<string, { saving: boolean; saved: boolean; error: string | null }>
  >({});

  useEffect(() => {
    let alive = true;
    setBriefing(null);
    setCachedAt(null);
    setMissing(false);

    void readCache<Briefing>(briefingCacheKey(briefingId)).then((entry) => {
      if (!alive || !entry) return;
      setBriefing((current) => {
        if (current) return current;
        setCachedAt(entry.cachedAt);
        return entry.value;
      });
    });

    void api.briefing(briefingId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setBriefing(r.data.briefing);
        setCachedAt(null);
        void writeCache(briefingCacheKey(briefingId), r.data.briefing);
        return;
      }
      setBriefing((current) => {
        if (!current) setMissing(true);
        return current;
      });
    });

    return () => {
      alive = false;
    };
  }, [briefingId]);

  /**
   * SAVE ONE HIGHLIGHTED AUTHORITY INTO THE BRIEFING'S OWN MATTER.
   *
   * NO PICKER. A briefing belongs to exactly one matter, so asking which one
   * would be asking a question the screen already knows the answer to — and
   * `JudgmentScreen` needs its picker for the opposite reason, that a judgment
   * opened from search belongs to none.
   *
   * NOT OPTIMISTIC, and the error is the server's own words. On `set_aside` the
   * `409` names the replacement judgment, which is the actionable half of the
   * refusal; rephrasing it would drop exactly that.
   */
  const saveAuthority = async (matterId: string, judgmentId: string) => {
    if (saves[judgmentId]?.saving || saves[judgmentId]?.saved) return;
    setSaves((s) => ({ ...s, [judgmentId]: { saving: true, saved: false, error: null } }));

    const r = await api.addAuthorityToMatter({ matterId, judgmentId });

    setSaves((s) => ({
      ...s,
      [judgmentId]: r.ok
        ? { saving: false, saved: true, error: null }
        : { saving: false, saved: false, error: r.error.message },
    }));
    if (r.ok) haptics.commit();
  };

  const today = useMemo(() => todayCivil(), []);

  if (missing) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="uiStrong">We could not open this briefing</Text>
          <Text variant="ui" style={styles.muted}>
            It was prepared, and it is not lost. Something went wrong on our side fetching it.
          </Text>
          <Button label="Close" onPress={onClose} variant="secondary" />
        </View>
      </Screen>
    );
  }

  if (!briefing) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="ui" style={styles.muted}>
            Opening the briefing…
          </Text>
        </View>
      </Screen>
    );
  }

  const hearing = parseCivilDate(briefing.hearingDate);
  const checklist = briefing.blocks?.checklist ?? [];
  /**
   * WHAT NEEDS ATTENTION, COUNTED OFF THE SAME MARKS THE ROWS DRAW.
   *
   * `attentionCount` takes `SearchResult[]` and a briefing authority is not
   * one, so the count is derived here from `citationRender` — the same
   * function, not a second opinion. An unavailable row counts: an authority we
   * could not read is exactly something to look at before going in.
   */
  const needAttention = briefing.authorities.filter((a) => {
    if (!a.available) return true;
    const { existence, moved } = citationRender({
      /**
       * THE SAME INPUTS THE ROW DRAWS FROM, or the header and the list
       * disagree. Omitting `verificationState` here would make every row
       * count as needing attention while none of them drew the mark —
       * "1 authority · 1 need your attention" over a card with nothing on it,
       * which is worse than either state alone because neither is checkable.
       */
      verificationState: a.verificationState,
      verifiedBySource: a.verifiedBySource,
      overruledStatus: a.overruledStatus,
      overruledNote: a.overruledNote,
      overruledParas: a.overruledParas,
    });
    return existence.kind === 'unconfirmed' || moved.kind === 'moved';
  }).length;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.close}>
          <Text variant="ui">Close</Text>
        </Pressable>
        {/*
          "OFFLINE" IS A STATE, NOT A WARNING. `renders/45-briefing@2x.png` puts
          it top right as a fact about the copy in hand. Where it came off the
          device it carries its age, because a briefing read three days ago and
          one read tonight are different things to rely on.
        */}
        <Text variant="eyebrow" style={styles.offline}>
          {cachedAt ? `Saved · ${describeCacheAge(cachedAt)}` : 'Saved for offline'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.masthead}>
          <BriefingSeal />
          <Text variant="eyebrow" style={styles.mastheadLabel}>
            Hearing briefing
          </Text>
        </View>

        {/*
          THE CASE NAME AND THE COURT — what the endpoint actually sends. This
          read `briefing.subject` until 11 Aug 2026, a field no route has ever
          carried, so the wedge feature's headline rendered blank.
        */}
        <Text variant="uiStrong" scale="title">
          {briefing.caseTitle}
        </Text>

        <View style={styles.factRows}>
          <FactRow label="COURT" value={briefing.court} />
          <FactRow
            label={describeHearingDate(briefing.hearingDate, today).toUpperCase()}
            value={hearing ? formatLong(hearing) : briefing.hearingDate}
          />
          {/*
            AN UNCONFIRMED LISTING IS NEVER SHOWN AS CONFIRMED — the same rule as
            a citation, and THREE STATES rather than two. Only `not_confirmed`
            deserves a line; `never_checked` is the ordinary case for a date the
            advocate typed (PD-12) and gets nothing, because a caution on the
            ordinary case teaches advocates to ignore cautions.

            This was a boolean the server has never sent. `undefined` is falsy,
            so a listing we had actively FAILED to confirm rendered exactly like
            a confirmed one — and an advocate misses a hearing that way.
          */}
          {briefing.dateConfidence.state === 'not_confirmed' ? (
            <Text variant="ui" style={styles.notConfirmed}>
              We could not confirm this listing against the cause list. This is the date you
              recorded.
              {briefing.dateConfidence.notConfirmedReason
                ? ` ${briefing.dateConfidence.notConfirmedReason}`
                : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.oxbloodRule} />

        <Block n="01" title="Where the matter stands">
          {/*
            THE LAST ORDER, AND ITS ABSENCE IS A SENTENCE THE SERVER WROTE.
            `assemble.ts`: "It never invents a block it has no data for. An
            empty block says it is empty." So an absent order renders the
            server's own note rather than a placeholder of ours — and where
            even that is missing, the smaller true thing.
          */}
          {!briefing.blocks ? (
            <Text variant="ui" style={styles.muted}>
              This briefing could not be read. Nothing has been lost.
            </Text>
          ) : briefing.blocks.lastOrder.present ? (
            <>
              {briefing.blocks.lastOrder.eventDate ? (
                <Text variant="eyebrow" style={styles.blockDate}>
                  {briefing.blocks.lastOrder.eventDate}
                </Text>
              ) : null}
              <Text variant="legal">
                {briefing.blocks.lastOrder.orderText ?? 'An order was recorded with no text.'}
              </Text>
            </>
          ) : (
            <Text variant="ui" style={styles.muted}>
              {briefing.blocks.lastOrder.note ?? 'No order has been recorded on this matter.'}
            </Text>
          )}
        </Block>

        <Block n="02" title="Pending before the court">
          {!briefing.blocks || briefing.blocks.pendingApplications.count === 0 ? (
            <Text variant="ui" style={styles.muted}>
              {briefing.blocks?.pendingApplications.note ?? 'Nothing is recorded as pending.'}
            </Text>
          ) : (
            briefing.blocks.pendingApplications.items.map((item) => (
              <View key={item.eventId} style={styles.pending}>
                <Text variant="eyebrow" style={styles.blockDate}>
                  {item.eventDate}
                </Text>
                <Text variant="legal">{item.description}</Text>
              </View>
            ))
          )}
        </Block>

        <Block n="03" title="Authorities on the live issue">
          {briefing.authorities.length === 0 ? (
            <Text variant="ui" style={styles.muted}>
              No authorities were attached to this briefing.
            </Text>
          ) : (
            <>
              {/*
                COUNTS WHAT NEEDS ATTENTION, NEVER WHAT PASSED. "4 authorities · 1
                needs your attention", never "3 verified" — the second decorates
                the floor and leaves the list nothing to tell you.
              */}
              <Text variant="ui" style={styles.muted}>
                {briefing.authorities.length}{' '}
                {briefing.authorities.length === 1 ? 'authority' : 'authorities'}
                {needAttention > 0 ? ` · ${needAttention} need your attention` : ''}
              </Text>
              {briefing.authorities.map((authority) => (
                <BriefingAuthorityRow
                  key={authority.judgmentId}
                  authority={authority}
                  /**
                   * THE NEVER-CACHED RULE, AT THE ONE CALL SITE THAT CAN KNOW.
                   * A briefing served from the device carries a good-law status
                   * that was read then, not now — so every authority on it says
                   * so. Passing nothing means live.
                   */
                  {...(cachedAt
                    ? { statusAsOf: formatLong(parseCivilDate(cachedAt.slice(0, 10)) ?? today) }
                    : {})}
                  onOpen={() => onOpenJudgment(authority.judgmentId)}
                  onSaveToMatter={
                    /*
                      OFFERED ONLY WHERE IT CAN SUCCEED. The unavailable arm has
                      no judgment row behind it, so there is nothing to save —
                      the row already says why, and adding a button that would
                      404 on top of that explanation says less, not more.
                    */
                    authority.available
                      ? () => void saveAuthority(briefing.matterId, authority.judgmentId)
                      : undefined
                  }
                  {...(saves[authority.judgmentId]
                    ? { saveState: saves[authority.judgmentId]! }
                    : {})}
                />
              ))}
            </>
          )}
        </Block>

        <Block n="04" title="Before you go in">
          {checklist.length === 0 ? (
            <Text variant="ui" style={styles.muted}>
              Nothing to prepare.
            </Text>
          ) : (
            checklist.map((item) => {
              /**
               * THE TICK IS LOCAL TO THIS SESSION, and the type now says so.
               * Nothing server-side records one — `blocks.checklist` carries
               * `{ id, text, basis }` and no `done`. The old type declared
               * `done`, which promised a tick that survived closing the screen
               * and never did.
               */
              const done = ticked[item.id] ?? false;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  onPress={() => {
                    haptics.commit();
                    setTicked((t) => ({ ...t, [item.id]: !done }));
                  }}
                  style={styles.checkRow}
                >
                  <View style={[styles.checkBox, done ? styles.checkBoxOn : null]}>
                    {done ? (
                      <Text variant="uiStrong" style={styles.checkMark}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.checkBody}>
                    <Text variant="ui" style={done ? styles.checkDone : undefined}>
                      {item.text}
                    </Text>
                    {/*
                      WHY THIS ITEM IS ON THE LIST. `assemble.ts` writes a
                      `basis` for every item precisely so nothing on the
                      checklist is an instruction with no source — "every item
                      points at something the advocate can check".
                    */}
                    <Text variant="ui" style={styles.checkBasis}>
                      {item.basis}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
          {/*
            Said out loud, because it is the rule this block most easily breaks.
            The checklist is the advocate's own preparation; the timeline is the
            court's record, and the two never mix.
          */}
          <Text variant="ui" style={styles.checklistNote}>
            This list is yours. Nothing here is written to the matter timeline.
          </Text>
        </Block>

        <Button
          label={read ? 'Marked as read' : 'Mark as read'}
          disabled={read}
          onPress={() => {
            haptics.commit();
            setRead(true);
            // Activation is measured on the OPEN, and the three facts —
            // generated, delivered, opened — stay three columns.
            void api.markBriefingOpened(briefingId);
          }}
        />
      </ScrollView>
    </Screen>
  );
}

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text variant="record" style={styles.blockNumber}>
          {n}
        </Text>
        <Text variant="eyebrow">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text variant="eyebrow" style={styles.factLabel}>
        {label}
      </Text>
      <Text variant="record" opticalNudge style={styles.factValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
  },
  close: { minHeight: 44, justifyContent: 'center' },
  offline: { color: color.inkMuted },

  body: { padding: space.sm, gap: space.md, paddingBottom: space.xxl },
  masthead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  mastheadLabel: { color: color.oxblood },

  factRows: { gap: 2 },
  factRow: { flexDirection: 'row', gap: space.sm },
  factLabel: { width: 110 },
  factValue: { flex: 1 },
  oxbloodRule: { height: 2, backgroundColor: color.oxblood },

  block: { gap: space.xs },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  blockNumber: { color: color.inkMuted },

  blockDate: { color: color.inkMuted },
  pending: { gap: 2, paddingBottom: space.xs },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52 },
  checkBody: { flex: 1, gap: 2 },
  checkBasis: { color: color.inkFaint },
  checkBox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: color.ink, borderColor: color.ink },
  checkMark: { color: color.card },
  checkDone: { color: color.inkMuted, textDecorationLine: 'line-through' },
  checklistNote: { color: color.inkMuted, paddingTop: space.xs },

  /** Neutral ink, dashed nowhere near amber — amber means the law moved. */
  notConfirmed: { color: color.inkMuted, paddingTop: space.xs },
  muted: { color: color.inkMuted },
});
