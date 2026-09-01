import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ChevronLeft, Clock, Info, X } from 'lucide-react-native';

import { Button } from '../../components/Button';
import { FadeRise } from '../../components/FadeRise';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { JudgmentDetail } from '../../api/contract';
import { citationCopyText, citationDisplay } from '../../citation/citationDisplay';
import { citationRender } from '../../citation/renderState';
import { newClientKey, useOutbox } from '../../state/outbox';
import { judgmentCacheKey, readCache, writeCache } from '../../state/offlineCache';
import { useRecentItems } from '../../state/recentItems';
import { haptics } from '../../theme/haptics';
import { formatJudgmentDate } from '../../theme/judgmentDate';
import { color, radius, space, state } from '../../theme/tokens';
import { AuthoritiesPanel, useAuthorities } from './AuthoritiesPanel';
import { AttributionNote } from '../../components/AttributionNote';
import { MatterPicker } from './MatterPicker';
import { BodyTextWithheld, SourceTrustBlock } from './SourceTrustBlock';
import { ReadingView } from './ReadingView';
import { UnverifiedCitationScreen } from './UnverifiedCitationScreen';
import { VerificationSheet } from './VerificationSheet';

/**
 * Judgment detail — inventory rows 18–22 and 89.
 *
 * THE ONLY TRACE OF VERIFICATION IS A SMALL INFO GLYPH beside the citation:
 * tappable, silent until asked. The header is the case name and the bench,
 * which is what an advocate reads first anyway.
 *
 * OVERRULED ALWAYS SHOWS ITS STATE, ON EVERY SURFACE, IN ALL THREE STATES, and
 * `overruled_status` is read live at render — never cached, never denormalised.
 * Verification is permanent; good law is not, and law moves under a saved
 * citation.
 *
 * `set_aside` DISABLES ADD-TO-MATTER — the one case where Lawmind refuses to
 * let an authority be used, with the reason visible rather than a dead button.
 *
 * `renders/65-judgment-quiet@2x.png`, `renders/19-overruled-three-states.png`.
 */
/**
 * Resolves `overruled_by_judgment_id` into a citable judgment.
 *
 * Kept as a hook rather than inlined because the set-aside card is the one
 * place where showing an unresolved value would be actively harmful — an
 * advocate reading "cite this instead: jdg_mock_7" has been told nothing and
 * shown our plumbing.
 */
function useReplacement(judgmentId: string | null | undefined) {
  const [replacement, setReplacement] = useState<JudgmentDetail | null>(null);

  useEffect(() => {
    if (!judgmentId) {
      setReplacement(null);
      return;
    }
    let alive = true;
    void api.judgment(judgmentId).then((r) => {
      if (alive && r.ok) setReplacement(r.data);
    });
    return () => {
      alive = false;
    };
  }, [judgmentId]);

  return replacement;
}

