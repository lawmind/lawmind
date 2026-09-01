import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { citationDisplay } from '../../citation/citationDisplay';
import { citationRender } from '../../citation/renderState';
import type {
  ApiResponse,
  StatuteLinkedJudgment,
  StatuteLinkedJudgmentsResponse,
} from '../../api/contract';
import { api } from '../../api/client';
import { formatJudgmentDate } from '../../theme/judgmentDate';
import { color, space } from '../../theme/tokens';
import {
  classifyStatuteLinked,
  relationSentence,
  unreviewedCount,
  withheldJudgmentCount,
  withheldReferenceCount,
} from './statuteLinkedTruth';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUTE → LINKED JUDGMENTS — HELD. NOT REACHABLE. NOT RELEASED.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R16 `R16-RCC-08`, against LCC's route landed at `69d2a9bb`. NEW3's own
 * decision record reads
 * `STATUTE_LINKED_IMPLEMENTATION_NEXT = LCC_ROUTE_THEN_RCC_IMPLEMENT_BEHIND_GATE`,
 * and this is that second step: the surface exists so NEW3 can acceptance-test
 * it, and an advocate cannot get to it.
 *
 * **HOW IT IS HELD, AND WHY IT IS HELD THIS WAY.**
 *
 * There is NO ROUTE FILE for this screen. Not a gated one, not a `__DEV__` one
 * — none. Nothing under `apps/mobile/app/` imports it, so there is no path, no
 * deep link and no navigation entry that names it, and `screens/routeGates.test.ts`
 * cannot find a gate to check because there is no door to gate. That is the
 * strongest form of held this codebase has, and it is the same one
 * `semanticSearch` has run under since R12: built, measured, unreachable.
 *
 * A `CapabilityBoundary` was the obvious alternative and is deliberately NOT
 * used. It would require a route to wrap, and a route is a destination — NEW3
 * R15 §7 found `/matter-sharing/[id]` mounting a `POST_V1` screen because only
 * its button was gated, and `/directory` shipping in the binary reachable from
 * any 404. A boundary is the right tool for a screen that will open; it is the
 * wrong tool for one whose release condition — NEW3's acceptance of LCC's
 * evidence — has not been met.
 *
 * **THE CAPABILITY REGISTRY IS UNTOUCHED.** `statute.linked_judgments` is
 * `LIMITED` server-side and `POST_V1` on iOS, Android and web in the product
 * registry, and neither moved. No `SurfaceName` was added to `V1_SURFACE`
 * either: adding a row would be an edit to the frozen client registry for a
 * surface that has no route to gate, which buys nothing and changes the one
 * table this lane may not change.
 *
 * **AND THE SERVER REFUSES ANYWAY.** `GET /statutes/:id/linked-judgments`
 * answers `409 CAPABILITY_DISABLED` unless `STATUTE_LINKED_JUDGMENTS_ROUTE=enabled`
 * is set in the API's environment, which it is in none. Observed against the
 * local API at HEAD `c7151dff` on 1 September 2026, not assumed. So even a
 * hand-mounted render of this component reaches `route_held` and says so.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT MAY SAY, AND THE FOUR SENTENCES IT MAY NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The relation is `cites_statute_reference` and nothing more: the judgment's
 * TEXT carries a structurally extracted reference to this provision. The screen
 * renders the server's own `semantics` sentence rather than a heading a
 * designer wrote, because the four natural headings are all false —
 * "cases applying this section", "cases interpreting this section",
 * "cases governed by this section", and anything about the successor
 * provision's case law. Each is a legal conclusion. The data is a citation fact.
 *
 * The tier is the server's default, `resolver_confirmed`, and this screen never
 * asks for `structural_unreviewed`. That tier is 905,853 extractor pins nobody
 * has reviewed; showing them as linked judgments is the failure the citation
 * harness exists to prevent, arriving through a statute-shaped door.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EMPTY STATE IS THE PRIMARY STATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured 1 September 2026, the confirmed tier is empty for EVERY input in the
 * corpus. So the states are built in this order — held, unavailable, not held,
 * withheld-only, none-held — and the answered case is last, because it is the
 * one this corpus cannot currently produce. Each of them says a different
 * sentence, and none of them says "no judgments cite this section".
 */