export function JudgmentScreen({
  judgmentId,
  citationCheckId,
  onBack,
  onOpenJudgment,
  onOpenTreatment,
  reading,
  openParagraph,
  onSetReading,
}: {
  judgmentId: string;
  /**
   * The verification-record handle, carried from the search result that led
   * here. Undefined when the judgment was opened cold — from a link, from the
   * authorities panel, from a relied-on row — and the verification surfaces
   * state that rather than pretending to have looked.
   */
  citationCheckId?: string;
  onBack: () => void;
  onOpenJudgment: (id: string) => void;
  /** Opens the citation network — how later courts treated this authority. */
  onOpenTreatment: () => void;
  /** Held in the URL, not in state — see the note in `app/judgment/[id].tsx`. */
  reading: boolean;
  openParagraph?: number;
  onSetReading: (reading: boolean, paragraphNumber?: number) => void;
}) {
  const [judgment, setJudgment] = useState<JudgmentDetail | null>(null);
  const recordRecent = useRecentItems((s) => s.record);
  /**
   * SET ONLY WHEN THIS JUDGMENT CAME OFF THE DEVICE. It is the timestamp of the
   * last successful read, and it is what makes an offline `overruled_status`
   * honest — `docs/CITATION_HARNESS.md`: "Offline surfaces render the status
   * they last read WITH ITS AS-OF DATE SHOWN; they never present a stale status
   * as current." Null means live, which is the ordinary case.
   */
  const [statusAsOf, setStatusAsOf] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [copied, setCopied] = useState(false);
  /**
   * ADD-TO-MATTER. The endpoint landed 11 Aug 2026
   * (`POST /matters/:id/authorities`); until then this screen's button had no
   * `onPress` at all — a live-looking control that did nothing.
   *
   * `saved` is the confirmation, `saveError` the server's own words. The
   * server refuses `set_aside` with `409 AUTHORITY_SET_ASIDE` and its message
   * NAMES THE REPLACEMENT JUDGMENT, so it is rendered verbatim rather than
   * replaced with a generic line — that name is the useful part.
   *
   * The client refuses it too, from `moved.blocksAddToMatter`. That is not a
   * duplicated rule but one rule enforced at both ends: a replayed request or a
   * stale build bypasses the client's copy, and the server's is the one that
   * actually protects the matter file.
   */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const enqueueCopy = useOutbox((s) => s.enqueue);

  /**
   * THE LOADING AND MISSING BRANCHES CARRY NO NAV ROW, SO NOTHING WAS PUSHING
   * THEM CLEAR OF THE STATUS BAR.
   *
   * Observed on a Galaxy S24: "We could not open this judgment" drew underneath
   * the clock and the signal bars. The loaded screen never showed it because
   * `styles.nav` happens to supply the gap — which is why this only appears in
   * the two states nobody screenshots. Third time this class of overlap has
   * been found on a device and never in a test.
   */
  const insets = useSafeAreaInsets();
  const topInset = { paddingTop: insets.top + space.sm };

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * READ THE DEVICE FIRST, THEN THE NETWORK.
   *
   * PD-9 item 6 is "reading progress across sessions, INCLUDING OFFLINE", and
   * `state/reading.ts` has kept the position on the device since S1. Observed on
   * a device 8 Aug 2026: the position survived perfectly and was useless,
   * because the JUDGMENT was fetched fresh on every open. With the radio off the
   * screen never got past "We could not open this judgment", so there was
   * nothing for the saved paragraph to be restored into. A remembered place in a
   * document you cannot open is not a feature.
   *
   * So the text is cached with the same 30-day entry the briefings use. What is
   * NOT cached, ever, is whether the law has moved: `overruled_status` is read
   * live at render on every surface, and where this screen is serving a cached
   * copy it renders that status with `statusAsOf` — the date it was last read —
   * rather than as current. That is the difference between an honest offline
   * screen and a stale badge, and the stale-overruled threshold is zero.
   * ─────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    let alive = true;
    setJudgment(null);
    setStatusAsOf(null);
    setMissing(false);

    void readCache<JudgmentDetail>(judgmentCacheKey(judgmentId)).then((entry) => {
      // A live response that has already landed always wins over the cache.
      if (!alive || !entry) return;
      setJudgment((current) => {
        if (current) return current;
        setStatusAsOf(entry.cachedAt);
        return entry.value;
      });
    });

    void api.judgment(judgmentId).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setJudgment(r.data);
        setStatusAsOf(null);
        void writeCache(judgmentCacheKey(judgmentId), r.data);
        recordRecent({ kind: 'judgment', id: judgmentId, title: r.data.caseTitle });
        return;
      }
      // Only a judgment we have never held is missing. One we hold a copy of is
      // already on screen, and saying "we could not open this" over the top of
      // it would be false.
      setJudgment((current) => {
        if (!current) setMissing(true);
        return current;
      });
    });

    return () => {
      alive = false;
    };
  }, [judgmentId]);

  /**
   * "Relied on" comes from its own endpoint, not from the detail payload —
   * `GET /judgments/:id` carries no `reliedOn` at all. Fetched here rather than
   * inside the panel so the panel stays pure and testable, which is where the
   * never-a-soundness-rating tests live.
   */
  const authorities = useAuthorities(judgmentId);

  /**
   * The judgment that moved the law, RESOLVED — never described.
   *
   * `overruledByJudgmentId` is an internal id and must never reach a screen: an
   * advocate cannot cite `jdg_mock_7`. It is fetched like any other judgment so
   * the card carries a real case name and a real citation, both off the
   * database row. Until it arrives the card says what it does not have rather
   * than showing the id as a placeholder.
   *
   * CALLED BEFORE EVERY EARLY RETURN. Hooks may not sit behind a conditional —
   * placed after the loading branch it renders a different number of hooks on
   * the second pass and React tears the screen down to a blank page.
   */
  const replacement = useReplacement(judgment?.overruledByJudgmentId);

  if (missing) {
    /**
     * NOT "that judgment is not in the corpus". Telling an advocate their
     * authority is missing when the truth is that WE could not fetch it would
     * send them looking elsewhere for a judgment we hold.
     *
     * State our limitation, never imply a gap in the law. This is the same
     * distinction the panel draws when it resolves no authorities.
     */
    return (
      <Screen>
        <View style={[styles.body, topInset]}>
          <Text variant="uiStrong">We could not open this judgment</Text>
          <Text variant="ui" style={styles.muted}>
            It is in the corpus — search found it. Something went wrong on our side fetching the
            full text. The search result is still accurate.
          </Text>
          <Button label="Back to results" onPress={onBack} variant="secondary" />
        </View>
      </Screen>
    );
  }

  if (!judgment) {
    return (
      <Screen>
        <View style={[styles.body, topInset]}>
          <SkeletonCard index={0} />
        </View>
      </Screen>
    );
  }

  if (showCheck) {
    return (
      <UnverifiedCitationScreen
        citationCheckId={citationCheckId}
        judgment={judgment}
        onBack={() => setShowCheck(false)}
      />
    );
  }

  if (reading) {
    return (
      <ReadingView
        judgment={judgment}
        onBack={() => onSetReading(false)}
        onOpenJudgment={onOpenJudgment}
        onParagraphChange={(n) => onSetReading(true, n)}
        openParagraph={openParagraph}
      />
    );
  }

  /**
   * `statusAsOf` is passed ONLY when this copy came off the device. Live reads
   * pass nothing, which is what `citationRender` treats as current — the
   * never-cached rule, expressed at the one call site that can know.
   */
  const { existence, moved } = citationRender({
    ...judgment,
    ...(statusAsOf ? { statusAsOf: formatJudgmentDate(statusAsOf.slice(0, 10)) } : {}),
  });
  const blocked = moved.kind === 'moved' && moved.blocksAddToMatter;

  /**
   * The citation slot and whether this authority can enter a filing —
   * `citation/citationDisplay.ts`, the only place that decides it. Independent
   * of `moved` and `existence` above: a judgment can be verified, good law, and
   * carry no citation, which is exactly the 40,980 High Court rows.
   */
  const citation = citationDisplay(judgment);

  /**
   * WHAT LANDS ON THE CLIPBOARD IS TWO STORED FIELDS AND A COMMA.
   *
   * `DOMAIN_TRUTH.md`: "Never construct a citation string by pattern — render
   * only what is stored." So this emits `caseTitle` and `neutralCitation`
   * verbatim, exactly the two the screen is already showing, and invents no
   * citation format around them. Reporter citations are deliberately left out:
   * the screen does not show them here, and an advocate pasting a string they
   * did not see on screen is the same class of surprise as a badge they did not
   * ask for.
   *
   * Rendered from the resolved row, never from anything a model produced —
   * `CITATION_HARNESS.md` step 8, which is the step most often skipped.
   */
  /**
   * WHAT LANDS ON THE CLIPBOARD, AND THE BUG THAT MADE THIS A FUNCTION.
   *
   * Until 11 Aug 2026 this was `` `${caseTitle}, ${neutralCitation}` `` — a
   * template literal, which TypeScript is perfectly happy to fill with `null`.
   * Against the 40,980 citationless High Court rows now in the corpus it put
   *
   *     "Mock Petitioner v. State of Bihar, null"
   *
   * on the clipboard, one paste from a filing. No compiler error, no test, and
   * `neutralCitation` was typed `string` while the server had always sent
   * `string | null`.
   *
   * Now: the case title alone when there is no citation. That is the whole
   * remedy — the advocate gets what we actually hold, and nothing is invented
   * around it. `DOMAIN_TRUTH.md`: render only what is stored.
   */
  const citationText = citationCopyText(judgment.caseTitle, citation);

  const copyLabel = copied ? 'Citation copied' : citation.citable ? 'Copy citation' : 'Copy case name';

  const onCopyCitation = () => {
    /**
     * THE CLIPBOARD WRITE IS NOT AWAITED AGAINST THE NETWORK.
     *
     * The advocate asked for a string on their clipboard; they get it now, and
     * offline. The record follows through the outbox — a court building with no
     * signal is exactly where this is used, and making the paste wait on a
     * write would trade what they asked for against what we want.
     */
    void Clipboard.setStringAsync(citationText);
    haptics.tap();
    setCopied(true);

    void enqueueCopy({
      judgmentId: judgment.judgmentId,
      citationCheckId: citationCheckId ?? undefined,
      // `SCHEMA_TRUTH.md#citation_copies` surface enum — not a free string.
      surface: 'judgment_detail',
      copiedAt: new Date().toISOString(),
      clientKey: newClientKey(),
    });
  };


  return (
    <Screen>
      <View style={[styles.nav, { paddingTop: insets.top + space.xs }]}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
          <ChevronLeft color={color.ink} size={22} strokeWidth={1.5} />
        </Pressable>
        <Text variant="uiStrong" style={styles.navTitle}>
          Judgment
        </Text>
      </View>

      {/*
        `set_aside` — THE DANGER BAND REPLACES THE HEADER. Danger red, not
        caution amber: amber means the law has moved and this is further than
        that — the authority is gone. It is the first thing on the screen
        because an advocate scanning for the holding must not reach it first.
      */}
      {moved.kind === 'moved' && moved.band === 'danger' ? (
        <View style={styles.dangerBand}>
          <View style={styles.dangerHead}>
            <X color={color.card} size={20} strokeWidth={2} />
            <Text variant="uiStrong" style={styles.dangerBandTitle}>
              {moved.headline}
            </Text>
          </View>
          <Text variant="ui" style={styles.dangerBandBody}>
            {judgment.overruledNote ?? 'This judgment has been set aside.'} Do not cite it for any
            proposition.
          </Text>
          {moved.asOf ? (
            <Text variant="ui" style={styles.dangerBandBody}>
              Good-law status as of {moved.asOf}
            </Text>
          ) : null}
          {/*
            WHO SAID SO — OD-14 layer 4, inside the band that says the law
            moved and never in place of it. The band's claim is unchanged by
            it: a reporter-attributed set-aside is shown exactly as loudly as
            a court-attributed one, because `overruledStatus` decides the
            warning and this decides only the wording beneath it.
          */}
          <AttributionNote attribution={judgment.treatmentAttribution} tone="onDanger" />
          {replacement ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenJudgment(replacement.judgmentId)}
            >
              <View style={styles.dangerAction}>
                <Text variant="uiStrong" style={styles.dangerBandTitle}>
                  Read the judgment that overruled it
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.citationRow}>
          <Text opticalNudge variant="record" style={!citation.citable ? styles.citationAbsent : undefined}>
            {citation.text}
          </Text>
          {/* Silent until asked. This is the user pulling, never us pushing. */}
          <Pressable
            accessibilityLabel="How this citation was checked"
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
          >
            <Info color={color.inkFaint} size={16} strokeWidth={1.5} />
          </Pressable>
        </View>

        <Text
          variant="legal"
          scale="caseName"
          style={moved.kind === 'moved' && moved.strikeTitle ? styles.struck : undefined}
        >
          {judgment.caseTitle}
        </Text>
        <Text variant="ui" style={styles.bench}>
          {judgment.court} · {formatJudgmentDate(judgment.judgmentDate)}
        </Text>
        {/*
          NULLABLE SINCE 11 AUG 2026 — every High Court row (51.3% of the
          corpus) had a database partition slug here until LCC's `c2da1b9`
          moved it to `source_bench_code` and this went `null`. Absent means
          no coram was recorded, not that the row failed to load, so the line
          is omitted rather than shown empty or printing a fabricated one.
        */}
        {judgment.bench ? (
          <Text variant="ui" style={styles.bench}>
            {judgment.bench}
          </Text>
        ) : null}

        {existence.kind === 'unconfirmed' ? (
          <Pressable accessibilityRole="button" onPress={() => setShowCheck(true)}>
            <View style={styles.unconfirmed}>
              <Text variant="uiStrong">{existence.headline}</Text>
              <Text variant="ui" style={styles.muted}>
                {existence.reason}
              </Text>
              <Text variant="uiStrong" style={styles.ecourts}>
                {existence.ecourtsAction}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {/*
          `partly_set_aside` — the caution band names the affected paragraphs,
          and WHAT STILL STANDS IS STATED FIRST. What survives is what the
          advocate is about to rely on; leading with what fell buries it.
        */}
        {moved.kind === 'moved' && moved.band === 'caution' ? (
          <View style={[styles.moved, styles.movedCaution]}>
            {moved.whatStillStands ? (
              <Text variant="uiStrong" style={styles.cautionText}>
                What still stands — {moved.whatStillStands}
              </Text>
            ) : null}
            <Text variant="ui" style={styles.muted}>
              {moved.headline}
            </Text>
            {moved.asOf ? (
              <Text variant="ui" style={styles.asOf}>
                Good-law status as of {moved.asOf}
              </Text>
            ) : null}
            <AttributionNote attribution={judgment.treatmentAttribution} />
          </View>
        ) : null}

        {/*
          `doubted` — NO BAND AT ALL. One muted line under the title. The
          judgment is still binding, so shouting would be wrong; the advocate
          simply needs to know before they stand up.
        */}
        {moved.kind === 'moved' && moved.band === 'none' ? (
          <>
            <View style={styles.doubtedRow}>
              <Clock color={color.inkFaint} size={16} strokeWidth={1.5} />
              <Text variant="ui" style={styles.muted}>
                {moved.headline}
              </Text>
            </View>
            <AttributionNote attribution={judgment.treatmentAttribution} />
          </>
        ) : null}

        {/*
          `set_aside` — of historical interest only. The eyebrow says so, and
          the holding drops to muted ink so it cannot be skim-read as live law.
        */}
        {/*
          THE HOLDING SECTION IS OMITTED ENTIRELY WHEN THERE IS NO HOLDING.

          The two-sentence summary needs a model that is not wired, so the
          corpus returns nothing for it on almost every judgment. A labelled
          rule over empty space reads as a rendering fault and sends the
          advocate looking for what broke; and filling it from the first
          paragraph would be manufacturing a holding, which is the one thing
          that must never happen on a page an advocate quotes from.

          The full text is one tap below, which is where the holding actually
          is.
        */}
        {judgment.holding ? (
          <>
            <SectionRule
              accent={moved.kind === 'moved' && moved.band === 'danger'}
              label={
                moved.kind === 'moved' && moved.band === 'danger'
                  ? 'What it held — of historical interest only'
                  : 'Holding'
              }
            />
            <Text
              variant="legal"
              style={moved.kind === 'moved' && moved.strikeTitle ? styles.muted : undefined}
            >
              {judgment.holding}
            </Text>
          </>
        ) : null}

        {/*
          "CITE THIS INSTEAD" IS MANDATORY for a set-aside authority, not a
          nicety. Telling an advocate their authority is dead without telling
          them what replaced it leaves them worse off than before they looked.
        */}
        {moved.kind === 'moved' && moved.requiresReplacement ? (
          <View style={styles.replacement}>
            <Text variant="eyebrow">Cite this instead</Text>
            {replacement ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenJudgment(replacement.judgmentId)}
              >
                <Text variant="legal">{replacement.caseTitle}</Text>
                {/*
                  THE REPLACEMENT'S OWN CITATION, THROUGH THE HELPER.
                  This is the authority we are telling the advocate to use
                  INSTEAD, so an empty slot here is worse than anywhere else on
                  the screen — it is the one citation they came to this block to
                  copy. Raw interpolation until 11 Aug 2026; caught by the
                  adversarial source scan, not by a rendering test.
                */}
                <Text opticalNudge variant="record">
                  {citationDisplay(replacement).text}
                </Text>
              </Pressable>
            ) : (
              <Text variant="ui" style={styles.muted}>
                We do not yet have the judgment that replaced it. Do not cite this one meanwhile.
              </Text>
            )}
          </View>
        ) : null}

          {/*
          ─────────────────────────────────────────────────────────────────────
          THE IDENTIFIERS THE COURT ITSELF USES, AND THE LINK TO ITS OWN COPY.

          `CITATION_HARNESS.md` §"The fourth concern" requires that an uncitable
          judgment keep what it does have: *"preserve case number, parties,
          court, date, source URL and paragraph information where available."*
          The server has been sending `case_number` and `source_url` on every
          judgment since S1; neither was declared on `JudgmentDetail` and
          neither was ever rendered, so for the 40,980 High Court judgments with
          no citation the screen showed no way to refer to the case at all.

          A CASE NUMBER IS NOT A CITATION and is never presented as one. It
          identifies a proceeding on a court's register — which is exactly what
          an advocate needs to find the matter when no reporter ever numbered
          it. It is labelled, so it cannot be mistaken for a citation.

          THE SOURCE URL IS NEVER CONSTRUCTED, only opened. A path assembled
          client-side would be a guess at a court's routing, and a wrong guess
          sends an advocate to a different case while telling them it is this
          one.
        */}
        <View style={styles.identifiers}>
          {judgment.caseNumber ? (
            <Text opticalNudge variant="record" style={styles.identifier}>
              Case number · {judgment.caseNumber}
            </Text>
          ) : null}
        </View>

        {/*
          WHERE THIS CAME FROM — R12 §5. Four facts with four different
          evidences: the source URL (100% of the corpus), the recorded
          provenance (0.031%), the derived text origin, and the date quality.
          Kept apart deliberately; see `SourceTrustBlock.tsx` for why merging
          any two of them produces a claim we cannot support.
        */}
        <SourceTrustBlock judgment={judgment} />

        {/*
          THE READER'S REFUSAL. Rendered instead of an empty page when the body
          text is convicted damaged — empty by REFUSAL, not by absence.
        */}
        <BodyTextWithheld judgment={judgment} />

      {/*
          THE OPERATIVE PARAGRAPH IS DRAWN ONLY WHEN THE SERVER NAMES ONE.

          `GET /judgments/:id` sends neither the paragraph nor its number. The
          field does arrive on search results, where it is ~2,600 characters of
          raw OCR — running headers, marginal letters, mid-word hyphen breaks.
          Setting that in a display face behind an oxblood rule would present
          OCR wreckage as the court's own words, in the one place on the screen
          designed to be quoted from. So the block waits for a paragraph the
          server has actually identified.
        */}
        {judgment.operativeParagraph && judgment.operativeParagraphNumber ? (
          <View style={styles.operative}>
            <Text variant="eyebrow">
              Operative paragraph · {judgment.operativeParagraphNumber}
            </Text>
            <Text variant="legal" style={styles.operativeQuote}>
              {judgment.operativeParagraph}
            </Text>
          </View>
        ) : null}

        {/*
          "Relied on", now with a date behind every row. Served from
          `/judgments/:id/authorities` because the detail payload carries no
          `reliedOn` — and because the endpoint answers the harder question:
          not just what this bench cited, but whether that law was standing when
          they cited it.
        */}
        <AuthoritiesPanel
          data={authorities.data}
          error={authorities.error}
          onOpenJudgment={onOpenJudgment}
        />

        {/*
          "Relied on" looks backwards, at what this judgment cited. This looks
          FORWARD, at what happened to it since — which is the question that
          decides whether it can still be relied on today, and the one a
          citation list cannot answer.
        */}
        <Button
          label="How courts have treated this"
          onPress={onOpenTreatment}
          variant="secondary"
        />

        <Button label="Read the judgment" onPress={() => onSetReading(true)} variant="secondary" />

        {/*
          COPY CITATION — THE HIGHEST-RISK USER, AND THE ONLY HANDLE WE GET ON THEM.

          `SCHEMA_TRUTH.md#citation_copies`: an advocate who copies a citation
          into their own document "has taken it out of the app entirely — they
          saw the badge, they may file it, and without this record NO
          NOTIFICATION CAN EVER REACH THEM." The tap is the whole point of the
          record, so the record is written on the tap and not on some later sync
          we hope for.

          IT IS OFFERED IN EVERY STATE, INCLUDING `set_aside`. Only
          add-to-matter is refused (`CITATION_HARNESS.md`: "the ONE case where
          Lawmind refuses to let an authority be used"), and refusing the copy
          as well would be inventing a second refusal — while ALSO destroying
          the only record that would let us warn them. Someone determined to
          quote a set-aside case will retype it; better that we know.
        */}
        <Button label={copyLabel} onPress={onCopyCitation} variant="secondary" />

        {/*
          FILE-READINESS IS STATED WHERE THE ADVOCATE ACTS ON IT, AND NOWHERE
          ELSE — the client contract §7. The card and the header just say what
          the record holds; this is the moment they are about to take the thing
          out of the app, so this is where "you cannot cite this" belongs.

          NOT A REFUSAL. Copy still works and add-to-matter still works: a
          citationless judgment is a real judgment of a real court and is
          perfectly usable for research. What it cannot do is go into a filing
          as an authority, and only that is said.

          Neutral ink. No amber — the law has not moved, and this is not our
          uncertainty either; it is a fact about the record.
        */}
        {citation.note ? (
          <Text variant="ui" style={styles.citationNote}>
            {citation.note}
          </Text>
        ) : null}

        {/*
          The label states the refusal rather than leaving a dead grey button
          the advocate taps twice before working out why nothing happened. This
          is the ONE case where Lawmind refuses to let an authority be used.
        */}
        <Button
          disabled={blocked || saved}
          label={
            blocked
              ? 'Cannot be added to a matter'
              : saved
                ? 'Saved to the matter'
                : 'Add to a matter'
          }
          onPress={blocked ? undefined : () => setPickerOpen(true)}
        />

        {/*
          THE SERVER'S REFUSAL, IN ITS OWN WORDS. `409 AUTHORITY_SET_ASIDE`
          names the judgment that replaced this one, and that name is the part
          an advocate can act on. Replacing it with a generic line would throw
          away the only useful thing in the response.

          Neutral ink: this is our refusal to let an authority be used, not a
          statement that the law has moved. Amber means the second thing only.
        */}
        {saveError ? (
          <Text variant="ui" style={styles.saveError}>
            {saveError}
          </Text>
        ) : null}
        {/*
          THE REASON ARRIVES AFTER THE REFUSAL, by 60ms.

          It appeared on the same frame as the disabled button, so the eye had
          to choose between two things that changed at once and usually landed
          on the paragraph — leaving the advocate reading an explanation before
          they had registered what it was explaining. 60ms is below anyone's
          threshold for "slow" and above the threshold where two events read as
          one.

          NEUTRAL INK, NO AMBER. This is our refusal to let an authority be
          used, not a statement that the law has moved — amber means the second
          thing and only the second thing.
        */}
        {blocked ? (
          <FadeRise delay={60}>
            <Text variant="ui" style={styles.blockedReason}>
              This judgment was set aside, so it cannot be saved to a matter or cited in a draft.
            </Text>
          </FadeRise>
        ) : null}
      </ScrollView>

      {/*
        ONE PICKER, REUSED. `MatterPicker` already exists for saving a passage
        from the reading view; saving the whole judgment asks the same question
        ("into which matter?") and gets the same sheet rather than a second one.
      */}
      <MatterPicker
        /*
          WHAT THIS PICKER WAS OPENED TO SAVE — NEW3 R16 `R16-RCC-04`. Held
          only if the advocate leaves for the create form, and performed against
          the matter that form makes. Without it the empty case pushed
          `/matter/new` and lost the save silently.
        */
        intent={{
          kind: 'authority',
          judgmentId: judgment.judgmentId,
          caseTitle: judgment.caseTitle,
          ...(citationCheckId ? { citationCheckId } : {}),
        }}
        onDismiss={() => setPickerOpen(false)}
        onPick={(matterId) => {
          setPickerOpen(false);
          setSaveError(null);
          void api
            .addAuthorityToMatter({ matterId, judgmentId: judgment.judgmentId, citationCheckId })
            .then((r) => {
              if (r.ok) {
                setSaved(true);
                haptics.commit();
              } else {
                // The server's message, verbatim — on `set_aside` it names the
                // replacement judgment, which is the actionable part.
                setSaveError(r.error.message);
              }
            });
        }}
        visible={pickerOpen}
      />

      <VerificationSheet
        citationCheckId={citationCheckId}
        judgment={judgment}
        onDismiss={() => setSheetOpen(false)}
        visible={sheetOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  navTitle: { flex: 1 },
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  citationRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  /** A fact about the record, not a warning: quieter ink, no amber, no dashes. */
  citationAbsent: { color: color.inkFaint, fontStyle: 'italic' },
  /** Sits with the actions, because that is where file-readiness is acted on. */
  citationNote: { color: color.inkMuted },
  /** The server's refusal, in neutral ink — our refusal, not the law moving. */
  saveError: { color: color.ink },
  identifiers: { gap: 4, paddingTop: space.xs },
  /** Labelled, so a register number can never be read as a citation. */
  identifier: { color: color.inkFaint },
  sourceLink: { color: color.oxblood },
  bench: { color: color.inkMuted },
  muted: { color: color.inkMuted },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  ecourts: { color: color.oxblood },
  moved: { borderRadius: radius.base, padding: space.sm, gap: space.xs, borderWidth: 1 },
  movedCaution: { backgroundColor: state.cautionWash, borderColor: state.caution },
  cautionText: { color: state.cautionText },
  asOf: { color: color.inkFaint },
  struck: { textDecorationLine: 'line-through', color: color.inkMuted },
  doubtedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },

  /** Full-bleed, replacing the header. Danger red, never caution amber. */
  dangerBand: { backgroundColor: state.danger, padding: space.sm, gap: space.xs },
  dangerHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dangerBandTitle: { flex: 1, color: color.card },
  dangerBandBody: { color: color.card },
  dangerAction: {
    borderWidth: 1,
    borderColor: color.card,
    borderRadius: radius.base,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  replacement: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  operative: {
    borderLeftWidth: 2,
    borderLeftColor: color.oxblood,
    paddingLeft: space.sm,
    gap: space.xs,
  },
  operativeQuote: { fontStyle: 'italic' },
  reliedRow: {
    gap: 2,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  blockedReason: { color: color.inkMuted },
});