export function StatuteLinkedJudgmentsScreen({
  statuteId,
  section,
}: {
  statuteId: string;
  section?: { sectionId: string } | { sectionNumber: string };
}) {
  const [result, setResult] = useState<
    ApiResponse<StatuteLinkedJudgmentsResponse> | undefined
  >(undefined);

  useEffect(() => {
    let alive = true;
    /**
     * `evidence` IS NOT PASSED. The tier is whatever the server's default is,
     * rather than whatever this build last believed it to be — and asking for
     * `structural_unreviewed` from a product surface is the one thing this
     * screen must never do.
     */
    void api.statuteLinkedJudgments(statuteId, { section }).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [statuteId, section]);

  const truth = classifyStatuteLinked(result);
  const data = result?.ok === true ? result.data : null;

  const title = data
    ? data.section
      ? `${data.act.shortTitle} · s.${data.section.sectionNumber}`
      : data.act.shortTitle
    : 'Linked judgments';

  return (
    <Screen>
      <View style={styles.head}>
        <Text variant="uiStrong" scale="title">
          {title}
        </Text>
        {data?.section?.heading ? (
          <Text variant="legal" style={styles.meta}>
            {data.section.heading}
          </Text>
        ) : null}
        {/*
          THE SERVER'S SENTENCE, VERBATIM. Not a heading of ours, and not a
          summary of it. `semantics` exists on the wire so the claim on the
          screen is the claim the route makes.
        */}
        {data ? (
          <Text variant="ui" style={styles.meta}>
            {relationSentence(data)}
          </Text>
        ) : null}
      </View>

      {truth === 'loading' ? (
        <View style={styles.list}>
          <SkeletonCard index={0} />
          <SkeletonCard index={1} />
        </View>
      ) : truth === 'route_held' ? (
        /*
          THE EXPECTED ANSWER TODAY. A fact about this release, said as one —
          never as a fact about the provision, and never as a failure. Neutral
          ink: our own readiness is not the law moving.
        */
        <View style={styles.list}>
          <Text variant="uiStrong">This is not part of the current release</Text>
          <Text variant="ui" style={styles.meta}>
            Linked judgments for a section are not available yet. Nothing here says anything about
            what the courts have said on this provision.
          </Text>
        </View>
      ) : truth === 'not_held' ? (
        <View style={styles.list}>
          <Text variant="uiStrong">We do not hold that provision</Text>
          <Text variant="ui" style={styles.meta}>
            {/*
              "WE DO NOT HOLD IT", NEVER "IT DOES NOT EXIST" — the route's own
              distinction. A section absent from our copy of an Act is ambiguous
              between an incomplete ingest and a provision that was never there,
              and neither we nor the route can tell those apart.
            */}
            {result && !result.ok ? result.error.message : ''} We cannot tell you whether it exists
            elsewhere — only that it is not in what we hold.
          </Text>
        </View>
      ) : truth === 'unavailable' ? (
        <View style={styles.list}>
          <Text variant="uiStrong">We could not check</Text>
          <Text variant="ui" style={styles.meta}>
            {/*
              A FAILURE TO ASK IS NOT AN ANSWER OF NO. Same rule the search
              screen runs under: an outage must never read as a corpus gap.
            */}
            {result && !result.ok ? result.error.message : ''} This is not a statement that no
            judgment cites this provision.
          </Text>
        </View>
      ) : truth === 'withheld_only' && data ? (
        /*
          ─────────────────────────────────────────────────────────────────────
          THE STATE THIS WHOLE FILE EXISTS FOR.
          ─────────────────────────────────────────────────────────────────────

          Zero confirmed links, and a `withheld` count that is not zero. We hold
          references from real judgments to this provision and we vouch for none
          of them. Rendering this as "no judgments cite this section" would be
          false about 40,134 judgments on CrPC s.482 alone.

          The counts are printed because a number is the difference between an
          honest withholding and a silent drop. `CITATION_HARNESS.md` sets the
          silent-drop threshold at zero, and this is the same act on a different
          object.
        */
        <View style={styles.list}>
          <Text variant="uiStrong">No confirmed linked judgments</Text>
          <Text variant="ui" style={styles.meta}>
            We hold {withheldReferenceCount(data).toLocaleString('en-IN')} references to this
            provision, across {withheldJudgmentCount(data).toLocaleString('en-IN')} judgments, that
            have not been checked. We are not showing them as linked judgments because nothing has
            confirmed them.
          </Text>
          <Text variant="ui" style={styles.meta}>
            {data.coverage.note}
          </Text>
        </View>
      ) : truth === 'none_held' && data ? (
        <View style={styles.list}>
          <Text variant="uiStrong">We hold no reference to this provision</Text>
          <Text variant="ui" style={styles.meta}>
            {/*
              STILL NOT "NO JUDGMENT CITES IT". Coverage is partial and
              structural — a judgment is reachable here only where the extractor
              recorded a reference AND the court named the Act beside the
              section — so absence in our index is not absence in the law.
            */}
            {data.coverage.note}
          </Text>
        </View>
      ) : data ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={data.links}
          keyExtractor={(l) => l.judgmentId}
          ListHeaderComponent={
            <>
              <SectionRule label="Judgments citing this provision" />
              {/*
                THE ORDERING, STATED. `occurrences DESC` is how often the
                judgment names the provision. It is the cheapest signal that a
                judgment turns on a section rather than passing it, and it is
                NOT relevance, authority or merit — the route says so on the
                wire and a list without the sentence reads as a ranking.
              */}
              <Text variant="ui" style={styles.meta}>
                Ordered by how often each judgment names the provision. That is not a ranking by
                relevance or by authority.
              </Text>
              {unreviewedCount(data.links) > 0 ? (
                <Text variant="ui" style={styles.meta}>
                  {unreviewedCount(data.links).toLocaleString('en-IN')} of these are extractor
                  matches that have not been checked.
                </Text>
              ) : null}
            </>
          }
          ListFooterComponent={
            <>
              {withheldReferenceCount(data) > 0 ? (
                <Text variant="ui" style={styles.footer}>
                  A further {withheldReferenceCount(data).toLocaleString('en-IN')} references to
                  this provision are held and not shown, because nothing has confirmed them.
                </Text>
              ) : null}
              <Text variant="ui" style={styles.footer}>
                {data.coverage.note}
              </Text>
            </>
          }
          renderItem={({ item }) => <LinkedRow row={item} />}
        />
      ) : null}
    </Screen>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE JUDGMENT ON THE PAGE — through the same two helpers every other surface
 * uses, and not one line of its own citation logic.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `citationDisplay` decides what goes in the citation slot. NEVER
 * `row.neutralCitation` raw: 40,980 High Court rows carry none, and
 * interpolating null drew an empty slot that read as the product failing to
 * show something it holds. `citation/adversarial.test.ts` scans for exactly
 * that mistake, and caught this file making it on its first draft.
 *
 * `citationRender` decides the marks. It is called rather than reasoned about,
 * because LAW MOVED must render on EVERY surface — the stale-overruled
 * threshold is zero, and a surface that grows its own opinion about good law is
 * how the fourth opinion appears.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND IT REPORTS A REAL GAP RATHER THAN PAPERING OVER IT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `GET /statutes/:id/linked-judgments` sends `overruledStatus`,
 * `overruledStatusStored`, `precedentialEffect`, `canAddToMatter`,
 * `unappliedTreatment` and `treatmentAttribution` — and NO `verificationState`
 * and no `verifiedBySource`, where `/search` sends both. Read from the route's
 * response construction, not from its handoff note.
 *
 * So `citationRender` receives no verification field and returns UNCONFIRMED,
 * whose own copy is *"This result arrived without its verification fields"* —
 * which is literally what happened. That is the fail-safe direction and it is
 * left standing deliberately: supplying `'verified'` here because the row is a
 * corpus judgment would be a call site quietly manufacturing the reassuring
 * value, which is the defect the adversarial scan's sibling test forbids. The
 * asymmetry is reported to LCC instead.
 */
function LinkedRow({ row }: { row: StatuteLinkedJudgment }) {
  const { existence, moved } = citationRender(row);
  const citation = citationDisplay(row);

  return (
    <Card style={styles.row}>
      <Text variant="legal" scale="cardTitle">
        {row.caseTitle}
      </Text>

      {/* ALL THREE MOVED STATES CARRY A CHIP IN A LIST, `doubted` included. */}
      {moved.kind === 'moved' ? (
        <Text variant="uiStrong" style={styles.moved}>
          {moved.chipLabel}
        </Text>
      ) : null}

      <Text variant="ui" style={styles.meta}>
        {row.court} · {formatJudgmentDate(row.judgmentDate)}
      </Text>

      {/* The citation slot. One helper, four states, never the raw field. */}
      <Text variant="record" style={[styles.meta, !citation.citable && styles.citationAbsent]}>
        {citation.text}
      </Text>

      {/*
        UNVERIFIED IS UNMISSABLE AND VERIFIED IS SILENT. This route sends no
        verification field at all, so every row reads unconfirmed today — which
        is true, and is the finding handed to LCC rather than a default supplied
        here.
      */}
      {existence.kind === 'unconfirmed' ? (
        <Text variant="ui" style={styles.meta}>
          {existence.headline}
        </Text>
      ) : null}

      {/*
        HOW THE COURT ITSELF NAMED THE ACT. Evidence about the link, not
        decoration: `judgment_statute_refs` holds one row per SPELLING, and
        dropping the spellings would make the row unauditable.
      */}
      <Text variant="ui" style={styles.meta}>
        Named as {row.link.actNamedInJudgment.join(', ')} ·{' '}
        {row.link.occurrences.toLocaleString('en-IN')}{' '}
        {row.link.occurrences === 1 ? 'mention' : 'mentions'}
      </Text>

      {/*
        THE ROW'S OWN LABEL, NOT THE REQUEST'S TIER. A mixed row inherits the
        weaker label from the route, so an unreviewed row says so on its own
        face rather than borrowing the page's.
      */}
      {row.link.evidence === 'structural_unreviewed' ? (
        <Text variant="ui" style={styles.meta}>
          Extractor match, not checked.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { padding: space.sm, gap: space.xs },
  list: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  row: { gap: space.xs },
  meta: { color: color.inkMuted },
  footer: { color: color.inkMuted, paddingTop: space.sm },
  moved: { color: color.ink },
  citationAbsent: { color: color.inkFaint },
});
